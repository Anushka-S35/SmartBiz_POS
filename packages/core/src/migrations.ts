import { inventoryCustomersBillingMigration } from "./migration-3";
import { supplierPurchasingMigration } from "./migration-4";
import { purchasingFinanceCostMigration } from "./migration-5";
import { fifoCostLayerRestorationMigration } from "./migration-6";
import { indianGstFoundationMigration } from "./migration-7";
import { gstPurchaseItcMigration } from "./migration-8";

export interface Migration {
  version: number;
  description: string;
  sql: string;
}

export const migrations: readonly Migration[] = [
  {
    version: 1,
    description: "Create business, users, catalogue, barcode and audit tables",
    sql: `PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY NOT NULL,
  legal_name TEXT NOT NULL CHECK (length(trim(legal_name)) > 0),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  logo_uri TEXT,
  currency_code TEXT NOT NULL CHECK (length(currency_code) = 3),
  currency_fraction_digits INTEGER NOT NULL CHECK (currency_fraction_digits BETWEEN 0 AND 3),
  timezone TEXT NOT NULL CHECK (length(timezone) > 0),
  invoice_prefix TEXT NOT NULL CHECK (length(trim(invoice_prefix)) > 0),
  tax_enabled INTEGER NOT NULL DEFAULT 0 CHECK (tax_enabled IN (0, 1)),
  tax_registration_id TEXT,
  allow_multiple_barcodes INTEGER NOT NULL DEFAULT 0 CHECK (allow_multiple_barcodes IN (0, 1)),
  setup_complete INTEGER NOT NULL DEFAULT 0 CHECK (setup_complete IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  CHECK (tax_enabled = 0 OR length(trim(coalesce(tax_registration_id, ''))) > 0)
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  email TEXT NOT NULL,
  normalized_email TEXT NOT NULL,
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'MANAGER', 'CASHIER')),
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL CHECK (password_iterations >= 100000),
  disabled_at TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  updated_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (business_id, normalized_email)
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY NOT NULL,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  normalized_name TEXT NOT NULL,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (business_id, normalized_name)
);

CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY NOT NULL,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  code TEXT NOT NULL,
  quantity_precision INTEGER NOT NULL CHECK (quantity_precision BETWEEN 0 AND 6),
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (business_id, code)
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY NOT NULL,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  sku TEXT NOT NULL CHECK (length(trim(sku)) > 0),
  normalized_sku TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tax_category TEXT NOT NULL DEFAULT '',
  category_id TEXT REFERENCES categories(id) ON DELETE RESTRICT,
  category_name_snapshot TEXT NOT NULL DEFAULT '',
  unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
  unit_name_snapshot TEXT NOT NULL,
  unit_precision_snapshot INTEGER NOT NULL CHECK (unit_precision_snapshot BETWEEN 0 AND 6),
  purchase_price_minor INTEGER NOT NULL CHECK (purchase_price_minor >= 0),
  selling_price_minor INTEGER NOT NULL CHECK (selling_price_minor >= 0),
  reorder_threshold_scaled INTEGER NOT NULL CHECK (reorder_threshold_scaled >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  archived_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (business_id, normalized_sku)
);

CREATE TABLE IF NOT EXISTS barcode_mappings (
  id TEXT PRIMARY KEY NOT NULL,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  value TEXT NOT NULL,
  symbology TEXT NOT NULL CHECK (symbology IN ('CODE128', 'EAN13')),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  replaces_barcode_id TEXT REFERENCES barcode_mappings(id) ON DELETE RESTRICT,
  change_reason TEXT NOT NULL DEFAULT '',
  retired_at TEXT,
  retired_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  retirement_reason TEXT NOT NULL DEFAULT '',
  UNIQUE (business_id, value)
);

CREATE TABLE IF NOT EXISTS barcode_history (
  id TEXT PRIMARY KEY NOT NULL,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN ('ASSIGNED', 'REMAPPED')),
  previous_value TEXT,
  new_value TEXT NOT NULL,
  symbology TEXT NOT NULL,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  actor_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_preferences (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_business_name ON products(business_id, name);
CREATE INDEX IF NOT EXISTS idx_products_business_sku ON products(business_id, normalized_sku);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_categories_business_active ON categories(business_id, archived_at);
CREATE INDEX IF NOT EXISTS idx_units_business_active ON units(business_id, archived_at);
CREATE INDEX IF NOT EXISTS idx_barcodes_business_value ON barcode_mappings(business_id, value);
CREATE INDEX IF NOT EXISTS idx_barcode_history_product_time ON barcode_history(product_id, occurred_at);

CREATE TRIGGER IF NOT EXISTS seed_default_units
AFTER INSERT ON businesses
BEGIN
  INSERT OR IGNORE INTO units (id, business_id, name, code, quantity_precision, created_at, updated_at)
  VALUES
    ('builtin-piece-' || NEW.id, NEW.id, 'Piece', 'piece', 0, NEW.created_at, NEW.created_at),
    ('builtin-kilogram-' || NEW.id, NEW.id, 'Kilogram', 'kg', 3, NEW.created_at, NEW.created_at),
    ('builtin-gram-' || NEW.id, NEW.id, 'Gram', 'g', 0, NEW.created_at, NEW.created_at),
    ('builtin-litre-' || NEW.id, NEW.id, 'Litre', 'l', 3, NEW.created_at, NEW.created_at),
    ('builtin-metre-' || NEW.id, NEW.id, 'Metre', 'm', 3, NEW.created_at, NEW.created_at),
    ('builtin-pack-' || NEW.id, NEW.id, 'Pack', 'pack', 0, NEW.created_at, NEW.created_at);
END;

CREATE TRIGGER IF NOT EXISTS complete_business_setup
AFTER INSERT ON users
WHEN NEW.role = 'ADMIN'
BEGIN
  UPDATE businesses SET setup_complete = 1, updated_at = NEW.created_at
  WHERE id = NEW.business_id AND setup_complete = 0;
  INSERT INTO audit_events (id, business_id, actor_user_id, action, entity_type, entity_id, occurred_at)
  VALUES (
    lower(hex(randomblob(16))),
    NEW.business_id,
    coalesce(NEW.created_by, NEW.id),
    'user.created',
    'user',
    NEW.id,
    NEW.created_at
  );
END;

CREATE TRIGGER IF NOT EXISTS prevent_disabling_last_admin
BEFORE UPDATE OF role, disabled_at ON users
WHEN OLD.role = 'ADMIN'
  AND OLD.disabled_at IS NULL
  AND (NEW.role <> 'ADMIN' OR NEW.disabled_at IS NOT NULL)
  AND (
    SELECT count(*) FROM users
    WHERE business_id = OLD.business_id AND role = 'ADMIN' AND disabled_at IS NULL
  ) <= 1
BEGIN
  SELECT RAISE(ABORT, 'users.last_active_admin');
END;

CREATE TRIGGER IF NOT EXISTS audit_user_role_or_status
AFTER UPDATE OF role, disabled_at ON users
WHEN OLD.role <> NEW.role OR coalesce(OLD.disabled_at, '') <> coalesce(NEW.disabled_at, '')
BEGIN
  INSERT INTO audit_events (id, business_id, actor_user_id, action, entity_type, entity_id, occurred_at)
  VALUES (
    lower(hex(randomblob(16))),
    NEW.business_id,
    NEW.updated_by,
    CASE WHEN OLD.role <> NEW.role THEN 'user.role_changed' ELSE 'user.disabled_status_changed' END,
    'user',
    NEW.id,
    NEW.updated_at
  );
END;

CREATE TRIGGER IF NOT EXISTS audit_business_settings
AFTER UPDATE OF legal_name, display_name, address, phone, email, currency_code, currency_fraction_digits, timezone, invoice_prefix,
  tax_enabled, tax_registration_id, allow_multiple_barcodes ON businesses
WHEN OLD.legal_name <> NEW.legal_name
  OR OLD.display_name <> NEW.display_name
  OR OLD.address <> NEW.address
  OR OLD.phone <> NEW.phone
  OR OLD.email <> NEW.email
  OR OLD.currency_code <> NEW.currency_code
  OR OLD.currency_fraction_digits <> NEW.currency_fraction_digits
  OR OLD.timezone <> NEW.timezone
  OR OLD.invoice_prefix <> NEW.invoice_prefix
  OR OLD.tax_enabled <> NEW.tax_enabled
  OR coalesce(OLD.tax_registration_id, '') <> coalesce(NEW.tax_registration_id, '')
  OR OLD.allow_multiple_barcodes <> NEW.allow_multiple_barcodes
BEGIN
  INSERT INTO audit_events (id, business_id, actor_user_id, action, entity_type, entity_id, occurred_at)
  VALUES (lower(hex(randomblob(16))), NEW.id, NEW.updated_by, 'business.settings_updated', 'business', NEW.id, NEW.updated_at);
END;

CREATE TRIGGER IF NOT EXISTS validate_barcode_replacement
BEFORE INSERT ON barcode_mappings
WHEN NEW.replaces_barcode_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM barcode_mappings
  WHERE id = NEW.replaces_barcode_id
    AND business_id = NEW.business_id
    AND product_id = NEW.product_id
    AND retired_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'barcode.replacement_not_active');
END;

CREATE TRIGGER IF NOT EXISTS validate_product_barcode_policy
BEFORE INSERT ON barcode_mappings
WHEN NEW.replaces_barcode_id IS NULL
  AND (SELECT allow_multiple_barcodes FROM businesses WHERE id = NEW.business_id) = 0
  AND EXISTS (
    SELECT 1 FROM barcode_mappings
    WHERE business_id = NEW.business_id
      AND product_id = NEW.product_id
      AND retired_at IS NULL
  )
BEGIN
  SELECT RAISE(ABORT, 'barcode.multiple_aliases_disabled');
END;

CREATE TRIGGER IF NOT EXISTS validate_product_unit_and_category_scope
BEFORE INSERT ON products
WHEN NOT EXISTS (
    SELECT 1 FROM units WHERE id = NEW.unit_id AND business_id = NEW.business_id AND archived_at IS NULL
  )
  OR (
    NEW.category_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM categories
      WHERE id = NEW.category_id AND business_id = NEW.business_id AND archived_at IS NULL
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'product.invalid_catalogue_reference');
END;

CREATE TRIGGER IF NOT EXISTS record_barcode_assignment
AFTER INSERT ON barcode_mappings
BEGIN
  UPDATE barcode_mappings
  SET retired_at = NEW.created_at, retired_by = NEW.created_by, retirement_reason = NEW.change_reason
  WHERE id = NEW.replaces_barcode_id AND retired_at IS NULL;

  INSERT INTO barcode_history (
    id, business_id, product_id, event_type, previous_value, new_value, symbology, actor_user_id, reason, occurred_at
  )
  VALUES (
    NEW.id || '-history',
    NEW.business_id,
    NEW.product_id,
    CASE WHEN NEW.replaces_barcode_id IS NULL THEN 'ASSIGNED' ELSE 'REMAPPED' END,
    (SELECT value FROM barcode_mappings WHERE id = NEW.replaces_barcode_id),
    NEW.value,
    NEW.symbology,
    NEW.created_by,
    NEW.change_reason,
    NEW.created_at
  );

  INSERT INTO audit_events (id, business_id, actor_user_id, action, entity_type, entity_id, occurred_at)
  VALUES (
    NEW.id || '-audit',
    NEW.business_id,
    NEW.created_by,
    CASE WHEN NEW.replaces_barcode_id IS NULL THEN 'barcode.assigned' ELSE 'barcode.remapped' END,
    'product',
    NEW.product_id,
    NEW.created_at
  );
END;

CREATE TRIGGER IF NOT EXISTS prevent_barcode_mapping_rewrite
BEFORE UPDATE ON barcode_mappings
WHEN OLD.business_id <> NEW.business_id
  OR OLD.product_id <> NEW.product_id
  OR OLD.value <> NEW.value
  OR OLD.symbology <> NEW.symbology
  OR OLD.created_by <> NEW.created_by
  OR OLD.created_at <> NEW.created_at
  OR OLD.replaces_barcode_id IS NOT NEW.replaces_barcode_id
  OR OLD.change_reason <> NEW.change_reason
  OR (OLD.retired_at IS NOT NULL AND NEW.retired_at IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'barcode_mappings.append_only');
END;

CREATE TRIGGER IF NOT EXISTS prevent_barcode_mapping_delete
BEFORE DELETE ON barcode_mappings
BEGIN
  SELECT RAISE(ABORT, 'barcode_mappings.append_only');
END;

CREATE TRIGGER IF NOT EXISTS prevent_audit_event_update
BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events.append_only');
END;

CREATE TRIGGER IF NOT EXISTS prevent_audit_event_delete
BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events.append_only');
END;

CREATE TRIGGER IF NOT EXISTS prevent_barcode_history_update
BEFORE UPDATE ON barcode_history
BEGIN
  SELECT RAISE(ABORT, 'barcode_history.append_only');
END;

CREATE TRIGGER IF NOT EXISTS prevent_barcode_history_delete
BEFORE DELETE ON barcode_history
BEGIN
  SELECT RAISE(ABORT, 'barcode_history.append_only');
END;

PRAGMA user_version = 1;
`,
  },
  {
    version: 2,
    description: "Enforce one business profile per installation",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_single_installation
ON businesses ((1));

PRAGMA user_version = 2;
`,
  },
  {
    version: 3,
    description: "Add inventory, customers, invoices, payments and returns",
    sql: inventoryCustomersBillingMigration,
  },
  {
    version: 4,
    description: "Add suppliers and append-only purchase receipts",
    sql: supplierPurchasingMigration,
  },
  {
    version: 5,
    description: "Add supplier credits, payments, and FIFO cost snapshots",
    sql: purchasingFinanceCostMigration,
  },
  {
    version: 6,
    description: "Preserve FIFO layers through returns and cancellations",
    sql: fifoCostLayerRestorationMigration,
  },
  {
    version: 7,
    description: "Add Indian GST business, document, and tax snapshot fields",
    sql: indianGstFoundationMigration,
  },
  {
    version: 8,
    description: "Wire GST purchase tax capture and ITC ledger into purchase receipt trigger",
    sql: gstPurchaseItcMigration,
  },
];
