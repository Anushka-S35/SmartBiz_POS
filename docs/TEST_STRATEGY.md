# Test strategy

## Automated checks

- ESLint and Prettier for source quality/format.
- TypeScript strict typecheck for application packages.
- Vitest unit tests for validators, permission policy, exact money/quantity parsing, barcode validation/generation and use cases.
- SQLite integration tests against a real SQLite implementation for migrations, constraints and application-service persistence.
- Expo web export as the repeatable frontend build check.
- Tauri macOS release build to verify the native desktop shell and bundle.

## Required negative cases

- Invalid email/phone/tax configuration and incomplete business setup.
- Wrong password, disabled user, session expiry, and role denial through direct use-case calls.
- Duplicate SKU/category, invalid prices/quantities, archived references.
- Unsupported barcode, malformed EAN-13/check digit, duplicate active or retired barcode.
- Remap history/actor/reason retained; cancelled remap has no effect.
- CSV row-level errors and safe handling of malformed data.

## Current gaps and platform validation

The current Vitest suite exercises domain and SQLite persistence but does not contain UI or end-to-end tests. Critical release workflows still need duplicate-submission, offline, retry, and permission coverage as those modules are implemented.

The native Tauri macOS development app, SQLite startup, and release `.app`/`.dmg` build have been verified on this host. Android runtime/build verification is blocked because Android Studio/SDK/`adb` are absent. iOS verification is blocked because only the Command Line Tools are installed, not full Xcode. Browser export is not a substitute for native integration tests.
