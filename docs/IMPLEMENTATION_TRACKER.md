# Implementation tracker

This tracker maps the implementation to every story in `SmartBiz_POS_Detailed_User_Stories.docx`. A story is not marked complete merely because a screen or button exists.

## Status key

- **Partial** — code exists, but one or more acceptance criteria, tests, or platform checks are missing.
- **Not implemented** — no working implementation is present.
- **Blocked** — implementation or verification needs an owner decision, external service, or hardware.

## Authentication and storage diagnosis

- **Browser storage — Not supported by design.** A standalone `localhost` browser page does not open the Tauri SQLite file or provide a configured persistent browser database. It now reports this explicitly instead of showing the generic persistence error. Use the native Tauri desktop application for the macOS business account.
- **macOS desktop database — Verified present and opened by the rebuilt app.** Read-only inspection of `~/Library/Application Support/com.smartbiz.pos/smartbiz.db` found one business, setup complete, one enabled administrator, schema version 3 at the time of that read-only inspection, `integrity_check = ok`, and no foreign-key violations. The rebuilt native Tauri app launched successfully against the same SQLite URL. No rows were changed.
- **Account identity — Not confirmed.** The administrator's existence is confirmed, but the user's entered email and password were not supplied for comparison. Never reset setup or recreate the account to troubleshoot this.
- **Authentication regression tests — Added.** Automated coverage exercises first-launch detection, setup persistence, one linked administrator, case-normalized valid login after service restart, invalid-password rejection, and consistency between Tauri's SQLite URL and migration registration. A browser-adapter test verifies standalone pages report unsupported storage.
- **Invoice posting error — Diagnosed and clarified.** The reported draft requested 21 Gram while its ledger-derived on-hand quantity was 0 Gram. Posting correctly fails atomically under the deny-negative-stock policy. The Billing screen previously rendered an untranslated generic conflict key, hiding the reason; insufficient stock now has a specific localized message.

## Release 0 — Foundation

- **FOUND-001 — Partial.** Workspace, Expo/Tauri shells, strict TypeScript, env template, lockfile, CI, lint/format/typecheck, tests, and docs exist. macOS Tauri dev and release `.app`/`.dmg` builds work; Android and iOS builds remain unverified. CI is configured to fail on high/critical npm advisories, and currently does fail that security gate because the dependency tree has known high findings.
- **FOUND-002 — Partial.** Business profile, onboarding state, currency/timezone, invoice prefix, tax toggle, GST registration type/GSTIN/state/address, SQLite persistence, and update audit events exist. GSTIN validation is local format/checksum only; official record validation and jurisdiction-specific legal decisions remain absent.
- **FOUND-003 — Partial.** Local user creation, Admin/Manager/Cashier roles, disabled-account checks, permission checks bound to the active authenticated service session, and role/status audit events exist. User invitations and server-side authorization do not exist in this local-only architecture.
- **FOUND-004 — Partial.** Local sign-in/out, salted PBKDF2 hashes, per-process active-session validation/expiry, and a per-process failed-login cooldown exist. New tests cover valid and invalid credentials and restart persistence. A designed trusted-device/offline sign-in policy and persisted or multi-device sessions are absent.

## Release 1 — Product catalogue

- **PROD-001 — Partial.** Product create/edit, integer-minor-unit prices, unit/category association, SKU validation, search/filter, archive, optimistic version checks, and CSV preview/import/export exist. Image persistence and variant attributes are missing; restore and full catalogue UI acceptance still need verification.
- **PROD-002 — Partial.** Category/unit create, list, rename, archive, business scoping, and quantity precision exist. Reassignment workflows and broader relationship/restore tests are missing.
- **BAR-001 — Partial.** Offline internal IDs are generated and checked against persisted mappings. The stored value is an internal identifier; a rendered symbology preview, configurable strategy, and concurrent-device collision policy are not implemented.
- **BAR-002 — Partial.** Manual Code 128/EAN-13 entry, EAN-13 check-digit validation, uniqueness constraints, and the business alias setting exist. Camera/HID capture is deferred to Release 2.
- **BAR-003 — Partial.** Remapping preserves actor/reason/time and history, and retired-code reuse is rejected. Camera/HID capture and full UI/atomic-failure workflow verification are missing.
- **BAR-004 — Not implemented / blocked.** No label preview, job queue, printer adapter, or print status exists. Printer models, label dimensions, and transport are undecided.

### Reports progress

- **RPT-001 — Partial.** Date-filtered sales and purchase reports now show totals and day/week/month grouped totals; sales includes returns, payment/refund netting, outstanding amounts, cancellations, product/category totals, and CSV export. Purchase CSV export includes supplier totals. FIFO inventory valuation reports known value and unknown-cost quantity. Report PDF uses native PDF/share and web print-to-PDF. UI is compiled but not manually exercised.
- **Profit/margin — Partial.** Migration 5 snapshots FIFO cost for future invoice lines at posting. Reports calculate gross profit only when all retained sold quantity has a known cost; old sales and opening stock with no recorded cost remain explicitly unknown. Historical category labels still use the current product category.

### Supplier and purchasing progress (added after the Release 3/4 checkpoint)

- **SUP-001 — Partial.** Supplier contact records support validated create/edit/archive and business-scoped search. A mobile screen exposes those actions to Admin/Manager roles.
- **PUR-001 — Partial.** Purchase receipts accept a reference and multiple products, snapshot names/SKUs/unit costs, and append stock IN movements atomically through migration 4. Migration 5 adds receipt-linked supplier credits and negative stock movements, append-only supplier payments, current outstanding balances, supplier ledger display, date-filtered purchase totals, and CSV export. A return is limited to purchased quantities still available in stock; it cannot credit inventory already consumed or otherwise unavailable.
- **Cost basis.** Purchase receipt costs are recorded on stock movements. FIFO is used for valuation and future invoice cost snapshots; unknown historical stock is surfaced and never assigned an invented cost.

## Release 2 — Device integration

- **SCAN-001 — Not implemented / blocked.** No camera permission flow, scan UI, torch, camera decoding, or hardware verification.
- **SCAN-002 — Not implemented / blocked.** No dedicated HID/Bluetooth input mode or scanner compatibility tests. Scanner models and input behavior are undecided.

## Release 3 — Inventory

- **INV-001 — Partial.** Product-wise on-hand balances are derived from the append-only SQLite ledger and searchable in the inventory screen. Sync state, report export, and UI/E2E verification are absent.
- **INV-002 — Partial.** Opening stock, stock IN, idempotent movement recording, actor/reason history, and supplier-linked multi-product purchase receipts are implemented. Purchase-return credits and batch/expiry receiving remain absent.
- **INV-003 — Partial.** Stock OUT and negative adjustments are ledger entries. SQLite rejects movements that would make stock negative and invoice posting rolls back atomically; the Billing screen now shows a specific insufficient-stock message. There is no override permission. This deny-by-default behavior is an implementation policy pending owner approval.
- **INV-004 — Partial.** Opening balances are one-time entries; corrections use signed adjustment movements and cannot rewrite balances. Approval/reconciliation workflow and broader boundary tests remain missing.
- **INV-005 — Partial.** Product stock history is queryable and shown in the UI with running balances; CSV export, date/type filters, and complete audit search are absent.
- **INV-006 — Partial.** Reorder thresholds are compared with ledger-derived balances and low-stock items can be filtered. No dashboard alert count or notification workflow exists.
- **INV-007 — Partial.** Sales returns support returned quantity, reason, RESTOCK/DAMAGED/QUARANTINE disposition, idempotent requests, and optional payment reversal. Purchase returns now link to receipt lines, append supplier credits, and reverse stock atomically. Credit/payment reversal workflows and manual UI verification remain absent.

## Release 4 — Customers and billing

- **CUST-001 — Partial.** Customer create/edit/search/archive, validated contact fields, and customer selection in billing exist. Walk-in is represented by a null customer on an invoice. UI/E2E coverage and guest-specific reporting remain absent.
- **CUST-002 — Partial.** Posted/cancelled invoices appear in purchase history; a transaction-derived summary reports posted invoice count, net sales after returned item values, net payments/refunds, and outstanding amount. Cancellation and return effects are covered by integration tests. A dated/exportable customer report and UI/E2E verification are absent.
- **BILL-001 — Partial.** Product/SKU/barcode search, cart quantity and line discount entry, draft totals, customer snapshots, configured GST component calculations, and walk-in/customer checkout are implemented. Place of supply is user-entered; legal place-of-supply rules, broad GST acceptance coverage and scanner integration remain absent.
- **BILL-002 — Partial.** Draft invoice and snapshots persist atomically; posting is a single SQLite update whose trigger validates totals and inserts stock deductions atomically. Invoice IDs include local date plus UUID for offline uniqueness; cross-device/server numbering and crash/restart E2E verification remain unresolved.
- **BILL-003 — Partial.** Append-only payment records support cash, UPI, card, bank transfer, credit-labelled tenders, partial payments, due calculation, duplicate-key detection, and overpayment rejection. Gateway settlement/reconciliation and split-payment UI workflows are not verified.
- **BILL-004 — Partial.** Invoice details render to HTML; native builds generate a PDF for system sharing, and web/Tauri invokes the print dialog. No physical printer model or driver has been tested; platform runtime verification and invoice-format/legal review remain outstanding.
- **BILL-005 — Partial.** Cancellation appends stock and payment reversals; sales returns are append-only and may restock or quarantine/damage items with an optional refund. Cancellation after a return is blocked to avoid double reversal. Credit-note/legal workflows and comprehensive E2E testing remain absent.
- **BILL-006 — Partial.** Business GST settings, product HSN/SAC and supply/pricing modes, effective rates, CGST/SGST/IGST and cess calculation, new invoice snapshots, and GST-labelled PDFs exist. Statutory validation, legal jurisdiction rules, purchase ITC and GST reporting remain incomplete.

## Release 5 — Offline, synchronization, and backup

- **SYNC-001 — Partial.** Local catalogue and settings persist in SQLite and can be used without a network. Stock and billing offline workflows, visible offline/unsynced state, and restart recovery for queued transactions do not exist.
- **SYNC-002 — Not implemented / decision-blocked.** No backend, durable outbox, retry, idempotency, sync states, or conflict resolution. Backend provider and multi-device MVP scope are undecided.
- **SYNC-003 — Not implemented / decision-blocked.** No encrypted backup/restore. Destination, encryption-key recovery, and retention policy require design.

## Release 6 — Reports, localization, accessibility, and readiness

- **RPT-001 — Not implemented.** No dashboard or reconciled business totals.
- **RPT-002 — Not implemented.** No sales/inventory reports or filtered CSV/PDF exports.
- **I18N-001 — Partial.** Typed English/Hindi/Marathi dictionaries and locale switching exist. Full UI-string coverage, locale/timezone formatting, and translation QA remain unverified.
- **SET-001 — Partial.** Business settings and language preference exist. Grouped settings, impact explanations, and complete financial/security setting audit coverage are missing.
- **A11Y-001 — Partial.** Some controls have accessible labels; scaling, touch-target sizing, keyboard/focus behavior, contrast, responsive layouts, and core-flow accessibility have not been tested.
- **SEC-001 — Partial.** Role permissions are checked in application services and denial paths are tested. Not every operation is tied to a validated session context; default-deny coverage, denied-action audit, and a backend authorization boundary are absent.
- **SEC-002 — Partial.** Passwords are hashed and SQL is parameterized. Local SQLite is not encrypted, platform secure key storage and TLS backend transport are absent, and npm audit reports known high/moderate advisories.
- **SEC-003 — Partial.** User/role and barcode events are recorded. Stock, invoices, settings coverage, authorized audit search/export, and server/device time semantics are not implemented.
- **OPS-001 — Partial.** Typed errors, migration startup, and privacy-conscious diagnostics exist. Structured correlation IDs, consent-based crash diagnostics, integrity/recovery procedures, and migration rollback/forward validation are incomplete.

## Cross-cutting definition of done

**Not satisfied.** Domain/SQLite integration tests cover core inventory/customer/billing operations, but no UI/E2E suite or actual touch-device workflow has been run. Android/iOS builds are blocked by missing toolchains. Device-dependent scanner/printer QA, full localization/accessibility, security/dependency remediation, backup/recovery, synchronization, reports, and remaining releases are outstanding.

## Verification evidence

- 35 Vitest tests pass with `npm test -- --maxWorkers=1`. Real-SQLite integration coverage includes atomic receipt-linked supplier credits and stock reversals, payment idempotency/overpayment, current balances, FIFO valuation with unknown costs, future invoice-line snapshots and null profit when cost is unknown, grouped/date-filtered purchase and sales totals, CSV exports, and existing inventory/billing/customer/auth regressions.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, Expo web export, Rust `cargo check`, and the macOS `.app`/`.dmg` bundle build pass. Expo emits a non-fatal `@noble/hashes/crypto.js` package-exports warning during web export.
- At the earlier checkpoint, a macOS `.app` launched against the existing schema-3 database, which passed `integrity_check` and foreign-key validation. Migrations 4 and 5 are now registered in the app and Tauri. This turn built the updated `.app` and `.dmg`; the new bundle was not launched and the user's existing database was not migrated. The bundle is unsigned and not notarized.
- Android: Android Studio, SDK, and `adb` are absent on the current host.
- iOS: full Xcode is absent; only Command Line Tools are selected.
- npm audit: 42 advisories in the complete dependency graph (5 high, 36 moderate, 1 low); production-only audit: 31 (5 high, 25 moderate, 1 low). CI is configured to fail on high/critical advisories and consequently fails its audit step until these findings are resolved. Forced Expo/React Native major upgrades have not been applied.

## Owner decisions

- Purchase GST/ITC workflows, GST registers/return-preparation exports, reverse charge, and government integrations.
- Negative-stock policy and who may override it.
- Cloud/backend provider and whether multi-device sync is required for MVP.
- Offline invoice-number allocation across devices.
- External scanner models and HID/vendor-SDK expectations.
- Printer models, transports, and label dimensions.
- Minimum supported OS versions and whether multiple stores/branches are needed at launch.

## Current development checkpoint

Release 3/4 now include purchase returns/credits, supplier payments/balances, purchase reporting, FIFO valuation, grouped report totals, and historical cost snapshots for future invoices. The verified state remains **Partial**: UI/E2E workflows were not manually tested, old costs are unknown, PDF behavior was not runtime-tested, reports are not full accounting statements, and owner/legal/platform decisions remain. Do not claim production readiness.
