export const purchasingFinanceCostMigration = `
CREATE TABLE supplier_credits (
 id TEXT PRIMARY KEY NOT NULL, business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
 supplier_id TEXT NOT NULL, purchase_id TEXT NOT NULL, actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 reason TEXT NOT NULL CHECK(length(trim(reason))>0), idempotency_key TEXT NOT NULL,
 credit_minor INTEGER NOT NULL CHECK(credit_minor>=0), lines_json TEXT NOT NULL CHECK(json_valid(lines_json)),
 created_at TEXT NOT NULL, UNIQUE(business_id,idempotency_key),
 FOREIGN KEY(business_id,supplier_id) REFERENCES suppliers(business_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(purchase_id) REFERENCES purchases(id) ON DELETE RESTRICT
);
CREATE TABLE supplier_credit_lines (
 id TEXT PRIMARY KEY NOT NULL, credit_id TEXT NOT NULL REFERENCES supplier_credits(id) ON DELETE RESTRICT,
 purchase_line_id TEXT NOT NULL REFERENCES purchase_lines(id) ON DELETE RESTRICT,
 quantity_scaled INTEGER NOT NULL CHECK(quantity_scaled>0), credit_minor INTEGER NOT NULL CHECK(credit_minor>=0),
 UNIQUE(credit_id,purchase_line_id)
);
CREATE TABLE supplier_payments (
 id TEXT PRIMARY KEY NOT NULL, business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
 supplier_id TEXT NOT NULL, actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 amount_minor INTEGER NOT NULL CHECK(amount_minor>0),
 method TEXT NOT NULL CHECK(method IN ('CASH','UPI','CARD','BANK_TRANSFER','OTHER')),
 reference TEXT NOT NULL DEFAULT '', idempotency_key TEXT NOT NULL, occurred_at TEXT NOT NULL,
 UNIQUE(business_id,idempotency_key),
 FOREIGN KEY(business_id,supplier_id) REFERENCES suppliers(business_id,id) ON DELETE RESTRICT
);
CREATE TABLE invoice_line_costs (
 invoice_line_id TEXT PRIMARY KEY NOT NULL REFERENCES invoice_lines(id) ON DELETE RESTRICT,
 cost_minor INTEGER CHECK(cost_minor IS NULL OR cost_minor>=0),
 unknown_quantity_scaled INTEGER NOT NULL CHECK(unknown_quantity_scaled>=0),
 method TEXT NOT NULL CHECK(method='FIFO'), captured_at TEXT NOT NULL
);
CREATE INDEX idx_supplier_credits_supplier_time ON supplier_credits(business_id,supplier_id,created_at DESC);
CREATE INDEX idx_supplier_payments_supplier_time ON supplier_payments(business_id,supplier_id,occurred_at DESC);
CREATE TRIGGER validate_supplier_credit BEFORE INSERT ON supplier_credits BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM purchases p WHERE p.id=NEW.purchase_id AND p.business_id=NEW.business_id AND p.supplier_id=NEW.supplier_id)
 THEN RAISE(ABORT,'supplier_credit.purchase_mismatch') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.lines_json) j
  LEFT JOIN purchase_lines pl ON pl.id=json_extract(j.value,'$.purchaseLineId')
  WHERE pl.id IS NULL OR pl.purchase_id<>NEW.purchase_id OR json_extract(j.value,'$.quantityScaled')<=0
   OR json_extract(j.value,'$.creditMinor')<0
   OR json_extract(j.value,'$.creditMinor')+coalesce((SELECT sum(scl.credit_minor) FROM supplier_credit_lines scl WHERE scl.purchase_line_id=pl.id),0)>pl.line_total_minor
   OR json_extract(j.value,'$.quantityScaled')+coalesce((SELECT sum(scl.quantity_scaled) FROM supplier_credit_lines scl
    JOIN supplier_credits sc ON sc.id=scl.credit_id WHERE scl.purchase_line_id=pl.id),0)>pl.quantity_scaled)
 THEN RAISE(ABORT,'supplier_credit.quantity_exceeds_purchase') END;
END;
CREATE TRIGGER post_supplier_credit AFTER INSERT ON supplier_credits BEGIN
 INSERT INTO supplier_credit_lines(id,credit_id,purchase_line_id,quantity_scaled,credit_minor)
 SELECT json_extract(j.value,'$.lineId'),NEW.id,json_extract(j.value,'$.purchaseLineId'),
  json_extract(j.value,'$.quantityScaled'),json_extract(j.value,'$.creditMinor') FROM json_each(NEW.lines_json) j;
 INSERT INTO stock_movements(id,business_id,product_id,actor_user_id,movement_type,quantity_delta_scaled,unit_cost_minor,
  source_type,source_id,reason,occurred_at,idempotency_key)
 SELECT json_extract(j.value,'$.movementId'),NEW.business_id,pl.product_id,NEW.actor_user_id,'PURCHASE_RETURN',
  -json_extract(j.value,'$.quantityScaled'),pl.unit_cost_minor,'SUPPLIER_CREDIT',NEW.id,NEW.reason,NEW.created_at,
  'supplier-credit:'||NEW.id||':'||json_extract(j.value,'$.lineId')
 FROM json_each(NEW.lines_json) j JOIN purchase_lines pl ON pl.id=json_extract(j.value,'$.purchaseLineId');
 INSERT INTO audit_events(id,business_id,actor_user_id,action,entity_type,entity_id,occurred_at)
 VALUES(NEW.id||'-audit',NEW.business_id,NEW.actor_user_id,'supplier.credit_issued','supplier_credit',NEW.id,NEW.created_at);
END;
CREATE TRIGGER prevent_supplier_credit_update BEFORE UPDATE ON supplier_credits BEGIN SELECT RAISE(ABORT,'supplier_credits.append_only'); END;
CREATE TRIGGER prevent_supplier_credit_delete BEFORE DELETE ON supplier_credits BEGIN SELECT RAISE(ABORT,'supplier_credits.append_only'); END;
CREATE TRIGGER prevent_supplier_credit_line_update BEFORE UPDATE ON supplier_credit_lines BEGIN SELECT RAISE(ABORT,'supplier_credit_lines.append_only'); END;
CREATE TRIGGER prevent_supplier_credit_line_delete BEFORE DELETE ON supplier_credit_lines BEGIN SELECT RAISE(ABORT,'supplier_credit_lines.append_only'); END;
CREATE TRIGGER validate_supplier_payment BEFORE INSERT ON supplier_payments BEGIN
 SELECT CASE WHEN coalesce((SELECT sum(total_minor) FROM purchases WHERE business_id=NEW.business_id AND supplier_id=NEW.supplier_id),0)
  -coalesce((SELECT sum(credit_minor) FROM supplier_credits WHERE business_id=NEW.business_id AND supplier_id=NEW.supplier_id),0)
  -coalesce((SELECT sum(amount_minor) FROM supplier_payments WHERE business_id=NEW.business_id AND supplier_id=NEW.supplier_id),0)
  <NEW.amount_minor THEN RAISE(ABORT,'supplier_payment.exceeds_outstanding') END;
END;
CREATE TRIGGER audit_supplier_payment AFTER INSERT ON supplier_payments BEGIN
 INSERT INTO audit_events(id,business_id,actor_user_id,action,entity_type,entity_id,occurred_at)
 VALUES(NEW.id||'-audit',NEW.business_id,NEW.actor_user_id,'supplier.payment_recorded','supplier',NEW.supplier_id,NEW.occurred_at);
END;
CREATE TRIGGER prevent_supplier_payment_update BEFORE UPDATE ON supplier_payments BEGIN SELECT RAISE(ABORT,'supplier_payments.append_only'); END;
CREATE TRIGGER prevent_supplier_payment_delete BEFORE DELETE ON supplier_payments BEGIN SELECT RAISE(ABORT,'supplier_payments.append_only'); END;
CREATE TRIGGER prevent_invoice_line_cost_update BEFORE UPDATE ON invoice_line_costs BEGIN SELECT RAISE(ABORT,'invoice_line_costs.append_only'); END;
CREATE TRIGGER prevent_invoice_line_cost_delete BEFORE DELETE ON invoice_line_costs BEGIN SELECT RAISE(ABORT,'invoice_line_costs.append_only'); END;
CREATE TRIGGER snapshot_invoice_fifo_cost BEFORE UPDATE OF status ON invoices
WHEN OLD.status='DRAFT' AND NEW.status='POSTED'
BEGIN
 INSERT INTO invoice_line_costs(invoice_line_id,cost_minor,unknown_quantity_scaled,method,captured_at)
 WITH line_products AS (SELECT DISTINCT product_id FROM invoice_lines WHERE invoice_id=NEW.id),
 movements AS (
  SELECT sm.*,sm.rowid AS movement_rowid,
   sum(CASE WHEN sm.quantity_delta_scaled>0 THEN sm.quantity_delta_scaled ELSE 0 END)
    OVER(PARTITION BY sm.product_id ORDER BY sm.occurred_at,sm.rowid) AS cumulative_in,
   sum(CASE WHEN sm.quantity_delta_scaled<0 THEN -sm.quantity_delta_scaled ELSE 0 END)
    OVER(PARTITION BY sm.product_id) AS total_out
  FROM stock_movements sm JOIN line_products lp ON lp.product_id=sm.product_id
  WHERE sm.business_id=NEW.business_id AND sm.occurred_at<=NEW.posted_at
 ), layers AS (
  SELECT product_id,id,movement_rowid,occurred_at,unit_cost_minor,
   min(quantity_delta_scaled,max(0,cumulative_in-total_out)) AS remaining_scaled
  FROM movements WHERE quantity_delta_scaled>0
 ), ranked AS (
  SELECT *,coalesce(sum(remaining_scaled) OVER(PARTITION BY product_id ORDER BY occurred_at,movement_rowid
   ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS before_scaled
  FROM layers WHERE remaining_scaled>0
 ), invoice_lines_ranked AS (
  SELECT il.id AS invoice_line_id,il.product_id,il.quantity_scaled,il.unit_precision AS precision,
   coalesce(sum(il.quantity_scaled) OVER(PARTITION BY il.product_id ORDER BY il.id
    ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS line_before
  FROM invoice_lines il WHERE il.invoice_id=NEW.id
 ), allocation AS (
  SELECT il.invoice_line_id,il.quantity_scaled,il.precision,l.unit_cost_minor,
   coalesce(max(0,min(l.before_scaled+l.remaining_scaled,il.line_before+il.quantity_scaled)-max(l.before_scaled,il.line_before)),0) AS allocated_scaled
  FROM invoice_lines_ranked il LEFT JOIN ranked l ON l.product_id=il.product_id
 )
 SELECT invoice_line_id,
  sum(CASE WHEN allocated_scaled>0 AND unit_cost_minor IS NOT NULL THEN (allocated_scaled*unit_cost_minor +
    CASE precision WHEN 0 THEN 0 WHEN 1 THEN 5 WHEN 2 THEN 50 WHEN 3 THEN 500 WHEN 4 THEN 5000 WHEN 5 THEN 50000 ELSE 500000 END) /
    CASE precision WHEN 0 THEN 1 WHEN 1 THEN 10 WHEN 2 THEN 100 WHEN 3 THEN 1000 WHEN 4 THEN 10000 WHEN 5 THEN 100000 ELSE 1000000 END ELSE 0 END),
  sum(CASE WHEN allocated_scaled>0 AND unit_cost_minor IS NULL THEN allocated_scaled ELSE 0 END)+max(0,max(quantity_scaled)-sum(allocated_scaled)),'FIFO',NEW.posted_at FROM allocation GROUP BY invoice_line_id;
END;
DROP TRIGGER post_return_stock;
CREATE TRIGGER post_return_stock AFTER INSERT ON invoice_return_lines WHEN NEW.disposition='RESTOCK' BEGIN
 INSERT INTO stock_movements(id,business_id,product_id,actor_user_id,movement_type,quantity_delta_scaled,unit_cost_minor,
  source_type,source_id,reason,occurred_at,idempotency_key)
 SELECT lower(hex(randomblob(16))),r.business_id,il.product_id,r.actor_user_id,'SALE_RETURN',NEW.quantity_scaled,
  clc.cost_minor,'RETURN',r.id,r.reason,r.created_at,'return:'||r.id||':'||NEW.id
 FROM invoice_returns r JOIN invoice_lines il ON il.id=NEW.invoice_line_id
 LEFT JOIN invoice_line_costs clc ON clc.invoice_line_id=il.id WHERE r.id=NEW.return_id;
END;
DROP TRIGGER reverse_cancelled_invoice;
CREATE TRIGGER reverse_cancelled_invoice AFTER UPDATE OF status ON invoices
WHEN OLD.status='POSTED' AND NEW.status='CANCELLED'
BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM invoice_returns WHERE invoice_id=NEW.id) THEN RAISE(ABORT,'invoice.cancel_after_return') END;
 INSERT INTO stock_movements(id,business_id,product_id,actor_user_id,movement_type,quantity_delta_scaled,unit_cost_minor,
  source_type,source_id,reason,occurred_at,idempotency_key)
 SELECT lower(hex(randomblob(16))),NEW.business_id,il.product_id,NEW.actor_user_id,'CANCELLATION',il.quantity_scaled,
  clc.cost_minor,'INVOICE_CANCELLATION',NEW.id,NEW.cancellation_reason,NEW.cancelled_at,'cancel:'||NEW.id||':'||il.id
 FROM invoice_lines il LEFT JOIN invoice_line_costs clc ON clc.invoice_line_id=il.id WHERE il.invoice_id=NEW.id;
 INSERT INTO payments(id,business_id,invoice_id,actor_user_id,payment_type,amount_minor,reason,idempotency_key,occurred_at)
 SELECT lower(hex(randomblob(16))),NEW.business_id,NEW.id,NEW.actor_user_id,'REFUND',-sum(amount_minor),
  NEW.cancellation_reason,'cancel-refund:'||NEW.id,NEW.cancelled_at FROM payments
 WHERE invoice_id=NEW.id HAVING sum(amount_minor)>0;
END;
PRAGMA user_version=5;
`;
