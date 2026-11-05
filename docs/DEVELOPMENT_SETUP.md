# Development setup

## Toolchain baseline

| Tool       | Minimum / recommendation                     | Verified on current host                     |
| ---------- | -------------------------------------------- | -------------------------------------------- |
| Node.js    | 24                                           | 24.12.0                                      |
| npm        | 10+                                          | 11.6.2                                       |
| TypeScript | pinned by package lock                       | 5.9.x                                        |
| Android    | Android Studio + Android SDK                 | Not installed; no `adb` or configured SDK    |
| iOS        | Full Xcode installation                      | Not installed; Command Line Tools only       |
| Desktop    | Rust stable + Tauri 2 platform prerequisites | Rust/Cargo 1.99.1; macOS dev and bundle pass |

Use the committed lockfile with `npm ci`. Do not edit an applied SQL migration; add a new numbered migration.

## Install

```sh
npm ci
```

## Run

```sh
npm run start --workspace @smartbiz/mobile
npm run android --workspace @smartbiz/mobile
npm run ios --workspace @smartbiz/mobile
PATH="$HOME/.cargo/bin:$PATH" npm run tauri:dev --workspace @smartbiz/desktop
```

The Expo web export is used for the desktop frontend; it is not a standalone browser app with SQLite persistence. A normal `localhost` browser page does not share the Tauri database and will show an unsupported-storage message. On macOS, the Tauri command launches the native desktop app and its SQLite database at `~/Library/Application Support/com.smartbiz.pos/smartbiz.db`. Android and iOS each use a separate SQLite database in their respective app sandbox. These installations do not synchronize data. The desktop database was verified at schema version 3 with SQLite integrity checks passing. The PATH prefix is needed only when `~/.cargo/bin` is not already on PATH. iOS commands require full Xcode, and Android commands require the SDK plus an emulator/device.

Build a distributable macOS bundle with:

```sh
PATH="$HOME/.cargo/bin:$PATH" npm run tauri:build --workspace @smartbiz/desktop
```

The `.app` and `.dmg` are written under `apps/desktop/src-tauri/target/release/bundle/`. The build is not code-signed or notarized.

## Validate

```sh
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

## Environment

Only public, non-secret Expo settings are read from `EXPO_PUBLIC_*`. `.env.example` contains placeholders/defaults only. Production credentials must never be embedded in the mobile/desktop bundle.

## Database

The SQLite database is local to each native installation. Tauri loads `sqlite:smartbiz.db` using app identifier `com.smartbiz.pos`; on macOS this resolves to `~/Library/Application Support/com.smartbiz.pos/smartbiz.db`. Android/iOS use Expo SQLite inside their app sandbox. A standalone web browser has no configured persistent database and must not be used to set up or sign in to a desktop account. Removing app data removes local business data. Backups and synchronization are not implemented. Do not copy production data into tests or logs.

## Troubleshooting

- If Metro reports an SDK mismatch, install dependencies with `npm ci` and verify the Expo SDK compatible native packages.
- If an iOS command fails because `xcodebuild` or the iOS SDK is missing, install full Xcode and select it with `xcode-select`.
- If the Tauri command fails because `cargo` is missing, install Rust stable; if it is installed under `~/.cargo/bin`, add that directory to PATH or use the command above.
- If an Android command fails because `adb` or an SDK path is missing, install Android Studio and configure an SDK/emulator.
- If a migration fails, preserve the database and error output for diagnosis; do not delete the database as a routine fix.
- If a normal browser shows an unsupported local-database message, launch the Tauri desktop app instead. Do not reset or recreate setup to resolve a browser/desktop storage mismatch.
