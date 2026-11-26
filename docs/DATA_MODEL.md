# Data model

SQLite schema changes are applied using numbered migrations and `PRAGMA user_version`.
The current application schema is version 7. Migrations 3–7 add customer, stock, invoice, payment, returns, purchasing, FIFO costing and GST fields. Business/product settings and sales invoice snapshots consume the GST fields; purchase tax and ITC fields remain groundwork. See [Indian GST implementation status](./INDIAN_GST_IMPLEMENTATION.md).

## Current entities

- `businesses`: legal/display identity, address/contact details, currency, timezone, invoice prefix, tax mode and optional tax identifier.
- `users`: business-scoped username/email, display name, role (`ADMIN`, `MANAGER`, `CASHIER`), salted password hash, disabled state and timestamps.
- `categories`: business-scoped name, archive state and timestamps.
- `units`: business-scoped name, code, quantity precision and archive state.
- `products`: business-scoped name, normalized SKU, optional description, category/unit references, purchase/selling price in integer minor units, reorder threshold in unit precision, active state and version.
- `barcode_mappings`: business-scoped code/symbology mapping, product reference, creator and retirement metadata.
- `barcode_history`: append-only assignment/remap events including actor, reason, previous value and new value.
- `audit_events`: append-only minimal records for business settings and user/role lifecycle changes.
- Migration 7 extends business, customer, supplier, product, invoice, invoice-line, purchase and purchase-line records with GST configuration and historical snapshot fields. It adds cess/source fields to effective-dated `tax_rates` and append-only `purchase_itc_adjustments`.

## Integrity

- Product SKU and active barcode are unique within a business.
- Only one business profile can be created per local installation; the database enforces this even if setup is submitted concurrently.
- Products reference categories and units; records in use are archived rather than deleted.
- Barcode history is preserved on remap; retired barcodes cannot be silently assigned to another product.
- Money is integer paise for the explicit INR default. Parsing rejects excess decimal precision and never converts to binary floating point.
- Quantities are decimal strings converted to integer units using the unit's configured precision.
- Soft-deleted/archived records remain available for historical references.

GST snapshots are additive and do not rewrite old invoices. New sales invoices consume GST product/rate data and cancellation/return rows preserve tax reversal values. Purchase tax workflow and GST reporting remain unconnected. Multi-store, sync and printer-job data remain outside the current schema.
