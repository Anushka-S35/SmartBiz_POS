ALTER TABLE businesses ADD COLUMN gst_registration_type TEXT NOT NULL DEFAULT 'NOT_CONFIGURED'
  CHECK (gst_registration_type IN ('NOT_CONFIGURED','REGULAR','COMPOSITION','UNREGISTERED'));
ALTER TABLE businesses ADD COLUMN gst_trade_name TEXT NOT NULL DEFAULT '';
ALTER TABLE businesses ADD COLUMN gst_state_code TEXT NOT NULL DEFAULT '';
ALTER TABLE businesses ADD COLUMN gst_registered_address TEXT NOT NULL DEFAULT '';
ALTER TABLE businesses ADD COLUMN gst_financial_year_start_month INTEGER NOT NULL DEFAULT 4
  CHECK (gst_financial_year_start_month BETWEEN 1 AND 12);
ALTER TABLE businesses ADD COLUMN gst_invoice_footer TEXT NOT NULL DEFAULT '';
ALTER TABLE businesses ADD COLUMN gst_invoice_prefix TEXT NOT NULL DEFAULT 'GST';

ALTER TABLE products ADD COLUMN hsn_sac_code TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN gst_supply_type TEXT NOT NULL DEFAULT 'TAXABLE'
  CHECK (gst_supply_type IN ('TAXABLE','EXEMPT','NIL_RATED','NON_GST'));
ALTER TABLE products ADD COLUMN gst_pricing_mode TEXT NOT NULL DEFAULT 'EXCLUSIVE'
  CHECK (gst_pricing_mode IN ('EXCLUSIVE','INCLUSIVE'));
ALTER TABLE tax_rates ADD COLUMN cess_rate_basis_points INTEGER NOT NULL DEFAULT 0
  CHECK (cess_rate_basis_points BETWEEN 0 AND 1000000);
ALTER TABLE tax_rates ADD COLUMN source_reference TEXT NOT NULL DEFAULT '';

ALTER TABLE customers ADD COLUMN gstin TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN state_code TEXT NOT NULL DEFAULT '';
ALTER TABLE suppliers ADD COLUMN gstin TEXT NOT NULL DEFAULT '';
ALTER TABLE suppliers ADD COLUMN state_code TEXT NOT NULL DEFAULT '';

ALTER TABLE invoices ADD COLUMN gst_document_type TEXT NOT NULL DEFAULT 'TAX_INVOICE'
  CHECK (gst_document_type IN ('TAX_INVOICE','BILL_OF_SUPPLY','INVOICE_CUM_BILL_OF_SUPPLY','RETAIL_RECEIPT'));
ALTER TABLE invoices ADD COLUMN customer_gstin_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE invoices ADD COLUMN customer_name_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE invoices ADD COLUMN customer_address_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE invoices ADD COLUMN customer_state_code_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE invoices ADD COLUMN supplier_gstin_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE invoices ADD COLUMN supplier_legal_name_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE invoices ADD COLUMN supplier_trade_name_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE invoices ADD COLUMN supplier_address_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE invoices ADD COLUMN supplier_state_code_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE invoices ADD COLUMN place_of_supply_state_code TEXT NOT NULL DEFAULT '';
ALTER TABLE invoices ADD COLUMN reverse_charge INTEGER NOT NULL DEFAULT 0 CHECK (reverse_charge IN (0,1));
ALTER TABLE invoices ADD COLUMN financial_year_snapshot TEXT NOT NULL DEFAULT '';

ALTER TABLE invoice_lines ADD COLUMN hsn_sac_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE invoice_lines ADD COLUMN gst_taxable_value_minor INTEGER NOT NULL DEFAULT 0 CHECK (gst_taxable_value_minor >= 0);
ALTER TABLE invoice_lines ADD COLUMN gst_supply_type_snapshot TEXT NOT NULL DEFAULT 'TAXABLE'
  CHECK (gst_supply_type_snapshot IN ('TAXABLE','EXEMPT','NIL_RATED','NON_GST'));
ALTER TABLE invoice_lines ADD COLUMN gst_pricing_mode_snapshot TEXT NOT NULL DEFAULT 'EXCLUSIVE'
  CHECK (gst_pricing_mode_snapshot IN ('EXCLUSIVE','INCLUSIVE'));
ALTER TABLE invoice_lines ADD COLUMN cgst_minor INTEGER NOT NULL DEFAULT 0 CHECK (cgst_minor >= 0);
ALTER TABLE invoice_lines ADD COLUMN sgst_minor INTEGER NOT NULL DEFAULT 0 CHECK (sgst_minor >= 0);
ALTER TABLE invoice_lines ADD COLUMN igst_minor INTEGER NOT NULL DEFAULT 0 CHECK (igst_minor >= 0);
ALTER TABLE invoice_lines ADD COLUMN cess_rate_basis_points INTEGER NOT NULL DEFAULT 0 CHECK (cess_rate_basis_points >= 0);
ALTER TABLE invoice_lines ADD COLUMN cess_minor INTEGER NOT NULL DEFAULT 0 CHECK (cess_minor >= 0);

ALTER TABLE invoice_return_lines ADD COLUMN gst_tax_reversal_minor INTEGER NOT NULL DEFAULT 0 CHECK (gst_tax_reversal_minor >= 0);
ALTER TABLE invoice_return_lines ADD COLUMN taxable_reversal_minor INTEGER NOT NULL DEFAULT 0 CHECK (taxable_reversal_minor >= 0);
ALTER TABLE invoice_return_lines ADD COLUMN cgst_reversal_minor INTEGER NOT NULL DEFAULT 0 CHECK (cgst_reversal_minor >= 0);
ALTER TABLE invoice_return_lines ADD COLUMN sgst_reversal_minor INTEGER NOT NULL DEFAULT 0 CHECK (sgst_reversal_minor >= 0);
ALTER TABLE invoice_return_lines ADD COLUMN igst_reversal_minor INTEGER NOT NULL DEFAULT 0 CHECK (igst_reversal_minor >= 0);
ALTER TABLE invoice_return_lines ADD COLUMN cess_reversal_minor INTEGER NOT NULL DEFAULT 0 CHECK (cess_reversal_minor >= 0);

ALTER TABLE purchase_lines ADD COLUMN hsn_sac_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE purchase_lines ADD COLUMN gst_supply_type_snapshot TEXT NOT NULL DEFAULT 'TAXABLE'
  CHECK (gst_supply_type_snapshot IN ('TAXABLE','EXEMPT','NIL_RATED','NON_GST'));
ALTER TABLE purchase_lines ADD COLUMN gst_rate_basis_points INTEGER NOT NULL DEFAULT 0 CHECK (gst_rate_basis_points >= 0);
ALTER TABLE purchase_lines ADD COLUMN taxable_value_minor INTEGER NOT NULL DEFAULT 0 CHECK (taxable_value_minor >= 0);
ALTER TABLE purchase_lines ADD COLUMN input_cgst_minor INTEGER NOT NULL DEFAULT 0 CHECK (input_cgst_minor >= 0);
ALTER TABLE purchase_lines ADD COLUMN input_sgst_minor INTEGER NOT NULL DEFAULT 0 CHECK (input_sgst_minor >= 0);
ALTER TABLE purchase_lines ADD COLUMN input_igst_minor INTEGER NOT NULL DEFAULT 0 CHECK (input_igst_minor >= 0);
ALTER TABLE purchase_lines ADD COLUMN input_cess_minor INTEGER NOT NULL DEFAULT 0 CHECK (input_cess_minor >= 0);
ALTER TABLE purchase_lines ADD COLUMN itc_status TEXT NOT NULL DEFAULT 'UNASSESSED'
  CHECK (itc_status IN ('UNASSESSED','ELIGIBLE','INELIGIBLE','BLOCKED'));

ALTER TABLE purchases ADD COLUMN supplier_invoice_number TEXT NOT NULL DEFAULT '';
ALTER TABLE purchases ADD COLUMN supplier_invoice_date TEXT NOT NULL DEFAULT '';
ALTER TABLE purchases ADD COLUMN supplier_gstin_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE purchases ADD COLUMN input_tax_total_minor INTEGER NOT NULL DEFAULT 0 CHECK (input_tax_total_minor >= 0);

CREATE TABLE gst_invoice_sequences (
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  financial_year TEXT NOT NULL,
  last_sequence INTEGER NOT NULL CHECK (last_sequence > 0),
  PRIMARY KEY (business_id,financial_year)
);

CREATE TABLE invoice_tax_reversals (
  id TEXT PRIMARY KEY NOT NULL,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  invoice_line_id TEXT NOT NULL REFERENCES invoice_lines(id) ON DELETE RESTRICT,
  reversal_type TEXT NOT NULL CHECK (reversal_type IN ('CANCELLATION')),
  taxable_value_minor INTEGER NOT NULL CHECK (taxable_value_minor >= 0),
  cgst_minor INTEGER NOT NULL CHECK (cgst_minor >= 0),
  sgst_minor INTEGER NOT NULL CHECK (sgst_minor >= 0),
  igst_minor INTEGER NOT NULL CHECK (igst_minor >= 0),
  cess_minor INTEGER NOT NULL CHECK (cess_minor >= 0),
  reason TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  UNIQUE (invoice_line_id,reversal_type)
);
CREATE INDEX idx_invoice_tax_reversals_date ON invoice_tax_reversals(business_id,occurred_at);
CREATE TRIGGER prevent_invoice_tax_reversal_update BEFORE UPDATE ON invoice_tax_reversals
BEGIN SELECT RAISE(ABORT,'invoice_tax_reversals.append_only'); END;
CREATE TRIGGER prevent_invoice_tax_reversal_delete BEFORE DELETE ON invoice_tax_reversals
BEGIN SELECT RAISE(ABORT,'invoice_tax_reversals.append_only'); END;
CREATE TRIGGER reverse_cancelled_invoice_tax AFTER UPDATE OF status ON invoices
WHEN OLD.status='POSTED' AND NEW.status='CANCELLED'
BEGIN
  INSERT INTO invoice_tax_reversals(id,business_id,invoice_id,invoice_line_id,reversal_type,
    taxable_value_minor,cgst_minor,sgst_minor,igst_minor,cess_minor,reason,occurred_at)
  SELECT lower(hex(randomblob(16))),NEW.business_id,NEW.id,il.id,'CANCELLATION',
    il.gst_taxable_value_minor,il.cgst_minor,il.sgst_minor,il.igst_minor,il.cess_minor,
    NEW.cancellation_reason,NEW.cancelled_at
  FROM invoice_lines il WHERE il.invoice_id=NEW.id;
END;

DROP TRIGGER create_return_lines;
CREATE TRIGGER create_return_lines AFTER INSERT ON invoice_returns
BEGIN
  INSERT INTO invoice_return_lines(id,return_id,invoice_line_id,quantity_scaled,disposition,
    gst_tax_reversal_minor,taxable_reversal_minor,cgst_reversal_minor,sgst_reversal_minor,igst_reversal_minor,cess_reversal_minor)
  SELECT lower(hex(randomblob(16))),NEW.id,json_extract(value,'$.invoiceLineId'),
    json_extract(value,'$.quantityScaled'),json_extract(value,'$.disposition'),
    coalesce(json_extract(value,'$.gstTaxReversalMinor'),0),
    coalesce(json_extract(value,'$.taxableReversalMinor'),0),
    coalesce(json_extract(value,'$.cgstReversalMinor'),0),
    coalesce(json_extract(value,'$.sgstReversalMinor'),0),
    coalesce(json_extract(value,'$.igstReversalMinor'),0),
    coalesce(json_extract(value,'$.cessReversalMinor'),0)
  FROM json_each(NEW.lines_json);
  INSERT INTO payments(id,business_id,invoice_id,actor_user_id,payment_type,amount_minor,
    reference,reason,idempotency_key,occurred_at)
  SELECT lower(hex(randomblob(16))),NEW.business_id,NEW.invoice_id,NEW.actor_user_id,
    'REFUND',-NEW.refund_minor,'',NEW.reason,'return-refund:'||NEW.id,NEW.created_at
  WHERE NEW.refund_minor>0;
END;

DROP TRIGGER populate_invoice_lines;
CREATE TRIGGER populate_invoice_lines AFTER INSERT ON invoices
BEGIN
  INSERT INTO invoice_lines(id,invoice_id,product_id,product_name_snapshot,sku_snapshot,
    barcode_snapshot,unit_name_snapshot,unit_precision,quantity_scaled,unit_price_minor,
    discount_minor,tax_rate_basis_points,line_subtotal_minor,tax_minor,line_total_minor,
    hsn_sac_snapshot,gst_supply_type_snapshot,gst_pricing_mode_snapshot,gst_taxable_value_minor,
    cgst_minor,sgst_minor,igst_minor,cess_rate_basis_points,cess_minor)
  SELECT json_extract(value,'$.id'),NEW.id,json_extract(value,'$.productId'),
    json_extract(value,'$.productName'),json_extract(value,'$.sku'),json_extract(value,'$.barcode'),
    json_extract(value,'$.unitName'),json_extract(value,'$.unitPrecision'),
    json_extract(value,'$.quantityScaled'),json_extract(value,'$.unitPriceMinor'),
    json_extract(value,'$.discountMinor'),json_extract(value,'$.taxRate'),
    json_extract(value,'$.subtotalMinor'),json_extract(value,'$.taxMinor'),json_extract(value,'$.totalMinor'),
    coalesce(json_extract(value,'$.hsnSacCode'),''),coalesce(json_extract(value,'$.gstSupplyType'),'TAXABLE'),
    coalesce(json_extract(value,'$.gstPricingMode'),'EXCLUSIVE'),coalesce(json_extract(value,'$.gstTaxableValueMinor'),0),
    coalesce(json_extract(value,'$.cgstMinor'),0),coalesce(json_extract(value,'$.sgstMinor'),0),
    coalesce(json_extract(value,'$.igstMinor'),0),coalesce(json_extract(value,'$.cessRateBasisPoints'),0),
    coalesce(json_extract(value,'$.cessMinor'),0)
  FROM json_each(NEW.draft_lines_json);
END;

CREATE TABLE purchase_itc_adjustments (
  id TEXT PRIMARY KEY NOT NULL,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE RESTRICT,
  purchase_line_id TEXT NOT NULL REFERENCES purchase_lines(id) ON DELETE RESTRICT,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('CLAIM','REVERSAL','RECLAIM')),
  cgst_minor INTEGER NOT NULL DEFAULT 0,
  sgst_minor INTEGER NOT NULL DEFAULT 0,
  igst_minor INTEGER NOT NULL DEFAULT 0,
  cess_minor INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  UNIQUE (business_id,idempotency_key)
);
CREATE INDEX idx_purchase_itc_adjustment_purchase ON purchase_itc_adjustments(purchase_id,occurred_at);
CREATE TRIGGER prevent_purchase_itc_adjustment_update BEFORE UPDATE ON purchase_itc_adjustments
BEGIN SELECT RAISE(ABORT,'purchase_itc_adjustments.append_only'); END;
CREATE TRIGGER prevent_purchase_itc_adjustment_delete BEFORE DELETE ON purchase_itc_adjustments
BEGIN SELECT RAISE(ABORT,'purchase_itc_adjustments.append_only'); END;
CREATE TRIGGER prevent_posted_gst_invoice_snapshot_rewrite BEFORE UPDATE ON invoices
WHEN OLD.status IN ('POSTED','CANCELLED') AND (
  OLD.gst_document_type <> NEW.gst_document_type OR
  OLD.supplier_gstin_snapshot <> NEW.supplier_gstin_snapshot OR
  OLD.supplier_legal_name_snapshot <> NEW.supplier_legal_name_snapshot OR
  OLD.supplier_address_snapshot <> NEW.supplier_address_snapshot OR
  OLD.supplier_state_code_snapshot <> NEW.supplier_state_code_snapshot OR
  OLD.place_of_supply_state_code <> NEW.place_of_supply_state_code OR
  OLD.reverse_charge <> NEW.reverse_charge OR
  OLD.financial_year_snapshot <> NEW.financial_year_snapshot
)
BEGIN SELECT RAISE(ABORT,'invoices.gst_snapshot_immutable'); END;
CREATE TRIGGER audit_gst_business_settings AFTER UPDATE OF gst_registration_type,gst_trade_name,
  gst_state_code,gst_registered_address,gst_financial_year_start_month,gst_invoice_footer,gst_invoice_prefix ON businesses
WHEN OLD.gst_registration_type<>NEW.gst_registration_type OR OLD.gst_trade_name<>NEW.gst_trade_name
  OR OLD.gst_state_code<>NEW.gst_state_code OR OLD.gst_registered_address<>NEW.gst_registered_address
  OR OLD.gst_financial_year_start_month<>NEW.gst_financial_year_start_month
  OR OLD.gst_invoice_footer<>NEW.gst_invoice_footer OR OLD.gst_invoice_prefix<>NEW.gst_invoice_prefix
BEGIN
  INSERT INTO audit_events(id,business_id,actor_user_id,action,entity_type,entity_id,occurred_at)
  VALUES(lower(hex(randomblob(16))),NEW.id,NEW.updated_by,'business.gst_settings_updated','business',NEW.id,NEW.updated_at);
END;

PRAGMA user_version=7;
