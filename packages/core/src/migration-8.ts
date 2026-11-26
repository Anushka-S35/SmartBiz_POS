export const gstPurchaseItcMigration = `-- Migration 0008: GST purchase tax capture and ITC ledger wiring
-- Updates the receive_purchase trigger to persist GST snapshots on purchase lines.
-- Additive only; does not modify or delete existing data.

DROP TRIGGER IF EXISTS receive_purchase;

CREATE TRIGGER receive_purchase AFTER INSERT ON purchases
BEGIN
  INSERT INTO purchase_lines (id, purchase_id, product_id, product_name_snapshot, sku_snapshot,
    unit_name_snapshot, unit_precision, quantity_scaled, unit_cost_minor, line_total_minor,
    hsn_sac_snapshot, gst_supply_type_snapshot, gst_rate_basis_points, taxable_value_minor,
    input_cgst_minor, input_sgst_minor, input_igst_minor, input_cess_minor, itc_status)
  SELECT json_extract(j.value, '$.lineId'), NEW.id, p.id, p.name, p.sku,
    p.unit_name_snapshot, p.unit_precision_snapshot,
    json_extract(j.value, '$.quantityScaled'), json_extract(j.value, '$.unitCostMinor'),
    json_extract(j.value, '$.lineTotalMinor'),
    coalesce(json_extract(j.value, '$.hsnSacCode'), ''),
    coalesce(json_extract(j.value, '$.gstSupplyType'), 'TAXABLE'),
    coalesce(json_extract(j.value, '$.gstRateBasisPoints'), 0),
    coalesce(json_extract(j.value, '$.taxableValueMinor'), 0),
    coalesce(json_extract(j.value, '$.inputCgstMinor'), 0),
    coalesce(json_extract(j.value, '$.inputSgstMinor'), 0),
    coalesce(json_extract(j.value, '$.inputIgstMinor'), 0),
    coalesce(json_extract(j.value, '$.inputCessMinor'), 0),
    'UNASSESSED'
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

PRAGMA user_version = 8;
`;
