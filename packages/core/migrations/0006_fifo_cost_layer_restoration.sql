CREATE TABLE fifo_cost_migration_baseline (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  max_stock_movement_rowid INTEGER NOT NULL CHECK(max_stock_movement_rowid >= 0)
);
INSERT INTO fifo_cost_migration_baseline(id,max_stock_movement_rowid)
SELECT 1,coalesce(max(rowid),0) FROM stock_movements;

CREATE TABLE invoice_line_cost_layers (
  invoice_line_id TEXT NOT NULL REFERENCES invoice_lines(id) ON DELETE RESTRICT,
  layer_index INTEGER NOT NULL CHECK(layer_index >= 0),
  quantity_scaled INTEGER NOT NULL CHECK(quantity_scaled > 0),
  unit_cost_minor INTEGER CHECK(unit_cost_minor IS NULL OR unit_cost_minor >= 0),
  source_stock_movement_id TEXT REFERENCES stock_movements(id) ON DELETE RESTRICT,
  PRIMARY KEY(invoice_line_id,layer_index)
);
CREATE INDEX idx_invoice_cost_layers_source ON invoice_line_cost_layers(source_stock_movement_id);

CREATE TABLE invoice_return_cost_layers (
  return_line_id TEXT NOT NULL REFERENCES invoice_return_lines(id) ON DELETE RESTRICT,
  invoice_line_id TEXT NOT NULL REFERENCES invoice_lines(id) ON DELETE RESTRICT,
  layer_index INTEGER NOT NULL CHECK(layer_index >= 0),
  quantity_scaled INTEGER NOT NULL CHECK(quantity_scaled > 0),
  unit_cost_minor INTEGER CHECK(unit_cost_minor IS NULL OR unit_cost_minor >= 0),
  source_stock_movement_id TEXT REFERENCES stock_movements(id) ON DELETE RESTRICT,
  PRIMARY KEY(return_line_id,layer_index)
);
CREATE INDEX idx_return_cost_layers_invoice_line ON invoice_return_cost_layers(invoice_line_id);

CREATE TABLE stock_layer_restorations (
  movement_id TEXT PRIMARY KEY NOT NULL REFERENCES stock_movements(id) ON DELETE RESTRICT,
  origin_stock_movement_id TEXT NOT NULL REFERENCES stock_movements(id) ON DELETE RESTRICT,
  quantity_scaled INTEGER NOT NULL CHECK(quantity_scaled > 0)
);
CREATE TRIGGER prevent_invoice_cost_layer_update BEFORE UPDATE ON invoice_line_cost_layers BEGIN SELECT RAISE(ABORT,'invoice_line_cost_layers.append_only'); END;
CREATE TRIGGER prevent_invoice_cost_layer_delete BEFORE DELETE ON invoice_line_cost_layers BEGIN SELECT RAISE(ABORT,'invoice_line_cost_layers.append_only'); END;
CREATE TRIGGER prevent_return_cost_layer_update BEFORE UPDATE ON invoice_return_cost_layers BEGIN SELECT RAISE(ABORT,'invoice_return_cost_layers.append_only'); END;
CREATE TRIGGER prevent_return_cost_layer_delete BEFORE DELETE ON invoice_return_cost_layers BEGIN SELECT RAISE(ABORT,'invoice_return_cost_layers.append_only'); END;
CREATE TRIGGER prevent_stock_layer_restoration_update BEFORE UPDATE ON stock_layer_restorations BEGIN SELECT RAISE(ABORT,'stock_layer_restorations.append_only'); END;
CREATE TRIGGER prevent_stock_layer_restoration_delete BEFORE DELETE ON stock_layer_restorations BEGIN SELECT RAISE(ABORT,'stock_layer_restorations.append_only'); END;

DROP TRIGGER snapshot_invoice_fifo_cost;
CREATE TRIGGER snapshot_invoice_fifo_cost BEFORE UPDATE OF status ON invoices
WHEN OLD.status='DRAFT' AND NEW.status='POSTED'
BEGIN
 INSERT INTO invoice_line_cost_layers(invoice_line_id,layer_index,quantity_scaled,unit_cost_minor,source_stock_movement_id)
 WITH line_products AS (SELECT DISTINCT product_id FROM invoice_lines WHERE invoice_id=NEW.id),
 movements AS (
  SELECT sm.id AS movement_id,sm.product_id,sm.quantity_delta_scaled,sm.occurred_at,sm.rowid AS movement_rowid,
   CASE WHEN sm.rowid<=b.max_stock_movement_rowid AND sm.source_type IN ('RETURN','INVOICE_CANCELLATION') THEN NULL ELSE sm.unit_cost_minor END AS layer_cost,
   sum(CASE WHEN sm.quantity_delta_scaled>0 THEN sm.quantity_delta_scaled ELSE 0 END) OVER(PARTITION BY sm.product_id ORDER BY sm.occurred_at,sm.rowid) AS cumulative_in,
   sum(CASE WHEN sm.quantity_delta_scaled<0 THEN -sm.quantity_delta_scaled ELSE 0 END) OVER(PARTITION BY sm.product_id) AS total_out
  FROM stock_movements sm JOIN line_products lp ON lp.product_id=sm.product_id CROSS JOIN fifo_cost_migration_baseline b
  WHERE sm.business_id=NEW.business_id AND sm.occurred_at<=NEW.posted_at
 ), layers AS (
  SELECT movement_id,product_id,movement_rowid,occurred_at,layer_cost,
   min(quantity_delta_scaled,max(0,cumulative_in-total_out)) AS remaining_scaled
  FROM movements WHERE quantity_delta_scaled>0
 ), ranked AS (
  SELECT *,coalesce(sum(remaining_scaled) OVER(PARTITION BY product_id ORDER BY occurred_at,movement_rowid ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS before_scaled
  FROM layers WHERE remaining_scaled>0
 ), invoice_lines_ranked AS (
  SELECT il.id AS invoice_line_id,il.product_id,il.quantity_scaled,il.unit_precision AS precision,il.rowid AS line_rowid,
   coalesce(sum(il.quantity_scaled) OVER(PARTITION BY il.product_id ORDER BY il.rowid ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS line_before
  FROM invoice_lines il WHERE il.invoice_id=NEW.id
 ), allocation AS (
  SELECT il.invoice_line_id,il.quantity_scaled,il.line_rowid,l.movement_id,l.layer_cost,l.before_scaled,
   coalesce(max(0,min(l.before_scaled+l.remaining_scaled,il.line_before+il.quantity_scaled)-max(l.before_scaled,il.line_before)),0) AS allocated_scaled
  FROM invoice_lines_ranked il LEFT JOIN ranked l ON l.product_id=il.product_id
 ), numbered AS (
  SELECT invoice_line_id,movement_id,layer_cost,allocated_scaled,
   row_number() OVER(PARTITION BY invoice_line_id ORDER BY before_scaled,movement_id)-1 AS layer_index
  FROM allocation WHERE allocated_scaled>0
 )
 SELECT invoice_line_id,layer_index,allocated_scaled,layer_cost,movement_id FROM numbered;

 INSERT INTO invoice_line_cost_layers(invoice_line_id,layer_index,quantity_scaled,unit_cost_minor,source_stock_movement_id)
 SELECT il.id,coalesce((SELECT max(l.layer_index)+1 FROM invoice_line_cost_layers l WHERE l.invoice_line_id=il.id),0),
  il.quantity_scaled-coalesce((SELECT sum(l.quantity_scaled) FROM invoice_line_cost_layers l WHERE l.invoice_line_id=il.id),0),NULL,NULL
 FROM invoice_lines il WHERE il.invoice_id=NEW.id
  AND il.quantity_scaled>coalesce((SELECT sum(l.quantity_scaled) FROM invoice_line_cost_layers l WHERE l.invoice_line_id=il.id),0);

 INSERT INTO invoice_line_costs(invoice_line_id,cost_minor,unknown_quantity_scaled,method,captured_at)
 SELECT il.id,
  sum(CASE WHEN l.unit_cost_minor IS NULL THEN 0 ELSE
   (l.quantity_scaled*l.unit_cost_minor + CASE il.unit_precision WHEN 0 THEN 0 WHEN 1 THEN 5 WHEN 2 THEN 50 WHEN 3 THEN 500 WHEN 4 THEN 5000 WHEN 5 THEN 50000 ELSE 500000 END) /
   CASE il.unit_precision WHEN 0 THEN 1 WHEN 1 THEN 10 WHEN 2 THEN 100 WHEN 3 THEN 1000 WHEN 4 THEN 10000 WHEN 5 THEN 100000 ELSE 1000000 END END),
  sum(CASE WHEN l.unit_cost_minor IS NULL THEN l.quantity_scaled ELSE 0 END),'FIFO',NEW.posted_at
 FROM invoice_lines il JOIN invoice_line_cost_layers l ON l.invoice_line_id=il.id WHERE il.invoice_id=NEW.id GROUP BY il.id;
END;

DROP TRIGGER post_return_stock;
CREATE TRIGGER post_return_stock AFTER INSERT ON invoice_return_lines WHEN NEW.disposition='RESTOCK' BEGIN
 -- Returned units are assigned across the sold FIFO layers in order; the app has no serial-level identity.
 INSERT INTO invoice_return_cost_layers(return_line_id,invoice_line_id,layer_index,quantity_scaled,unit_cost_minor,source_stock_movement_id)
 WITH prior AS (
  SELECT coalesce(sum(quantity_scaled),0) AS quantity_scaled FROM invoice_return_lines
  WHERE invoice_line_id=NEW.invoice_line_id AND id<>NEW.id
 ), ranked AS (
  SELECT l.*,coalesce(sum(l.quantity_scaled) OVER(PARTITION BY l.invoice_line_id ORDER BY l.layer_index ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS layer_before
  FROM invoice_line_cost_layers l WHERE l.invoice_line_id=NEW.invoice_line_id
 ), overlap AS (
  SELECT r.*,max(0,min(r.layer_before+r.quantity_scaled,p.quantity_scaled+NEW.quantity_scaled)-max(r.layer_before,p.quantity_scaled)) AS returned_scaled
  FROM ranked r CROSS JOIN prior p
 )
 SELECT NEW.id,NEW.invoice_line_id,layer_index,returned_scaled,unit_cost_minor,source_stock_movement_id FROM overlap WHERE returned_scaled>0;

 INSERT INTO invoice_return_cost_layers(return_line_id,invoice_line_id,layer_index,quantity_scaled,unit_cost_minor,source_stock_movement_id)
 SELECT NEW.id,NEW.invoice_line_id,coalesce((SELECT max(layer_index)+1 FROM invoice_return_cost_layers WHERE return_line_id=NEW.id),0),
  NEW.quantity_scaled-coalesce((SELECT sum(quantity_scaled) FROM invoice_return_cost_layers WHERE return_line_id=NEW.id),0),NULL,NULL
 WHERE NEW.quantity_scaled>coalesce((SELECT sum(quantity_scaled) FROM invoice_return_cost_layers WHERE return_line_id=NEW.id),0);

 INSERT INTO stock_movements(id,business_id,product_id,actor_user_id,movement_type,quantity_delta_scaled,unit_cost_minor,source_type,source_id,reason,occurred_at,idempotency_key)
 SELECT lower(hex(randomblob(16))),r.business_id,il.product_id,r.actor_user_id,'SALE_RETURN',rcl.quantity_scaled,rcl.unit_cost_minor,
  'RETURN',r.id,r.reason,r.created_at,'return:'||r.id||':'||NEW.id||':'||rcl.layer_index
 FROM invoice_return_cost_layers rcl JOIN invoice_returns r ON r.id=NEW.return_id JOIN invoice_lines il ON il.id=NEW.invoice_line_id
 WHERE rcl.return_line_id=NEW.id;

 INSERT INTO stock_layer_restorations(movement_id,origin_stock_movement_id,quantity_scaled)
 SELECT sm.id,rcl.source_stock_movement_id,sm.quantity_delta_scaled
 FROM invoice_return_cost_layers rcl JOIN stock_movements sm ON sm.idempotency_key='return:'||NEW.return_id||':'||NEW.id||':'||rcl.layer_index
 WHERE rcl.return_line_id=NEW.id AND rcl.source_stock_movement_id IS NOT NULL;
END;

DROP TRIGGER reverse_cancelled_invoice;
CREATE TRIGGER reverse_cancelled_invoice AFTER UPDATE OF status ON invoices
WHEN OLD.status='POSTED' AND NEW.status='CANCELLED'
BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM invoice_returns WHERE invoice_id=NEW.id) THEN RAISE(ABORT,'invoice.cancel_after_return') END;
 INSERT INTO stock_movements(id,business_id,product_id,actor_user_id,movement_type,quantity_delta_scaled,unit_cost_minor,source_type,source_id,reason,occurred_at,idempotency_key)
 SELECT lower(hex(randomblob(16))),NEW.business_id,il.product_id,NEW.actor_user_id,'CANCELLATION',l.quantity_scaled,l.unit_cost_minor,
  'INVOICE_CANCELLATION',NEW.id,NEW.cancellation_reason,NEW.cancelled_at,'cancel:'||NEW.id||':'||il.id||':'||l.layer_index
 FROM invoice_lines il JOIN invoice_line_cost_layers l ON l.invoice_line_id=il.id WHERE il.invoice_id=NEW.id;
 INSERT INTO stock_movements(id,business_id,product_id,actor_user_id,movement_type,quantity_delta_scaled,unit_cost_minor,source_type,source_id,reason,occurred_at,idempotency_key)
 SELECT lower(hex(randomblob(16))),NEW.business_id,il.product_id,NEW.actor_user_id,'CANCELLATION',il.quantity_scaled,NULL,
  'INVOICE_CANCELLATION',NEW.id,NEW.cancellation_reason,NEW.cancelled_at,'cancel:'||NEW.id||':'||il.id||':unknown'
 FROM invoice_lines il WHERE il.invoice_id=NEW.id AND NOT EXISTS(SELECT 1 FROM invoice_line_cost_layers l WHERE l.invoice_line_id=il.id);
 INSERT INTO stock_layer_restorations(movement_id,origin_stock_movement_id,quantity_scaled)
 SELECT sm.id,l.source_stock_movement_id,sm.quantity_delta_scaled FROM invoice_line_cost_layers l
 JOIN stock_movements sm ON sm.idempotency_key='cancel:'||NEW.id||':'||l.invoice_line_id||':'||l.layer_index
 WHERE l.source_stock_movement_id IS NOT NULL;
 INSERT INTO payments(id,business_id,invoice_id,actor_user_id,payment_type,amount_minor,reason,idempotency_key,occurred_at)
 SELECT lower(hex(randomblob(16))),NEW.business_id,NEW.id,NEW.actor_user_id,'REFUND',-sum(amount_minor),NEW.cancellation_reason,'cancel-refund:'||NEW.id,NEW.cancelled_at
 FROM payments WHERE invoice_id=NEW.id HAVING sum(amount_minor)>0;
END;

PRAGMA user_version=6;
