# SmartBiz POS

SmartBiz POS is a local-first retail POS foundation for small businesses. The current slice covers business onboarding, local user accounts and roles, product categories/units, products, CSV catalogue workflows, and barcode assignment/remapping.

## Stack

- Expo + React Native + Expo Router for Android and iOS, with a web build used by the desktop shell.
- Tauri 2 for the desktop shell.
- TypeScript strict mode for application and domain code.
- Ordered SQLite migrations and platform adapters for local persistence.
- Vitest for domain and persistence tests.

The application has no cloud service or synchronization backend in this phase. Separate devices therefore have separate local databases. See [Architecture](docs/ARCHITECTURE.md) and [Security](docs/SECURITY.md) for boundaries and limitations.

## Prerequisites

- Node.js 24 LTS and npm 10+.
- Android Studio and an Android SDK for Android builds.
- Xcode and its command-line tools for iOS builds (macOS only).
- Rust stable and the platform prerequisites required by Tauri 2 for desktop builds.

Use Node.js 24 and the committed npm lockfile. On macOS, Android builds require Android Studio and an SDK; iOS builds require the full Xcode installation; desktop builds require Rust/Cargo and Tauri's macOS prerequisites. The development setup guide records the toolchains verified on the current host.

## Install and run

```sh
npm ci
npm run start --workspace @smartbiz/mobile
```

In another terminal:

```sh
npm run android --workspace @smartbiz/mobile
npm run ios --workspace @smartbiz/mobile
PATH="$HOME/.cargo/bin:$PATH" npm run tauri:dev --workspace @smartbiz/desktop
```

On macOS, the desktop command launches the native Tauri app. The PATH prefix is only needed if Rust was installed under `~/.cargo/bin` and that directory is not already on PATH. The iOS command requires full Xcode; Android requires an emulator or connected device and an installed Android SDK.

## Quality checks

```sh
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

`npm run build` exports the shared Expo web client used by the Tauri shell. It does not certify native Android, iOS, or Tauri packaging.

Build the native desktop application and macOS bundles with:

```sh
PATH="$HOME/.cargo/bin:$PATH" npm run tauri:build --workspace @smartbiz/desktop
```

The generated `.app` and `.dmg` are under `apps/desktop/src-tauri/target/release/bundle/`. A generated bundle is not signed or notarized for distribution.

## Local database

The app applies ordered SQL migrations on first launch. Database files and WAL sidecars are local-only and ignored by Git. Schema changes must be added as a new migration; never edit a migration that has shipped.

## Notes

- Money is represented as integer minor units (paise); user-entered amounts are parsed from decimal strings without floating-point arithmetic.
- Barcode generation creates an internal Code 128 identifier. It is not a registered GTIN.
- Camera scanning, external scanner integrations, printing, cloud sync, invoicing, inventory posting and GST calculations are not included in this phase.
- There are no production credentials or default passwords. The first-run owner creates the initial account.

See [Development setup](docs/DEVELOPMENT_SETUP.md), [Architecture](docs/ARCHITECTURE.md), [Data model](docs/DATA_MODEL.md), [Security](docs/SECURITY.md), [Test strategy](docs/TEST_STRATEGY.md), the [implementation tracker](docs/IMPLEMENTATION_TRACKER.md), [known limitations](docs/KNOWN_LIMITATIONS.md), [release notes](docs/RELEASE_NOTES.md), and the [internship handover](docs/INTERNSHIP_HANDOVER.md).
