# ADR 0001: Cross-platform application and local storage

- Status: Accepted
- Date: 2026-11-04

## Context

The project is greenfield and targets Android, iOS and desktop. Stories require offline-capable catalogue operations, migrations, reusable domain rules, and native shells. Camera and printer integrations are excluded from this delivery.

## Decision

- Expo / React Native and Expo Router provide Android/iOS shells and the shared client UI.
- Expo web export is packaged in a Tauri 2 desktop shell.
- TypeScript strict mode is used for application/domain code.
- SQLite is the only persistence source in this phase. Mobile uses `expo-sqlite`; desktop uses the Tauri SQL plugin.
- Shared domain/application services own validation and permission checks.
- No remote/cloud backend is added until deployment and synchronization requirements are decided.

## Consequences

- Business logic and UI are shared, but native storage adapters are platform-specific.
- Desktop and iOS builds require native toolchains not present on the initial development host.
- There is no cross-device user provisioning, remote authorization, or synchronization.
- Local application role checks are not a security boundary against a modified client or an extracted database.
- Code 128 is used for generated internal barcodes; no GS1 prefix or GTIN is invented.

## Assumptions

- One business per local installation for the MVP.
- Currency defaults explicitly to INR and timezone to Asia/Kolkata, both editable during setup.
- Tax is disabled until configured. Tax identifiers are required only when tax mode is enabled; no tax rates or legal GST rules are assumed.
- The application has no default account. The first-run setup creates an owner and password.
