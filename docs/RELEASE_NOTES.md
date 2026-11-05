# Release notes

## 0.1.0 — Development checkpoint

This is a development build, not a production release.

### Included

- Expo/React Native mobile application and Tauri desktop shell.
- Local SQLite business onboarding, local authentication, role checks, catalogue, category/unit management, CSV flows, and barcode assignment/remapping.
- Ordered SQLite migrations, including migration 2 enforcing one business profile per local installation and migration 3 adding customers, stock ledger, tax-rate history, invoices, invoice lines, payments, and returns.
- Protected application services now require a live, unexpired authenticated session; logout, account invalidation, and expiry clear that session.
- Inventory screen with ledger-derived balances, stock IN/OUT/opening/adjustment/purchase-return entries, low-stock filtering, and product stock history.
- Customer create/edit/search/archive, validated contacts, customer selection at checkout, walk-in sales, purchase history, and a net sales/paid/outstanding summary.
- Billing screen with product/barcode search, cart, line quantities/discounts, draft invoice totals, configured basis-point tax, invoice posting, payment collection, returns, cancellations, history, and invoice print/PDF-sharing workflow.
- Integer minor-unit money arithmetic, effective-dated tax rates, idempotency keys, append-only financial and stock records, and SQLite triggers that atomically post stock deductions, return effects, and cancellation reversals.
- Focused SQLite integration tests for connected inventory/customer/billing workflows.
- Standalone browser access now clearly reports that no browser database is configured; desktop SQLite remains local to the Tauri app and is not shared with localhost.
- Authentication/setup regression coverage now checks first-launch detection, administrator persistence, valid/invalid password handling, and Tauri database URL consistency.

### Not included

This is still a development checkpoint, not a production release. The new modules have no UI/E2E test coverage or tested-device workflow. Supplier purchase documents, management reports, sync/outbox, encrypted backup, camera/HID scanning, physical printer drivers, cross-device invoice sequencing, complete localization/accessibility, Android/iOS builds, and release signing remain incomplete or unverified. Tax-exclusive category-rate calculation is not a GST compliance implementation. See [known limitations](./KNOWN_LIMITATIONS.md) and the story-level [implementation tracker](./IMPLEMENTATION_TRACKER.md).

### Verification

Previous verification: `npx vitest run --maxWorkers=1` (25 passed), typecheck, lint, formatting, Expo web export, and a macOS Tauri `.app`/`.dmg` build passed. During the authentication/storage diagnosis, `npm test -- --maxWorkers=1` passed all 28 tests; `npm run typecheck`, `npm run lint`, `npm run format:check`, Expo web export, and a new native macOS Tauri `.app`/`.dmg` build passed. The rebuilt desktop process launched successfully. Expo reports the existing non-fatal `@noble/hashes/crypto.js` package-exports warning. The installed macOS database reported schema 3, integrity `ok`, and no foreign-key violations; one setup-complete business and one enabled administrator were found. The actual user's password was not verified. Do not infer printer/hardware support from source compilation alone.
