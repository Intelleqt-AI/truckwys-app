import { ExpoConfig, ConfigContext } from 'expo/config';

// Truckwys mobile — Expo app config.
// Dark-first "operations terminal" UI; no runtime permissions requested.
const DEEP = '#030303';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Truckwys',
  slug: 'truckwys-mobile',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'truckwys',
  userInterfaceStyle: 'automatic',
  backgroundColor: DEEP,
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'za.co.truckwys.mobile',
    buildNumber: '1',
    infoPlist: {
      // Native apps make no cross-origin browser requests; ATS stays on.
      ITSAppUsesNonExemptEncryption: false,
      NSMicrophoneUsageDescription:
        'Truckwys uses the microphone only when you record a voice quote.',
    },
  },
  android: {
    package: 'za.co.truckwys.mobile',
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: DEEP,
      foregroundImage: './assets/android-icon-foreground.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-status-bar',
    'expo-secure-store',
    'expo-image',
    'expo-font',
    'expo-audio',
    'expo-web-browser',
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
      // Set via `eas init`; placeholder until the EAS project is linked.
      projectId: process.env.EAS_PROJECT_ID ?? undefined,
    },
  },
});
