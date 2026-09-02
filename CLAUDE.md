@AGENTS.md

use <TouchableOpacity /> for button when ever you need in future.

## OTA updates (EAS Update)

App is configured for EAS Update (`expo-updates`, `runtimeVersion.policy: 'fingerprint'`, channels matching each `eas.json` build profile). push JS/asset-only OTA updates with:

```
npm run update:prod -- --message "your update message"
```

Native changes (new native modules, `plugins` array/config changes, entitlements/permissions, `expo-build-properties`/`expo-splash-screen` native config) still require a full `eas build` + submit — they cannot ship via `eas update`.

The fingerprint that determines the runtime version also hashes `.gitignore`, `eas.json`, and `package.json`'s `scripts` — changing any of those (not just native/plugin config) produces a new runtime version and invalidates OTA compatibility with already-shipped builds. `google-services.json` / `GoogleService-Info.plist` are committed (not read from env) specifically so this hash is reproducible on every machine and in EAS builds — see `PUSH_SETUP.md`.
