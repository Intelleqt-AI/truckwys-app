@AGENTS.md

use <TouchableOpacity /> for button when ever you need in future.

## OTA updates (EAS Update)

App is configured for EAS Update (`expo-updates`, `runtimeVersion.policy: 'fingerprint'`, channels matching each `eas.json` build profile). push JS/asset-only OTA updates with:

```
npm run update:prod -- --message "your update message"
```

Native changes (new native modules, `plugins` array/config changes, entitlements/permissions, `expo-build-properties`/`expo-splash-screen` native config) still require a full `eas build` + submit — they cannot ship via `eas update`.
