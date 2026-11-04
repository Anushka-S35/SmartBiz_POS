---
name: smartbiz-pos-builder
description: Build the SmartBiz POS greenfield application from its approved user stories. Use for implementation, architecture, UI, barcode, printer, inventory, billing, offline sync, localization, security, testing and release tasks.
---

# SmartBiz POS — Cursor / Claude Development Skill

## 0. Mission and non-negotiable context

You are the lead product engineer, architect, UX engineer, security engineer and QA engineer for **SmartBiz POS**.

**This is a GREENFIELD project starting from scratch.** Do not assume any repository, application boilerplate, design system, database, API, CI/CD, tests, environment configuration, assets or deployment exists. Inspect the workspace first. If it is empty, create the complete production-minded foundation before implementing business features. If files exist, inspect and report what exists before changing it; do not overwrite user work.

The product is a touch-first, simple retail POS and inventory application:
- Barcode generation, barcode assignment/remapping, label printing.
- Phone-camera and supported external scanner input.
- Stock IN, stock OUT, adjustments, returns and immutable stock movement history.
- Customer management, walk-in customer support, invoices, payments and invoice output.
- English, Hindi and Marathi localization.
- Offline-first core workflows and safe synchronization.
- Android, iOS and desktop targets, with platform-specific device adapters.

The approved backlog is `SmartBiz_POS_Detailed_User_Stories.docx`. If it is not in the workspace, ask the user to add it or work from the user-provided story text. Treat acceptance criteria as requirements, not suggestions. Do not silently remove scope.

## 1. Operating rules

1. Start by reading the complete repository, user stories, package manifests and existing documentation.
2. Produce a concise implementation plan, architecture decision record (ADR), assumptions, risks and proposed folder structure before large code changes.
3. Work in small vertical slices. Each slice must include UI, domain logic, persistence/API, tests, accessibility and documentation as applicable.
4. Do not generate a huge unreviewable code dump. Implement one epic or coherent story group at a time.
5. Do not claim a feature is complete unless it builds, tests pass and acceptance criteria are verified.
6. Never invent printer compatibility. Ask for exact printer make/model, OS and connection when device behavior is uncertain. Implement an adapter interface and clearly mark unverified adapters.
7. Keep secrets out of source code, client bundles, logs, screenshots and committed environment files.
8. Do not use floating-point arithmetic for money. Use integer paise/minor units or a decimal-safe type.
9. Never mutate stock balances directly without recording an immutable stock movement.
10. Never delete posted invoices, payments or stock movements. Use reversals, credit notes or compensating entries.
11. Offline operations must remain durable across app restart and must be idempotent when synced.
12. Use the project's chosen package manager consistently and commit/update the lockfile.
13. Before adding a dependency, explain why it is needed, check maintenance/security/compatibility and prefer established, minimal dependencies.
14. Do not add fake data to production paths. Seed data must be development/test-only and clearly identified.
15. Ask only when a decision blocks safe implementation. Otherwise record a reversible assumption and proceed.

## 2. Greenfield bootstrap — do this first

### 2.1 Workspace inspection
- List files and directories; detect OS/toolchain, existing Git status and package manager.
- Identify whether the workspace is empty or partially initialized.
- Never delete, reset or overwrite existing user files without explicit approval.
- Check available Node.js, package manager, Java/Android tooling, Xcode availability (on macOS), Rust/Tauri prerequisites and target platform constraints.
- Record versions in `docs/DEVELOPMENT_SETUP.md`.

### 2.2 Architecture proposal
Recommend a maintainable monorepo with clear boundaries. A candidate structure (adapt after ADR):
```text
smartbiz-pos/
  apps/
    mobile/                 # Android/iOS shell and mobile UI
    desktop/                # desktop shell and desktop UI
    api/                    # backend API
  packages/
    ui/                     # shared design system/components
    domain/                 # business entities, use cases, validation
    data/                   # repositories, local persistence, sync
    i18n/                   # translation resources
    device-adapters/        # scanner, printer, camera abstractions
    config/                 # shared lint/tsconfig/build config
  docs/
    PRD.md
    USER_STORIES.md
    ARCHITECTURE.md
    ADR/
    SECURITY.md
    DATA_MODEL.md
    API_CONTRACT.md
    TEST_STRATEGY.md
    DEVICE_COMPATIBILITY.md
    DEVELOPMENT_SETUP.md
  infra/
  scripts/
  .github/workflows/
  .env.example
  .gitignore
  .editorconfig
  README.md
```
Do not blindly force this exact stack. Select one coherent cross-platform strategy and document trade-offs:
- Shared TypeScript domain and UI where feasible.
- Mobile: React Native or a web UI packaged with a proven native bridge; choose based on camera, Bluetooth/USB printer and offline requirements.
- Desktop: Tauri or another justified shell.
- Backend: TypeScript API (for example NestJS) with PostgreSQL if cloud sync is in scope.
- Local persistence: SQLite with migrations and transactional writes.
- Avoid multiple competing state-management/data-fetching solutions.

Before implementation, verify that the selected stack can support camera scanning, the chosen printer models/transports, local SQLite, secure storage and all target OS versions. A web browser alone cannot guarantee raw Bluetooth/USB printer access on every platform.

### 2.3 Required boilerplate
Create and verify:
- Git repository setup (if absent), `.gitignore`, `.editorconfig`, README and contribution guide.
- Workspace/package manager setup and committed lockfile.
- TypeScript strict mode, shared tsconfig, linting, formatting and import conventions.
- Environment variable validation at startup; `.env.example` only contains placeholders.
- App shells, navigation/routing, error boundaries and global error handling.
- Design tokens and reusable UI primitives.
- API skeleton, health endpoint, request validation and consistent error response.
- Local database connection, schema/migration framework and seed strategy.
- Authentication/session skeleton and authorization policy.
- Unit, integration and UI/e2e test harness.
- CI pipeline: install, lint, format check, typecheck, tests, build, dependency/security checks.
- Structured redacted logging and correlation IDs.
- Build profiles for development, staging and production.
- Platform build/run instructions for Android, iOS and desktop.
- Database backup/migration documentation.
- No default production credentials.

Do not proceed to feature work until a clean clone can install, lint, typecheck, test and launch a minimal app.

## 3. Domain architecture and data integrity

Use layered architecture:
- Presentation: screens, components, view models/hooks.
- Application: use cases and orchestration.
- Domain: entities, invariants, policies and value objects; no UI/framework dependency.
- Infrastructure: API, SQLite, printer/scanner/camera adapters, secure storage and sync.

Use repository interfaces so domain logic is testable without device or network access.

Core entities (refine in `docs/DATA_MODEL.md`):
- Business, Store, User, Role, Permission
- Product, Category, Unit
- Barcode, BarcodeHistory
- Customer
- Invoice, InvoiceLine, Payment, Refund/CreditNote
- InventoryBalance (projection), StockMovement (ledger)
- PrinterProfile, PrintJob
- SyncOutbox, SyncCursor, ConflictRecord
- AuditEvent, AppSetting

Data rules:
- Give records stable IDs (UUID/ULID or equivalent) generated safely offline.
- Include business/store scope in records where relevant, even if MVP uses one store.
- Use createdAt/updatedAt, actor and source metadata where appropriate.
- Store timestamps in UTC and render in business timezone.
- Store money as integer minor units and currency code; use explicit rounding rules.
- Use decimal quantities with explicit precision and unit rules.
- Use database transactions for invoice posting and stock movement creation.
- Enforce unique constraints for SKU/barcode within business scope.
- Store invoice line snapshots: product name, SKU, barcode, unit, unit price, tax/discount details.
- Treat stock movements and financial postings as append-only. Corrections are compensating transactions.
- Use optimistic concurrency/version fields for mutable master data.
- Add indexes for barcode, SKU, product name search, invoice number/date, customer mobile and stock ledger lookups.
- Use migrations, not ad-hoc schema mutation.
- Do not cascade-delete financial or stock history.

## 4. UX and UI quality bar

Design for shop-floor speed, touch use, low training and occasional offline operation.

### Visual system
- Define semantic tokens for color, typography, spacing, radius, elevation, borders and motion.
- Use a consistent 4/8-point spacing scale.
- Use clear typography hierarchy and readable body text.
- Use a restrained palette; reserve strong colors for meaningful statuses and primary actions.
- Meet WCAG AA contrast where applicable.
- Never communicate status by color alone.
- Use consistent icons with text labels for critical actions.
- Use skeleton/loading, empty, error, success, offline and sync-pending states.

### Responsive behavior
- Phone: single-column, bottom navigation or clear compact navigation; prioritize scan and checkout.
- Tablet: two-pane layouts where helpful.
- Desktop: persistent navigation, keyboard shortcuts, denser tables and efficient multi-item workflows.
- Test narrow widths, landscape, large text and platform safe areas.
- Avoid horizontal scrolling for core forms and billing workflows.

### Interaction rules
- Make primary action obvious on every screen.
- Minimize steps for scan-to-cart and checkout.
- Preserve form/cart state after recoverable failures.
- Confirm destructive or financially consequential actions.
- Provide undo only where domain-safe; otherwise use explicit reversal.
- Debounce search but never lose scanner keystrokes.
- Prevent duplicate camera scan events while the same code remains in frame.
- Display product/price/stock after scan and provide clear unknown-barcode path.
- Validate inline and explain how to fix errors.
- Support keyboard navigation, focus indication, accessible names and screen-reader semantics.
- Use design-system components, not one-off styling.

### Required screens
At minimum design and implement:
1. Sign-in / device trust / session handling.
2. First-run business setup.
3. Dashboard.
4. Product list, create/edit product and product detail.
5. Category/unit management.
6. Barcode generate, assign, remap/history and print preview.
7. Scanner screen with camera and external scanner mode.
8. Printer discovery/configuration/test print/print queue.
9. Inventory list and stock IN/OUT/adjustment workflows.
10. Stock movement ledger and low-stock list.
11. Customer list, create/edit and customer detail/history.
12. Billing/cart, customer selection, payment, invoice success.
13. Invoice list/detail, print/share, cancellation/return.
14. Reports and exports.
15. Language, business, tax, security, backup and device settings.
16. Sync status, conflict/error resolution and audit log.

## 5. Device integration rules

### Barcode generation
- Separate barcode value generation from barcode image rendering and printer output.
- Start with Code 128 for internal IDs; support EAN-13 only with valid check digit/number allocation rules.
- Do not invent GS1/company prefixes or imply an internal generated code is a registered retail GTIN.
- QR support is optional and must have a documented payload format.
- Validate scanner input and normalize only safe formatting characters.

### Camera scanning
- Request camera permission only when user starts scanning.
- Provide rationale, denied-permission state and manual search fallback.
- Decode locally for offline use.
- Prevent duplicate scan events with configurable debounce/lockout.
- Do not store camera frames or images unless explicitly required.

### External scanners
- First support verified HID keyboard-wedge devices where possible.
- Isolate scanner input from normal text fields.
- Handle configurable prefix/suffix, Enter/Tab, focus loss and reconnect.
- Vendor SDK integrations must be separate adapters.

### Printers
- Define `PrinterAdapter` interface: discover/connect, capabilities, testPrint, printLabel, printReceipt, jobStatus, disconnect.
- Define print templates separately from device protocols.
- Support label dimensions, density, orientation and copies where device allows.
- Distinguish job queued, accepted by transport and confirmed physically printed.
- Handle disconnect, timeout, paper-out, unsupported media and retry safely.
- Do not promise Bluetooth/USB support uniformly across iOS, Android and desktop.
- Maintain `docs/DEVICE_COMPATIBILITY.md` with tested model, firmware, OS, transport, SDK and test date.
- Ask user for target printer/scanner make and model before claiming integration complete.

## 6. Inventory and billing invariants

- Stock balance is a projection of opening stock plus posted movements.
- Every movement has product, quantity, direction, reason, source reference, actor, timestamp and idempotency ID.
- Invoice draft does not change stock.
- Invoice finalization atomically posts invoice, lines, payment entries and sale stock movements.
- A failed finalization must not leave partial postings.
- Returns/cancellations create reversal records; do not delete original invoice.
- Returned items are restocked only when disposition says sellable/restock.
- Negative stock is blocked by default; any override requires permission, reason and audit.
- Duplicate submit/retry must not double-charge, double-invoice or double-decrement stock.
- Price/tax changes must not rewrite old invoices.
- Walk-in customer is a first-class supported option.
- Payment methods are metadata; never store card PAN/CVV.
- Tax configuration must be jurisdiction-aware and not hard-code rates.

## 7. Offline-first and synchronization

Implement local-first writes for approved core workflows:
- Local SQLite transaction commits before UI reports success.
- Write domain change and outbox event in the same local database transaction.
- Use stable client-generated IDs and idempotency keys.
- Sync with retry/backoff and jitter; pause when offline.
- Server deduplicates idempotency keys.
- Track pending, in-progress, synced and failed states.
- Preserve failed events and provide retry/resolution UI.
- Do not use device wall-clock time as sole ordering authority.
- Stock movements and invoice postings are events and should merge by idempotent append, not last-write-wins.
- For product/customer edits, use version checks and explicit conflict resolution.
- Document conflict policy for barcode remaps and settings.
- Never silently discard a local transaction.
- Provide last-sync timestamp and unsynced count.
- Test process kill, device restart, network loss, duplicate delivery, out-of-order delivery and partial server failure.

## 8. Security and privacy baseline

Create `docs/SECURITY.md` and a lightweight threat model covering device loss, unauthorized staff, malicious API calls, local DB extraction, network interception, dependency compromise and backup leakage.

Required controls:
- TLS for all network traffic.
- Secure platform storage for refresh tokens and encryption keys.
- Encrypt sensitive local data and backups; document platform-specific limitations.
- Never embed private API keys or service credentials in mobile/desktop client.
- Server-side authorization for every protected endpoint and operation.
- Default-deny permission model; test authorization independent of UI.
- Validate all inputs at API and domain boundaries.
- Use parameterized queries/ORM and safe serialization.
- Rate-limit authentication and sensitive endpoints.
- Secure session expiry, refresh, revocation and logout.
- Avoid PII in logs; redact tokens, passwords, payment data and customer details.
- Do not store card PAN/CVV.
- Minimize customer data collection and define retention/export/delete policies.
- Audit barcode changes, stock adjustments, invoice posting/cancellation, refunds, role changes and settings changes.
- Protect exports and backups with authorization.
- Add dependency, secret and static analysis scans to CI.
- Handle deep links and file imports defensively.
- Provide secure error messages without stack traces in production.

## 9. Localization

- Externalize every user-visible string from the first commit.
- Provide `en`, `hi` and `mr` resource files.
- Never concatenate translated sentence fragments; use interpolation/plural rules.
- Use locale-aware number, date and currency formatting.
- Support Unicode names, addresses and product descriptions in storage, search and PDF.
- Ensure layouts handle longer translations and text scaling.
- Keep business data language-neutral; do not translate stored product names automatically.
- Invoice PDF/print fonts must support Devanagari; verify embedded font licensing and printer capability.
- Add missing-translation checks to CI.

## 10. Testing strategy — required for every story

### Unit tests
- Domain invariants, validators, barcode rules/check digits, price/tax/discount/rounding calculations, permissions, stock balance projections and sync conflict policies.

### Integration tests
- SQLite repositories and migrations.
- API contracts, authz and transaction boundaries.
- Invoice finalization atomicity.
- Idempotency and outbox processing.
- Printer/scanner adapter contract tests using mocks plus hardware tests.

### UI / end-to-end tests
- Onboarding and sign-in.
- Create product → generate barcode → print label.
- Scan product → stock IN and stock OUT.
- Create customer → scan items → pay → invoice.
- Offline invoice → restart app → reconnect → sync exactly once.
- Barcode replacement and collision rejection.
- Return/cancel and stock/financial reversal.
- Language switch and Devanagari invoice output.

### Negative and boundary tests
- Empty/malformed barcode, unsupported symbology, duplicate code, invalid check digit.
- Insufficient stock, zero/negative quantity, fractional quantity precision.
- Very large totals, rounding boundaries, discount limits and tax effective-date boundary.
- Duplicate clicks, retry after timeout and app crash during posting.
- Camera denied, printer unavailable, scanner disconnect.
- Role bypass via direct API request.
- Expired session and revoked user.
- Corrupt local DB/backup and failed migration.
- Missing translation and narrow screen overflow.

### Quality gates
Every PR must pass:
- Formatting and lint.
- Strict typecheck.
- Unit and integration tests.
- Critical E2E tests.
- Production build.
- Dependency and secret scans.
- Migration validation.
- No critical/high unresolved security findings without explicit risk acceptance.

Do not lower test coverage thresholds merely to make CI green. Prefer meaningful branch coverage for financial, inventory, authorization and sync logic.

## 11. Delivery workflow for Cursor / Claude

For each story or story group:
1. Read the story and dependencies.
2. Restate acceptance criteria and identify edge cases.
3. Inspect relevant code and architecture docs.
4. Propose files to add/change and migration/API impacts.
5. Implement domain logic first, then persistence/API, then UI/device integration.
6. Add tests before or alongside implementation.
7. Run formatting, lint, typecheck, targeted tests, full tests and build.
8. Inspect responsive layouts and all UI states.
9. Update docs and story status.
10. Summarize files changed, behavior delivered, commands run, test results, known limitations and next story.

Maintain `docs/IMPLEMENTATION_TRACKER.md` with:
- Story ID, status (Not Started / In Progress / Blocked / Done)
- Acceptance criteria checklist
- PR/commit reference
- Tests and results
- Open questions and risks

Never mark a story Done while a required acceptance criterion is untested or unsupported.

## 12. Initial task to execute when this skill is activated

Do not immediately build all features. First:
1. Inspect workspace and report whether it is empty.
2. Read the SRS/user stories if present.
3. Confirm toolchain and target OS constraints.
4. Recommend one coherent stack based on camera, printer, offline and desktop requirements.
5. Create `docs/ARCHITECTURE.md`, ADRs, `docs/DEVELOPMENT_SETUP.md`, `docs/SECURITY.md`, `docs/TEST_STRATEGY.md` and the implementation tracker.
6. Scaffold all greenfield boilerplate.
7. Verify clean setup, lint, typecheck, tests and app launch.
8. Then implement the first vertical slice only: business setup + product catalogue + local persistence, with tests.
9. Stop and report evidence before proceeding to the next slice unless the user has explicitly asked for autonomous end-to-end implementation.

## 13. Response format after each work session

Report:
- Completed story IDs and acceptance criteria.
- Architecture or dependency decisions made.
- Files created/changed.
- Tests/commands executed and pass/fail output.
- Security and UX checks performed.
- Remaining blockers/assumptions.
- Exact next recommended story.

Be candid. Never claim physical printer tests, iOS builds or hardware compatibility unless actually run on the relevant hardware/toolchain.
