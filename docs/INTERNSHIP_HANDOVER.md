# Internship handover

## Project summary

SmartBiz POS is a local-first retail POS foundation built with Expo/React Native, a Tauri desktop shell, strict TypeScript, and SQLite. The repository currently has a working foundation/catalogue slice; it is not a complete POS or production release.

## Start a synthetic demonstration

1. Install Node.js 24 and run `npm ci` from the repository root.
2. On macOS, install Rust stable and the Tauri prerequisites. If Cargo is under `~/.cargo/bin`, launch with:

   ```sh
   PATH="$HOME/.cargo/bin:$PATH" npm run tauri:dev --workspace @smartbiz/desktop
   ```

3. Use the first-run form to enter a fictional shop (for example, “Demo Corner Store”, Pune, INR, Asia/Kolkata) and a newly chosen throwaway demo-owner password. Never use a real customer's or employee's personal data in a demonstration.
4. Create a fictional category such as “Beverages”, use a seeded unit such as “Piece”, and add synthetic products with non-sensitive names/SKUs and prices. Use the product screen to search, edit/archive, preview CSV import, and manage barcodes.
5. Sign out and sign back in to demonstrate local authentication. Relaunch the app to verify that SQLite data persists and that a fresh in-memory session is required.

The demo is created interactively in a local app database; no fixed demo credentials or production-like seed records are installed. Protect that database like business data.

## Architecture and data changes

- Presentation routes are under `apps/mobile/src/app/`.
- Shared validation, domain types, permissions, and application services are under `packages/core/src/`.
- SQL migrations are ordered in `packages/core/migrations/`; migration 3 adds customer records, immutable stock movements, tax-rate history, invoice snapshots, payments, and returns. Its TypeScript migration is registered in `packages/core/src/migrations.ts` and the Tauri migration list in `apps/desktop/src-tauri/src/lib.rs`.
- Mobile SQLite access is implemented in `apps/mobile/src/database-driver.native.ts`; desktop SQLite access is in `apps/mobile/src/database-driver.web.ts` and registered in the Tauri Rust shell.
- A standalone browser page is not a supported storage target: it has no persistent database and does not share desktop data. On macOS, Tauri uses `sqlite:smartbiz.db` with identifier `com.smartbiz.pos`, resolving to `~/Library/Application Support/com.smartbiz.pos/smartbiz.db`; mobile app installs have separate databases. Do not delete/recreate the database when troubleshooting browser storage.
- Add a new numbered migration for schema changes. Never edit an applied migration. Keep the migration bundle and SQL migration aligned, and add an upgrade test.
- Application services enforce the current in-memory session and role permissions. Do not treat caller-supplied user IDs as sufficient authorization.
- Stock balance is always `SUM(stock_movements.quantity_delta_scaled)`; do not add a writable stock-balance field. Posted invoices, invoice lines, payments, return rows, tax rates, and stock movements are append-only. Correct them with returns/reversals.
- Billing uses integer minor units and BigInt-backed rounding. Configured tax rates are tax-exclusive basis points; do not represent this as GST/legal compliance. A tax-enabled sale requires a tax category and an effective rate.
- Invoice posting, returns, and cancellation use SQLite triggers so status changes and their stock/payment effects commit or roll back together. Draft header and item snapshots are also inserted atomically from a validated JSON payload.
- Inventory, Customers, and Billing routes can be opened from the Overview screen. Service permissions remain authoritative; cashier screens intentionally omit management controls.

## Common development checks

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
PATH="$HOME/.cargo/bin:$PATH" cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
PATH="$HOME/.cargo/bin:$PATH" npm run tauri:build --workspace @smartbiz/desktop
```

Native Android and iOS checks require their respective SDKs/toolchains and actual supported devices. Printer/scanner support requires named hardware and manual QA. Do not mark the related stories complete until both code and applicable acceptance tests exist.

## Continuation order

Use the [implementation tracker](./IMPLEMENTATION_TRACKER.md) as the current status record. The inventory/customer/billing vertical slice is partial: the latest macOS Tauri build and schema-3 startup have passed, but add UI/E2E tests for checkout, partial payment, return, cancellation, permissions, and restart persistence. The service and UI include a customer sales summary; add dated/exportable management reporting and inventory export before marking reporting criteria complete. Continue with blocked owner decisions and remaining releases only in the documented order. Maintain append-only stock and financial records; use integer minor units; do not claim sync without a real service and recovery tests.

## Ownership and external inputs

The business owner must approve tax jurisdiction/rules, negative-stock policy, backend/multi-device scope, offline invoice numbering, scanner models, printer models/transport/label size, and minimum supported OS versions. The current platform and security limits are listed in [known limitations](./KNOWN_LIMITATIONS.md).
