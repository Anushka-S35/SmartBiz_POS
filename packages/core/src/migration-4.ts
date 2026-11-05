export const supplierPurchasingMigration = `
CREATE TABLE suppliers (
  id TEXT PRIMARY KEY NOT NULL,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  normalized_name TEXT NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (business_id, normalized_name),
  UNIQUE (business_id, id)
);
CREATE TABLE purchases (
  id TEXT PRIMARY KEY NOT NULL,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  supplier_id TEXT NOT NULL,
  reference_number TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  lines_json TEXT NOT NULL CHECK (json_valid(lines_json)),
  created_at TEXT NOT NULL,
  UNIQUE (business_id, idempotency_key),
  UNIQUE (business_id, supplier_id, reference_number),
  FOREIGN KEY (business_id, supplier_id) REFERENCES suppliers(business_id, id) ON DELETE RESTRICT
);
CREATE TABLE purchase_lines (
  id TEXT PRIMARY KEY NOT NULL,
  purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name_snapshot TEXT NOT NULL,
  sku_snapshot TEXT NOT NULL,
  unit_name_snapshot TEXT NOT NULL,
  unit_precision INTEGER NOT NULL CHECK (unit_precision BETWEEN 0 AND 6),
  quantity_scaled INTEGER NOT NULL CHECK (quantity_scaled > 0),
  unit_cost_minor INTEGER NOT NULL CHECK (unit_cost_minor >= 0),
  line_total_minor INTEGER NOT NULL CHECK (line_total_minor >= 0)
);
CREATE INDEX idx_purchases_supplier_date ON purchases(business_id, supplier_id, created_at DESC);
CREATE INDEX idx_purchase_lines_product ON purchase_lines(product_id);
CREATE TRIGGER validate_purchase_products BEFORE INSERT ON purchases
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.lines_json) j
    LEFT JOIN products p ON p.id = json_extract(j.value, '$.productId')
      AND p.business_id = NEW.business_id AND p.archived_at IS NULL AND p.is_active = 1
    WHERE p.id IS NULL
  ) THEN RAISE(ABORT, 'purchase.invalid_product') END;
END;
CREATE TRIGGER receive_purchase AFTER INSERT ON purchases
BEGIN
  INSERT INTO purchase_lines (id, purchase_id, product_id, product_name_snapshot, sku_snapshot,
    unit_name_snapshot, unit_precision, quantity_scaled, unit_cost_minor, line_total_minor)
  SELECT json_extract(j.value, '$.lineId'), NEW.id, p.id, p.name, p.sku,
    p.unit_name_snapshot, p.unit_precision_snapshot,
    json_extract(j.value, '$.quantityScaled'), json_extract(j.value, '$.unitCostMinor'),
    json_extract(j.value, '$.lineTotalMinor')
  FROM json_each(NEW.lines_json) j JOIN products p ON p.id = json_extract(j.value, '$.productId');
  INSERT INTO audit_events (id, business_id, actor_user_id, action, entity_type, entity_id, occurred_at)
  VALUES (NEW.id || '-audit', NEW.business_id, NEW.actor_user_id, 'purchase.received', 'purchase', NEW.id, NEW.created_at);
  INSERT INTO stock_movements (id, business_id, product_id, actor_user_id, movement_type,
    quantity_delta_scaled, unit_cost_minor, source_type, source_id, reason, occurred_at, idempotency_key)
  SELECT json_extract(j.value, '$.movementId'), NEW.business_id, json_extract(j.value, '$.productId'),
    NEW.actor_user_id, 'PURCHASE_IN', json_extract(j.value, '$.quantityScaled'),
    json_extract(j.value, '$.unitCostMinor'), 'PURCHASE', NEW.id,
    'Purchase ' || NEW.reference_number, NEW.created_at,
    'purchase:' || NEW.id || ':' || json_extract(j.value, '$.productId') || ':' || json_extract(j.value, '$.lineId')
  FROM json_each(NEW.lines_json) j;
END;
CREATE TRIGGER prevent_purchase_update BEFORE UPDATE ON purchases BEGIN SELECT RAISE(ABORT, 'purchases.append_only'); END;
CREATE TRIGGER prevent_purchase_delete BEFORE DELETE ON purchases BEGIN SELECT RAISE(ABORT, 'purchases.append_only'); END;
CREATE TRIGGER prevent_purchase_line_update BEFORE UPDATE ON purchase_lines BEGIN SELECT RAISE(ABORT, 'purchase_lines.append_only'); END;
CREATE TRIGGER prevent_purchase_line_delete BEFORE DELETE ON purchase_lines BEGIN SELECT RAISE(ABORT, 'purchase_lines.append_only'); END;
PRAGMA user_version = 4;
`;
