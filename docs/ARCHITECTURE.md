# Architecture

## Decision

Use an Expo / React Native client for Android and iOS, and package the same exported web UI inside a Tauri 2 desktop shell. Domain and application services are framework-independent TypeScript. SQLite is the local source of truth. This favors a shared touch-first client while retaining native shells for the agreed platforms.

The repository does not include a cloud API in this phase. Each device owns its local database. Cross-device identity, synchronization, remote authorization, backups, and conflict resolution are intentionally not represented as implemented features.

## Layers

```text
apps/
  mobile/                 Expo Router app (Android, iOS, web export)
  desktop/                Tauri 2 shell for the exported web client
packages/
  core/                   Domain types, validators, use cases, DB ports,
                          migrations, SQLite adapters and policies
docs/
  ADR/                    Architecture decisions
```

- **Presentation:** Expo Router routes and reusable React Native components. Screens call application services, not SQL.
- **Application:** use cases validate actor permissions and coordinate repository operations.
- **Domain:** business entities, money/quantity parsing, barcode validation, authorization policy and invariants.
- **Infrastructure:** SQLite adapters, schema migrations, password hashing, runtime configuration and platform shells. Application use cases currently issue parameterized SQL through the shared database port; separate repository classes are not yet present.

## Platform storage

Mobile uses `expo-sqlite`. The Tauri application uses the SQLite plugin through its desktop adapter. The browser export is for development and desktop packaging; it is not a separately supported cloud-connected web product. Database calls are behind a port so domain tests use real SQLite without device dependencies.

Migration files are ordered and versioned with SQLite `user_version`. Migrations run before authenticated routes are shown. Product/category/user records are business-scoped; the current local installation permits one business profile. Migration 2 enforces that limit in SQLite, including concurrent first-run attempts.

## Security boundary

This is a local single-installation app. Role checks in application services prevent normal UI and service callers from bypassing permissions. They do not provide server-side authorization against an attacker who can modify the app or local database. A remote API and server-side authorization are required before multi-device or hosted use.

Passwords are never stored in plaintext. Password verification uses salted PBKDF2-SHA-256 from the platform-independent crypto implementation. User sessions are memory-only and expire; the app does not persist session tokens.

## Error handling and logging

Expected input and authorization failures use typed domain errors and are shown as actionable messages. Unexpected errors are reported at the application boundary without logging submitted form values, passwords, tokens, customer data or database contents. Development diagnostics may include stack traces; production UI must not expose them.

## Explicitly deferred

- Remote API, cloud deployment, sync/outbox, trusted-device enrollment and multi-device conflict policy.
- Camera scanning, external scanner drivers, printer adapters, print jobs and physical device validation.
- Invoice, payment, stock ledger, tax calculation, reporting and backup/restore workflows.
- Product imagery persistence and variant-specific catalogue data.

These are later phases, not simulated in this client.
