# Data model

SQLite schema changes are applied using numbered migrations and `PRAGMA user_version`.
The current schema is version 2; its second migration adds a unique installation-wide business constraint without changing existing business rows.

## Current entities

- `businesses`: legal/display identity, address/contact details, currency, timezone, invoice prefix, tax mode and optional tax identifier.
- `users`: business-scoped username/email, display name, role (`ADMIN`, `MANAGER`, `CASHIER`), salted password hash, disabled state and timestamps.
- `categories`: business-scoped name, archive state and timestamps.
- `units`: business-scoped name, code, quantity precision and archive state.
- `products`: business-scoped name, normalized SKU, optional description, category/unit references, purchase/selling price in integer minor units, reorder threshold in unit precision, active state and version.
- `barcode_mappings`: business-scoped code/symbology mapping, product reference, creator and retirement metadata.
- `barcode_history`: append-only assignment/remap events including actor, reason, previous value and new value.
- `audit_events`: append-only minimal records for business settings and user/role lifecycle changes.

## Integrity

- Product SKU and active barcode are unique within a business.
- Only one business profile can be created per local installation; the database enforces this even if setup is submitted concurrently.
- Products reference categories and units; records in use are archived rather than deleted.
- Barcode history is preserved on remap; retired barcodes cannot be silently assigned to another product.
- Money is integer paise for the explicit INR default. Parsing rejects excess decimal precision and never converts to binary floating point.
- Quantities are decimal strings converted to integer units using the unit's configured precision.
- Soft-deleted/archived records remain available for historical references.

Invoice, payments, stock movements, multi-store, sync and printer data do not exist in this phase.
