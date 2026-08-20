import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * Lazy access to the two native push libraries.
 *
 * Expo Go ships a fixed set of native modules and neither Firebase nor Notifee
 * is in it. A static `import … from '@react-native-firebase/messaging'` throws
 * "Native module NativeRNFBTurboApp is not registered" while the module graph is
 * still being evaluated — before any runtime guard of ours can execute — so the
 * whole app fails to boot rather than just push failing. authStore imports
 * lib/push, which made that unavoidable on every launch.
 *
 * Reaching both through require() behind this flag keeps the app bootable in
 * Expo Go for day-to-day JS work, with push inert there and completely
 * unchanged in development and production builds, which do have the modules.
 *
 * Push cannot be tested in Expo Go regardless: Expo removed remote
 * notifications from it on Android in SDK 53. So nothing is lost by disabling
 * it there.
 */
export const IS_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

type MessagingModule = typeof import('@react-native-firebase/messaging');
type NotifeeModule = typeof import('@notifee/react-native');

let messagingCache: MessagingModule | null = null;
let notifeeCache: NotifeeModule | null = null;

/** FCM's named exports, or null in Expo Go. */
export function getMessagingLib(): MessagingModule | null {
  if (IS_EXPO_GO) return null;
  if (!messagingCache) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    messagingCache = require('@react-native-firebase/messaging') as MessagingModule;
  }
  return messagingCache;
}

/**
 * Notifee's default export alongside the enums we use, or null in Expo Go.
 * Flattened so callers never touch `.default` themselves.
 */
export function getNotifeeLib() {
  if (IS_EXPO_GO) return null;
  if (!notifeeCache) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    notifeeCache = require('@notifee/react-native') as NotifeeModule;
  }
  return {
    notifee: notifeeCache.default,
    EventType: notifeeCache.EventType,
    AndroidImportance: notifeeCache.AndroidImportance,
    AuthorizationStatus: notifeeCache.AuthorizationStatus,
  };
}
