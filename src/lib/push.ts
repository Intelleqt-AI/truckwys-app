import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import {
  getMessaging,
  getToken,
  deleteToken,
  registerDeviceForRemoteMessages,
  isDeviceRegisteredForRemoteMessages,
} from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, AuthorizationStatus } from '@notifee/react-native';
import { postData, deleteData } from '@/lib/api/client';

// Mobile push via Firebase Cloud Messaging — Android natively, iOS through
// FCM's APNs relay. This is the only channel that reaches a closed app; the
// in-app list and the WebSocket cover the foreground.
//
// Mirrors the web push contract (src/lib/push.ts there): probe capability →
// request permission → obtain a token → register it with the backend.

// Mirrors core/services/notify_copy.py's channel_for() on the backend — same
// three ids, same fallback ('bookings'), so a push always lands in the same
// channel whether the OS delivered it itself (backgrounded/killed, driven by
// the server-set AndroidNotification.channel_id) or notifee displayed it here
// (foregrounded).
const CHANNELS = [
  { id: 'bookings', name: 'Bookings & Quotes', description: 'New quotes, bookings and status updates' },
  { id: 'finance', name: 'Payments & Invoices', description: 'Invoice and payment activity' },
  { id: 'fleet', name: 'Fleet Alerts', description: 'Maintenance and driver alerts' },
] as const;
const DEFAULT_CHANNEL_ID = 'bookings';
// Every device that installed before this change already has this channel;
// Android won't let a channel be renamed or merged, only replaced, so it's
// deleted once new installs exist rather than left to confuse Settings.
const LEGACY_CHANNEL_ID = 'default';

// The token this device last registered. Kept in memory so sign-out can
// unregister exactly that row without a round-trip to fetch it.
let registeredToken: string | null = null;

export type PushStatus = 'unsupported' | 'denied' | 'registered';

/** Android needs explicit channels; without one notifications are silent. */
async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  for (const channel of CHANNELS) {
    await notifee.createChannel({ ...channel, importance: AndroidImportance.HIGH, sound: 'default' });
  }
  await notifee.deleteChannel(LEGACY_CHANNEL_ID).catch(() => {
    /* no-op on a fresh install that never had it */
  });
}

/**
 * Ask for permission (if not already decided) and register this device.
 *
 * Call only once the user is signed in — the registration POST needs the auth
 * header, and a token without an owner is useless. Safe to call repeatedly:
 * the backend upsert is keyed on the token.
 */
export async function registerForPush(): Promise<PushStatus> {
  // Simulators have no APNs/FCM registration path.
  if (!Device.isDevice) return 'unsupported';

  await ensureAndroidChannel();

  const settings = await notifee.requestPermission();
  const granted =
    settings.authorizationStatus === AuthorizationStatus.AUTHORIZED ||
    settings.authorizationStatus === AuthorizationStatus.PROVISIONAL;
  if (!granted) return 'denied';

  const fcm = getMessaging();

  // iOS must hold an APNs token before FCM will issue a registration token.
  if (Platform.OS === 'ios' && !isDeviceRegisteredForRemoteMessages(fcm)) {
    await registerDeviceForRemoteMessages(fcm);
  }

  const token = await getToken(fcm);
  if (!token) return 'unsupported';

  await postData({
    url: 'push/devices/',
    data: {
      token,
      platform: Platform.OS,
      device_name: Device.modelName ?? '',
      // Lets the backend tell which build a device is on when a push fails.
      app_version: Constants.expoConfig?.version ?? '',
    },
  });
  registeredToken = token;
  return 'registered';
}

/**
 * Drop this device's registration. Must run on sign-out, otherwise the handset
 * keeps receiving the previous user's notifications.
 */
export async function unregisterPush(): Promise<void> {
  if (!Device.isDevice) return;
  const fcm = getMessaging();
  const token = registeredToken ?? (await getToken(fcm).catch(() => null));
  if (!token) return;
  registeredToken = null;
  try {
    await deleteData({ url: 'push/devices/', data: { token } });
  } catch {
    // The backend prunes tokens FCM reports as unregistered anyway; never let
    // this block sign-out.
  }
  // Stop this install receiving anything until it registers again.
  try {
    await deleteToken(fcm);
  } catch {
    /* best effort */
  }
}

/** Keep the springboard/launcher badge in step with the unread count. */
export async function syncBadge(count: number): Promise<void> {
  try {
    await notifee.setBadgeCount(Math.max(0, count));
  } catch {
    /* badge support is platform-dependent; never throw for it */
  }
}

/**
 * Display a notification that arrived while the app was foregrounded. FCM only
 * auto-displays when the app is backgrounded or killed, so without this the
 * user sees nothing until they open the bell.
 */
export async function presentForeground(
  title: string,
  body: string,
  data?: Record<string, string>,
  channelId: string = DEFAULT_CHANNEL_ID,
) {
  await ensureAndroidChannel();
  await notifee.displayNotification({
    title,
    body,
    data,
    android: {
      channelId,
      smallIcon: 'ic_launcher',
      color: '#4D9EFF',
      pressAction: { id: 'default' },
    },
    ios: { sound: 'default' },
  });
}
