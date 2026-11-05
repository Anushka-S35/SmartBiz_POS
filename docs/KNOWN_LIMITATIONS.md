# Known limitations and release blockers

SmartBiz POS is not production-ready. This page lists limitations verified against the current source and the available macOS development environment.

## Functional scope

- Standalone browser access is intentionally unsupported because it has no configured persistent database. Tauri desktop uses `sqlite:smartbiz.db` under the app identifier `com.smartbiz.pos`; macOS resolves this to `~/Library/Application Support/com.smartbiz.pos/smartbiz.db`. Native mobile installs use separate app-sandbox databases. There is no browser-to-desktop or cross-device synchronization.
- Implemented local foundation/catalogue workflows do not yet satisfy every Release 0/1 acceptance criterion; see the story-level [implementation tracker](./IMPLEMENTATION_TRACKER.md).
- Product image persistence and variant handling are absent.
- Camera scanning, external scanner input, and barcode label printing are absent. No printer or scanner model has been certified.
- Inventory/customer/billing services and screens now exist as a connected local SQLite slice. Stock is derived from append-only movements and negative stock is denied by default; this policy still needs owner approval and has no override.
- Supplier contacts and multi-product purchase receipts are implemented in migration 4. Migration 5 adds receipt-linked supplier credits with stock reversals, append-only supplier payments and current balances, date-filtered purchase reporting/CSV, FIFO inventory valuation with unknown-cost quantities, and day/week/month grouped sales and purchase totals. Future invoice postings snapshot FIFO costs; profit is withheld if any retained sales quantity lacks known cost. Returns are limited to purchased quantities still available in stock. Report UI was not manually exercised.
- Invoice draft creation, posting, payments, returns, and cancellations use idempotency keys and SQLite constraints/triggers. The invoice sequence is a local date plus UUID; it avoids local collisions but is not a server-authoritative multi-device sequence.
- Tax arithmetic uses integer minor units and configured effective-dated basis-point rates, applied tax-exclusive. No GST jurisdiction, inclusive tax, exemption, statutory invoice format, tax-ID validation, or legal compliance has been established. A product category must have an effective rate when business tax mode is enabled.
- Invoice HTML can be printed via the platform print dialog; the report export uses native PDF/share and web print-to-PDF. Neither report PDF behavior nor any physical printer driver/model has been runtime-tested on a device.
- Core UI routes are compiled but have not been tested end-to-end or with assistive technology/touch hardware.
- There is no cloud API, synchronization outbox, multi-device conflict handling, or backup/restore. Local SQLite data is per installation.
- There is no encrypted SQLite database. Device sandboxing alone does not protect data from extraction on a compromised or unlocked device.
- Localization dictionaries exist for English, Hindi, and Marathi, but UI-wide translation, timezone-aware formatting, and accessibility requirements have not been comprehensively tested.

## Platform and distribution

- macOS native Tauri `.app`/`.dmg` build and a prior launch against schema 3 were verified; the local database passed `integrity_check` and foreign-key validation. Current migration 5 bundle built but was not launched and the existing DB was not migrated in this turn. Bundles are not code-signed or notarized, and the interactive checkout workflow was not manually exercised.
- Android build and device verification require Android Studio, an SDK, and an emulator or device; these were unavailable on the audited host.
- iOS build and device verification require full Xcode, signing credentials, and a device/simulator; these were unavailable on the audited host.
- Windows is not a validated target in the current environment. No Windows native build or SQLite workflow has been verified.

## Security and operations

- The full npm dependency audit reports known high/moderate advisories. Automatic major upgrades were avoided because they would replace the current Expo/React Native compatibility line and require full regression verification.
- Authentication sessions are in-memory and scoped to the current application service instance; a restart requires signing in again.
- The current macOS database contains one completed business and one enabled administrator record. The record's identity/password has not been validated against the user's private sign-in input; no credentials were requested, changed, or exposed during diagnosis.
- There is no hosted backend, TLS transport, remote authorization, secure backup key management, or operational monitoring service.
- The current automated suite is domain/SQLite-focused; critical UI workflows do not yet have end-to-end tests.

## Decisions requiring owner, legal, or hardware input

- GST jurisdiction, rates, invoice/legal requirements, and tax identifier validation.
- Approval of the current deny-by-default negative-stock policy and whether any role may override it.
- Whether multi-device synchronization is required for launch; if yes, backend provider and deployment/credential ownership.
- Invoice number allocation policy when multiple devices can bill offline.
- Scanner make/model and HID versus vendor SDK requirements.
- Printer make/model, supported transport, label dimensions, and per-platform driver/SDK.
- Minimum supported operating-system versions and whether branch/store support is required at launch.
