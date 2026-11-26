# SmartBiz POS

SmartBiz POS is a local-first retail POS foundation for small businesses. The current slice covers business onboarding, local user accounts and roles, product categories/units, products, CSV catalogue workflows, and barcode assignment/remapping.

## Stack

- Expo + React Native + Expo Router for Android and iOS, with a web build used by the desktop shell.
- Tauri 2 for the desktop shell.
- TypeScript strict mode for application and domain code.
- Ordered SQLite migrations and platform adapters for local persistence.
- Vitest for domain and persistence tests.

The application has no cloud service or synchronization backend in this phase. Separate devices therefore have separate local databases. See [Architecture](docs/ARCHITECTURE.md) and [Security](docs/SECURITY.md) for boundaries and limitations.

## Prerequisites (macOS)

Install these in order before running any project command.

### A. Node.js 24 LTS (required)
```sh
node --version
# If missing or not v24.x:
brew install node@24
# or via nvm:
nvm install 24 && nvm use 24
npm --version   # should be 10.x+
```

### B. Git (required)
```sh
git --version
# Install if missing: brew install git
```

### C. Android Studio + Android SDK (required for Android APK builds)
1. Download and install **Android Studio**: https://developer.android.com/studio
2. Open Android Studio → **SDK Manager** → install:
   - Android SDK Platform (API 36)
   - Android SDK Build-Tools 36.0.0
   - Android NDK (latest stable)
   - An emulator (e.g., Pixel 8 API 36) if you don't have a physical device
3. Add to your shell config (`~/.zshrc` or `~/.bash_profile`):
   ```sh
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   export ANDROID_SDK_ROOT="$HOME/Library/Android/sdk"
   export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools:$ANDROID_HOME/tools/bin"
   ```
4. Apply: `source ~/.zshrc`

### D. Java 17 (required for Android Gradle Plugin)
```sh
brew install openjdk@17
# Add to shell config:
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export PATH="$JAVA_HOME/bin:$PATH"
java -version   # should show 17.0.x
```

### E. Rust + Tauri Prerequisites (desktop builds only)
Skip if you only need the mobile APK.
```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
brew install cmake pkg-config openssl
cargo --version
```

### F. Xcode (iOS builds only, macOS)
Skip if you only need Android.
```sh
# Install Xcode from the Mac App Store, then:
xcode-select --install
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

## Install and Run Dependencies

```sh
# Clone the repository
git clone https://github.com/Anushka-S35/SmartBiz_POS.git
cd SmartBiz_POS

# Install all workspace dependencies using the committed lockfile
npm ci

# Verify installation
npm run typecheck   # should pass with no errors
npm run lint        # should pass with no warnings
npm test            # all tests should pass
```

## Run on macOS

### Mobile app (Expo development server)
```sh
npm run start --workspace @smartbiz/mobile
```
Press `a` in the terminal to open on Android emulator/device, or `i` for iOS.

### Android (emulator or connected device)
```sh
npm run android --workspace @smartbiz/mobile
```
Requires Android Studio SDK + an emulator or physical Android device with USB debugging enabled.

### iOS (macOS only)
```sh
npm run ios --workspace @smartbiz/mobile
```
Requires full Xcode installation.

### Desktop shell (Tauri, macOS only)
```sh
PATH="$HOME/.cargo/bin:$PATH" npm run tauri:dev --workspace @smartbiz/desktop
```

## Quality checks

```sh
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

`npm run build` exports the shared Expo web client used by the Tauri shell. It does not certify native Android, iOS, or Tauri packaging.

## Build Android Debug APK on macOS

This builds a debug `.apk` that you can install on any Android device or emulator.

### Step-by-step
```sh
cd apps/mobile/android

# Set Java 17 and Android SDK paths
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$HOME/Library/Android/sdk"

# Build the debug APK
./gradlew assembleDebug --no-daemon
```

### Where the APK is created
```
/Users/your-username/Documents/SmartBiz_POS/apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

### Verify the APK
```sh
ls -la apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
file apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
unzip -t apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

### Install on a connected device
```sh
adb install apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

### Clean rebuild (if the APK seems stale)
```sh
./gradlew clean assembleDebug --no-daemon
```

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
