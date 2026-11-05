export const inventoryCustomersBillingMigration = `CREATE TABLE customers (
  id TEXT PRIMARY KEY NOT NULL,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  normalized_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  normalized_phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (business_id, id)
);
CREATE INDEX idx_customers_business_name ON customers(business_id, normalized_name);
CREATE INDEX idx_customers_business_phone ON customers(business_id, normalized_phone);

CREATE TABLE stock_movements (
  id TEXT PRIMARY KEY NOT NULL,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'OPENING', 'PURCHASE_IN', 'MANUAL_IN', 'MANUAL_OUT', 'ADJUSTMENT',
    'SALE', 'SALE_RETURN', 'PURCHASE_RETURN', 'CANCELLATION'
  )),
  quantity_delta_scaled INTEGER NOT NULL CHECK (quantity_delta_scaled <> 0),
  unit_cost_minor INTEGER CHECK (unit_cost_minor IS NULL OR unit_cost_minor >= 0),
  source_type TEXT NOT NULL,
  source_id TEXT,
  reason TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  UNIQUE (business_id, idempotency_key)
);
CREATE INDEX idx_stock_movement_product_time ON stock_movements(business_id, product_id, occurred_at);
CREATE INDEX idx_stock_movement_source ON stock_movements(business_id, source_type, source_id);
CREATE UNIQUE INDEX idx_stock_movement_single_opening
  ON stock_movements(business_id, product_id) WHERE movement_type = 'OPENING';

CREATE TABLE tax_rates (
  id TEXT PRIMARY KEY NOT NULL,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  category_code TEXT NOT NULL,
  rate_basis_points INTEGER NOT NULL CHECK (rate_basis_points BETWEEN 0 AND 10000),
  effective_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_tax_rates_category_effective ON tax_rates(business_id, category_code, effective_at DESC);
CREATE TRIGGER prevent_tax_rate_update
BEFORE UPDATE ON tax_rates
BEGIN
  SELECT RAISE(ABORT, 'tax_rates.append_only');
END;
CREATE TRIGGER prevent_tax_rate_delete
BEFORE DELETE ON tax_rates
BEGIN
  SELECT RAISE(ABORT, 'tax_rates.append_only');
END;

CREATE TABLE invoices (
  id TEXT PRIMARY KEY NOT NULL,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  customer_id TEXT,
  invoice_number TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'POSTED', 'CANCELLED')),
  subtotal_minor INTEGER NOT NULL CHECK (subtotal_minor >= 0),
  discount_minor INTEGER NOT NULL CHECK (discount_minor >= 0),
  tax_minor INTEGER NOT NULL CHECK (tax_minor >= 0),
  total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
  idempotency_key TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  draft_lines_json TEXT NOT NULL CHECK (json_valid(draft_lines_json)),
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  posted_at TEXT,
  cancelled_at TEXT,
  cancellation_reason TEXT NOT NULL DEFAULT '',
  UNIQUE (business_id, invoice_number),
  UNIQUE (business_id, idempotency_key),
  FOREIGN KEY (business_id, customer_id) REFERENCES customers(business_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_invoices_business_date ON invoices(business_id, created_at DESC);
CREATE INDEX idx_invoices_customer_date ON invoices(customer_id, created_at DESC);

CREATE TABLE invoice_lines (
  id TEXT PRIMARY KEY NOT NULL,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name_snapshot TEXT NOT NULL,
  sku_snapshot TEXT NOT NULL,
  barcode_snapshot TEXT,
  unit_name_snapshot TEXT NOT NULL,
  unit_precision INTEGER NOT NULL CHECK (unit_precision BETWEEN 0 AND 6),
  quantity_scaled INTEGER NOT NULL CHECK (quantity_scaled > 0),
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
  discount_minor INTEGER NOT NULL CHECK (discount_minor >= 0),
  tax_rate_basis_points INTEGER NOT NULL CHECK (tax_rate_basis_points BETWEEN 0 AND 10000),
  line_subtotal_minor INTEGER NOT NULL CHECK (line_subtotal_minor >= 0),
  tax_minor INTEGER NOT NULL CHECK (tax_minor >= 0),
  line_total_minor INTEGER NOT NULL CHECK (line_total_minor >= 0),
  UNIQUE (invoice_id, id)
);
CREATE INDEX idx_invoice_lines_invoice ON invoice_lines(invoice_id);
CREATE INDEX idx_invoice_lines_product ON invoice_lines(product_id);

CREATE TABLE payments (
  id TEXT PRIMARY KEY NOT NULL,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CREDIT', 'REFUND')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor <> 0),
  reference TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  UNIQUE (business_id, idempotency_key)
);
CREATE INDEX idx_payments_invoice_time ON payments(invoice_id, occurred_at);

CREATE TABLE invoice_returns (
  id TEXT PRIMARY KEY NOT NULL,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  refund_minor INTEGER NOT NULL CHECK (refund_minor >= 0),
  lines_json TEXT NOT NULL CHECK (json_valid(lines_json)),
  created_at TEXT NOT NULL,
  UNIQUE (business_id, idempotency_key)
);

CREATE TABLE invoice_return_lines (
  id TEXT PRIMARY KEY NOT NULL,
  return_id TEXT NOT NULL REFERENCES invoice_returns(id) ON DELETE RESTRICT,
  invoice_line_id TEXT NOT NULL REFERENCES invoice_lines(id) ON DELETE RESTRICT,
  quantity_scaled INTEGER NOT NULL CHECK (quantity_scaled > 0),
  disposition TEXT NOT NULL CHECK (disposition IN ('RESTOCK', 'DAMAGED', 'QUARANTINE')),
  UNIQUE (return_id, invoice_line_id)
);
CREATE TRIGGER prevent_invoice_return_update
BEFORE UPDATE ON invoice_returns
BEGIN
  SELECT RAISE(ABORT, 'invoice_returns.append_only');
END;
CREATE TRIGGER prevent_invoice_return_delete
BEFORE DELETE ON invoice_returns
BEGIN
  SELECT RAISE(ABORT, 'invoice_returns.append_only');
END;
CREATE TRIGGER prevent_invoice_return_line_update
BEFORE UPDATE ON invoice_return_lines
BEGIN
  SELECT RAISE(ABORT, 'invoice_return_lines.append_only');
END;
CREATE TRIGGER prevent_invoice_return_line_delete
BEFORE DELETE ON invoice_return_lines
BEGIN
  SELECT RAISE(ABORT, 'invoice_return_lines.append_only');
END;

CREATE TRIGGER validate_stock_movement
BEFORE INSERT ON stock_movements
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM products WHERE id = NEW.product_id AND business_id = NEW.business_id
  ) THEN RAISE(ABORT, 'stock.product_business_mismatch') END;
  SELECT CASE WHEN coalesce((SELECT sum(quantity_delta_scaled) FROM stock_movements
    WHERE business_id = NEW.business_id AND product_id = NEW.product_id), 0)
    + NEW.quantity_delta_scaled < 0
    THEN RAISE(ABORT, 'stock.negative_stock') END;
END;
CREATE TRIGGER prevent_stock_movement_update
BEFORE UPDATE ON stock_movements
BEGIN
  SELECT RAISE(ABORT, 'stock_movements.append_only');
END;
CREATE TRIGGER prevent_stock_movement_delete
BEFORE DELETE ON stock_movements
BEGIN
  SELECT RAISE(ABORT, 'stock_movements.append_only');
END;
CREATE TRIGGER audit_stock_movement
AFTER INSERT ON stock_movements
BEGIN
  INSERT INTO audit_events (id, business_id, actor_user_id, action, entity_type, entity_id, occurred_at)
  VALUES (lower(hex(randomblob(16))), NEW.business_id, NEW.actor_user_id,
    'stock.' || lower(NEW.movement_type), 'product', NEW.product_id, NEW.occurred_at);
END;

CREATE TRIGGER validate_invoice_line_insert
BEFORE INSERT ON invoice_lines
BEGIN
  SELECT CASE WHEN (SELECT status FROM invoices WHERE id = NEW.invoice_id) <> 'DRAFT'
    THEN RAISE(ABORT, 'invoice.not_draft') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM products p JOIN invoices i ON i.id = NEW.invoice_id
    WHERE p.id = NEW.product_id AND p.business_id = i.business_id
  ) THEN RAISE(ABORT, 'invoice.product_business_mismatch') END;
END;
CREATE TRIGGER prevent_invoice_line_update
BEFORE UPDATE ON invoice_lines
BEGIN
  SELECT RAISE(ABORT, 'invoice_lines.append_only');
END;
CREATE TRIGGER prevent_invoice_line_delete
BEFORE DELETE ON invoice_lines
BEGIN
  SELECT RAISE(ABORT, 'invoice_lines.append_only');
END;
CREATE TRIGGER populate_invoice_lines
AFTER INSERT ON invoices
BEGIN
  INSERT INTO invoice_lines (
    id, invoice_id, product_id, product_name_snapshot, sku_snapshot,
    barcode_snapshot, unit_name_snapshot, unit_precision, quantity_scaled,
    unit_price_minor, discount_minor, tax_rate_basis_points,
    line_subtotal_minor, tax_minor, line_total_minor
  )
  SELECT json_extract(value, '$.id'), NEW.id,
    json_extract(value, '$.productId'), json_extract(value, '$.productName'),
    json_extract(value, '$.sku'), json_extract(value, '$.barcode'),
    json_extract(value, '$.unitName'), json_extract(value, '$.unitPrecision'),
    json_extract(value, '$.quantityScaled'), json_extract(value, '$.unitPriceMinor'),
    json_extract(value, '$.discountMinor'), json_extract(value, '$.taxRate'),
    json_extract(value, '$.subtotalMinor'), json_extract(value, '$.taxMinor'),
    json_extract(value, '$.totalMinor')
  FROM json_each(NEW.draft_lines_json);
END;

CREATE TRIGGER validate_payment_insert
BEFORE INSERT ON payments
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM invoices WHERE id = NEW.invoice_id AND business_id = NEW.business_id
      AND (status = 'POSTED' OR (status = 'CANCELLED' AND NEW.amount_minor < 0))
  ) THEN RAISE(ABORT, 'payment.invoice_not_payable') END;
  SELECT CASE WHEN NEW.amount_minor > 0 AND
    coalesce((SELECT sum(amount_minor) FROM payments WHERE invoice_id = NEW.invoice_id), 0)
      + NEW.amount_minor > (SELECT total_minor FROM invoices WHERE id = NEW.invoice_id)
    THEN RAISE(ABORT, 'payment.exceeds_due') END;
  SELECT CASE WHEN NEW.amount_minor < 0 AND NEW.payment_type <> 'REFUND'
    THEN RAISE(ABORT, 'payment.invalid_reversal') END;
  SELECT CASE WHEN NEW.amount_minor < 0 AND
    -NEW.amount_minor > coalesce((SELECT sum(amount_minor) FROM payments
      WHERE invoice_id = NEW.invoice_id), 0)
    THEN RAISE(ABORT, 'payment.refund_exceeds_paid') END;
END;
CREATE TRIGGER prevent_payment_update
BEFORE UPDATE ON payments
BEGIN
  SELECT RAISE(ABORT, 'payments.append_only');
END;
CREATE TRIGGER prevent_payment_delete
BEFORE DELETE ON payments
BEGIN
  SELECT RAISE(ABORT, 'payments.append_only');
END;
CREATE TRIGGER audit_payment
AFTER INSERT ON payments
BEGIN
  INSERT INTO audit_events (id, business_id, actor_user_id, action, entity_type, entity_id, occurred_at)
  VALUES (lower(hex(randomblob(16))), NEW.business_id, NEW.actor_user_id,
    CASE WHEN NEW.amount_minor < 0 THEN 'payment.refunded' ELSE 'payment.recorded' END,
    'invoice', NEW.invoice_id, NEW.occurred_at);
END;
CREATE TRIGGER audit_invoice_return
AFTER INSERT ON invoice_returns
BEGIN
  INSERT INTO audit_events (id, business_id, actor_user_id, action, entity_type, entity_id, occurred_at)
  VALUES (lower(hex(randomblob(16))), NEW.business_id, NEW.actor_user_id,
    'invoice.returned', 'invoice', NEW.invoice_id, NEW.created_at);
END;

CREATE TRIGGER validate_invoice_post
BEFORE UPDATE OF status ON invoices
WHEN OLD.status = 'DRAFT' AND NEW.status = 'POSTED'
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM invoice_lines WHERE invoice_id = OLD.id)
    THEN RAISE(ABORT, 'invoice.empty') END;
  SELECT CASE WHEN coalesce((SELECT sum(line_subtotal_minor) FROM invoice_lines WHERE invoice_id = OLD.id), 0)
      <> NEW.subtotal_minor
    OR coalesce((SELECT sum(discount_minor) FROM invoice_lines WHERE invoice_id = OLD.id), 0)
      <> NEW.discount_minor
    OR coalesce((SELECT sum(tax_minor) FROM invoice_lines WHERE invoice_id = OLD.id), 0)
      <> NEW.tax_minor
    OR coalesce((SELECT sum(line_total_minor) FROM invoice_lines WHERE invoice_id = OLD.id), 0)
      <> NEW.total_minor
    THEN RAISE(ABORT, 'invoice.totals_mismatch') END;
  SELECT CASE WHEN (SELECT tax_enabled FROM businesses WHERE id = OLD.business_id) = 0
      AND EXISTS (SELECT 1 FROM invoice_lines WHERE invoice_id = OLD.id AND tax_rate_basis_points <> 0)
    THEN RAISE(ABORT, 'invoice.tax_disabled') END;
END;
CREATE TRIGGER validate_invoice_status_transition
BEFORE UPDATE OF status ON invoices
WHEN NOT (
  OLD.status = NEW.status
  OR (OLD.status = 'DRAFT' AND NEW.status = 'POSTED')
  OR (OLD.status = 'POSTED' AND NEW.status = 'CANCELLED')
)
BEGIN
  SELECT RAISE(ABORT, 'invoice.invalid_status_transition');
END;
CREATE TRIGGER post_invoice_stock
AFTER UPDATE OF status ON invoices
WHEN OLD.status = 'DRAFT' AND NEW.status = 'POSTED'
BEGIN
  INSERT INTO stock_movements (
    id, business_id, product_id, actor_user_id, movement_type,
    quantity_delta_scaled, source_type, source_id, reason, occurred_at, idempotency_key
  )
  SELECT lower(hex(randomblob(16))), NEW.business_id, product_id, NEW.actor_user_id, 'SALE',
    -quantity_scaled, 'INVOICE', NEW.id, 'Invoice posted', NEW.posted_at,
    'sale:' || NEW.id || ':' || id
  FROM invoice_lines WHERE invoice_id = NEW.id;
  INSERT INTO audit_events (id, business_id, actor_user_id, action, entity_type, entity_id, occurred_at)
  VALUES (lower(hex(randomblob(16))), NEW.business_id, NEW.actor_user_id, 'invoice.posted', 'invoice', NEW.id, NEW.posted_at);
END;
CREATE TRIGGER validate_invoice_cancel
BEFORE UPDATE OF status ON invoices
WHEN OLD.status = 'POSTED' AND NEW.status = 'CANCELLED'
BEGIN
  SELECT CASE WHEN length(trim(NEW.cancellation_reason)) = 0
    THEN RAISE(ABORT, 'invoice.cancellation_reason_required') END;
END;
CREATE TRIGGER audit_invoice_cancel
AFTER UPDATE OF status ON invoices
WHEN OLD.status = 'POSTED' AND NEW.status = 'CANCELLED'
BEGIN
  INSERT INTO audit_events (id, business_id, actor_user_id, action, entity_type, entity_id, occurred_at)
  VALUES (lower(hex(randomblob(16))), NEW.business_id, NEW.actor_user_id, 'invoice.cancelled', 'invoice', NEW.id, NEW.cancelled_at);
END;
CREATE TRIGGER reverse_cancelled_invoice
AFTER UPDATE OF status ON invoices
WHEN OLD.status = 'POSTED' AND NEW.status = 'CANCELLED'
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM invoice_returns WHERE invoice_id = NEW.id
  ) THEN RAISE(ABORT, 'invoice.cancel_after_return') END;
  INSERT INTO stock_movements (
    id, business_id, product_id, actor_user_id, movement_type,
    quantity_delta_scaled, source_type, source_id, reason, occurred_at, idempotency_key
  )
  SELECT lower(hex(randomblob(16))), NEW.business_id, product_id, NEW.actor_user_id,
    'CANCELLATION', quantity_scaled, 'INVOICE_CANCELLATION', NEW.id,
    NEW.cancellation_reason, NEW.cancelled_at, 'cancel:' || NEW.id || ':' || id
  FROM invoice_lines WHERE invoice_id = NEW.id;
  INSERT INTO payments (
    id, business_id, invoice_id, actor_user_id, payment_type, amount_minor,
    reason, idempotency_key, occurred_at
  )
  SELECT lower(hex(randomblob(16))), NEW.business_id, NEW.id, NEW.actor_user_id,
    'REFUND', -sum(amount_minor), NEW.cancellation_reason,
    'cancel-refund:' || NEW.id, NEW.cancelled_at
  FROM payments WHERE invoice_id = NEW.id
  HAVING sum(amount_minor) > 0;
END;
CREATE TRIGGER prevent_posted_invoice_rewrite
BEFORE UPDATE ON invoices
WHEN OLD.status <> 'DRAFT' AND (
  OLD.business_id <> NEW.business_id OR OLD.invoice_number <> NEW.invoice_number
  OR OLD.subtotal_minor <> NEW.subtotal_minor OR OLD.discount_minor <> NEW.discount_minor
  OR OLD.tax_minor <> NEW.tax_minor OR OLD.total_minor <> NEW.total_minor
  OR OLD.idempotency_key <> NEW.idempotency_key
  OR OLD.request_fingerprint <> NEW.request_fingerprint
  OR OLD.draft_lines_json <> NEW.draft_lines_json
  OR (
    NOT (OLD.status = 'POSTED' AND NEW.status = 'CANCELLED')
    AND (
      OLD.cancelled_at IS NOT NEW.cancelled_at
      OR OLD.cancellation_reason <> NEW.cancellation_reason
    )
  )
  OR OLD.actor_user_id <> NEW.actor_user_id
  OR OLD.created_at <> NEW.created_at
)
BEGIN
  SELECT RAISE(ABORT, 'invoices.append_only');
END;
CREATE TRIGGER prevent_invoice_delete
BEFORE DELETE ON invoices
BEGIN
  SELECT RAISE(ABORT, 'invoices.append_only');
END;

CREATE TRIGGER validate_return
BEFORE INSERT ON invoice_return_lines
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM invoice_returns r
    JOIN invoices i ON i.id = r.invoice_id
    JOIN invoice_lines il ON il.id = NEW.invoice_line_id AND il.invoice_id = i.id
    WHERE r.id = NEW.return_id AND i.status = 'POSTED'
      AND coalesce((SELECT sum(irl.quantity_scaled) FROM invoice_return_lines irl
        JOIN invoice_returns prior ON prior.id = irl.return_id
        WHERE irl.invoice_line_id = NEW.invoice_line_id), 0) + NEW.quantity_scaled <= il.quantity_scaled
  ) THEN RAISE(ABORT, 'return.quantity_exceeds_sold') END;
END;
CREATE TRIGGER post_return_stock
AFTER INSERT ON invoice_return_lines
WHEN NEW.disposition = 'RESTOCK'
BEGIN
  INSERT INTO stock_movements (
    id, business_id, product_id, actor_user_id, movement_type,
    quantity_delta_scaled, source_type, source_id, reason, occurred_at, idempotency_key
  )
  SELECT lower(hex(randomblob(16))), r.business_id, il.product_id, r.actor_user_id, 'SALE_RETURN',
    NEW.quantity_scaled, 'RETURN', r.id, r.reason, r.created_at, 'return:' || r.id || ':' || NEW.id
  FROM invoice_returns r JOIN invoices i ON i.id = r.invoice_id
  JOIN invoice_lines il ON il.id = NEW.invoice_line_id
  WHERE r.id = NEW.return_id;
END;
CREATE TRIGGER create_return_lines
AFTER INSERT ON invoice_returns
BEGIN
  INSERT INTO invoice_return_lines (id, return_id, invoice_line_id, quantity_scaled, disposition)
  SELECT lower(hex(randomblob(16))), NEW.id, json_extract(value, '$.invoiceLineId'),
    json_extract(value, '$.quantityScaled'), json_extract(value, '$.disposition')
  FROM json_each(NEW.lines_json);
  INSERT INTO payments (
    id, business_id, invoice_id, actor_user_id, payment_type, amount_minor,
    reference, reason, idempotency_key, occurred_at
  )
  SELECT lower(hex(randomblob(16))), NEW.business_id, NEW.invoice_id, NEW.actor_user_id,
    'REFUND', -NEW.refund_minor, '', NEW.reason, 'return-refund:' || NEW.id, NEW.created_at
  WHERE NEW.refund_minor > 0;
END;

PRAGMA user_version = 3;
`;
