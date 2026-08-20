import { ExpoConfig, ConfigContext } from 'expo/config';

// Truckwys mobile — Expo app config.
// Dark-first "operations terminal" UI. Runtime permissions requested: microphone
// (voice quotes), photo library (POD / avatar / logo uploads), notifications
// (operational push). Each has a usage string below.
const DEEP = '#030303';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Truckwys',
  // Must match the EAS project's own slug exactly — the CLI hard-errors on a
  // mismatch (see extra.eas.projectId below, @intelleqt/truckwys).
  slug: 'truckwys',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'truckwys',
  userInterfaceStyle: 'automatic',
  backgroundColor: DEEP,
  assetBundlePatterns: ['**/*'],
  ios: {
    // Phone-only for v1. App Review tests iPad when this is true, and the UI is
    // built for a phone (floating tab bar, pageSheet modals, 2-up stat grids).
    supportsTablet: false,
    bundleIdentifier: 'za.co.truckwys.mobile',
    // buildNumber intentionally omitted — eas.json's cli.appVersionSource is
    // "remote", so EAS's own servers track and auto-increment it per build.
    // A value here would be ignored for the build but still surface via
    // expo-constants, which is misleading. Seed/inspect with
    // `eas build:version:set` / `eas build:version:get --platform ios`.
    // Firebase Cloud Messaging delivers iOS push via APNs. 'production' is
    // correct for TestFlight and App Store builds; EAS rewrites it for dev
    // client builds.
    entitlements: {
      'aps-environment': 'production',
    },
    // Firebase needs GoogleService-Info.plist. Read from env so a build without
    // Firebase configured still succeeds.
    googleServicesFile: process.env.GOOGLE_SERVICES_INFO_PLIST ?? undefined,
    infoPlist: {
      // Native app, HTTPS only, no proprietary cryptography — exempt.
      ITSAppUsesNonExemptEncryption: false,
      NSMicrophoneUsageDescription:
        'Truckwys uses the microphone only when you record a voice quote.',
      NSPhotoLibraryUsageDescription:
        'Truckwys needs access to your photos so you can attach a proof of delivery, a profile picture, or your company logo.',
      // Wakes the app for silent/data pushes so the notification list and badge
      // stay current without opening it.
      UIBackgroundModes: ['remote-notification'],
    },
    // Required-reason API declarations. Undeclared use of these triggers an
    // automated ITMS-91053 rejection on upload.
    privacyManifests: {
      NSPrivacyAccessedAPITypes: [
        {
          // AsyncStorage (the non-secret profile snapshot) writes to UserDefaults.
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
        {
          // expo-file-system writes the generated quote/invoice PDFs to cache.
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
          NSPrivacyAccessedAPITypeReasons: ['C617.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
          NSPrivacyAccessedAPITypeReasons: ['E174.1'],
        },
      ],
    },
  },
  android: {
    package: 'za.co.truckwys.mobile',
    // versionCode intentionally omitted — see the buildNumber comment under
    // ios above; same reasoning, same remote-version-source mechanism.
    adaptiveIcon: {
      backgroundColor: DEEP,
      foregroundImage: './assets/android-icon-foreground.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // Mandatory on Android 13+ (API 33) — without it the runtime prompt never
    // appears and notifications are silently dropped.
    permissions: ['POST_NOTIFICATIONS'],
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? undefined,
    config: {
      // react-native-maps renders Google Maps on Android and needs its own key
      // — the Firebase google-services file does not cover the Maps SDK. iOS
      // uses Apple Maps, which needs no key. Set EXPO_PUBLIC_GOOGLE_MAPS_KEY in
      // the EAS environment; without it the Android map renders blank.
      googleMaps: { apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ?? '' },
    },
  },
  plugins: [
    'expo-secure-store',
    'expo-font',
    'expo-audio',
    'expo-web-browser',
    // Injects NSPhotoLibraryUsageDescription's Android counterparts and the
    // picker's native config.
    [
      'expo-image-picker',
      {
        photosPermission:
          'Truckwys needs access to your photos so you can attach a proof of delivery, a profile picture, or your company logo.',
      },
    ],
    '@react-native-firebase/app',
    '@react-native-firebase/messaging',
    [
      // The Firebase iOS SDK ships as static frameworks; the Android side needs
      // a modern minSdk for FCM.
      'expo-build-properties',
      {
        ios: { useFrameworks: 'static' },
        android: { minSdkVersion: 24 },
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 160,
        resizeMode: 'contain',
        backgroundColor: DEEP,
        dark: { backgroundColor: DEEP },
      },
    ],
  ],
  experiments: {
    tsconfigPaths: true,
    typedRoutes: false,
  },
  extra: {
    eas: {
      // @intelleqt/truckwys — the org project, GitHub-integration-linked to
      // this repo (Intelleqt-AI/truckwys-app) and used for real STORE builds.
      // Not @iamsaif5/truckwys-mobile, an earlier personal-account project
      // created during setup and since abandoned. Not a secret, and fixed for
      // the life of the project — hardcoded so a missing env var can never
      // break a build or stop getToken() issuing a push token.
      projectId: '0ef68ce5-03e0-46d7-b4c4-6fc1a9c5f170',
    },
  },
});
