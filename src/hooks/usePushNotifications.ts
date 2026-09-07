import { useEffect, useRef } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { getMessagingLib, getNotifeeLib } from '@/lib/pushNative';
import { registerForPush, presentForeground, syncBadge } from '@/lib/push';
import { resolveNotificationLink } from '@/lib/notificationLink';
import { invalidateForServerEvent } from '@/lib/queryInvalidation';
import { useUnreadCount } from '@/features/more/api';
import { useAuthStore } from '@/stores/authStore';
import type { AppStackParamList } from '@/navigation/types';

// Push wiring for the signed-in app. Mounted inside AppNavigator so a
// navigator always exists when a tap needs to route somewhere, and so the
// registration POST always carries an auth header.

type Nav = {
  navigate: (screen: keyof AppStackParamList, params?: Record<string, unknown>) => void;
};

export function usePushNotifications() {
  const navigation = useNavigation<Nav>();
  const qc = useQueryClient();
  const { data: unread } = useUnreadCount();
  // Registration is once per mount; a re-render must not re-POST.
  const registered = useRef(false);

  // The backend puts the event name (quote.accepted, invoice.paid, …) in the
  // FCM data payload as `event_id`. It used to be ignored and only the bell was
  // refreshed; routing it through the shared map means a push also updates the
  // screens the change actually affects — which matters when the WebSocket is
  // down or the app was killed.
  const refreshLists = (event?: string) => invalidateForServerEvent(qc, event ?? '');

  // Ask for permission and register the device.
  useEffect(() => {
    if (registered.current) return;
    registered.current = true;
    // Every demo visitor shares one Django user, so registering this device's
    // FCM token against it would collect tokens from unrelated visitors on
    // one account and cross-deliver their notifications to each other.
    if (useAuthStore.getState().user?.is_demo) return;
    void registerForPush().catch(() => {
      // Denied permission or an offline first launch is not an error worth
      // interrupting the user for — the in-app list still works.
    });
  }, []);

  // Keep the springboard badge in step with the server's unread count.
  useEffect(() => {
    void syncBadge(unread ?? 0);
  }, [unread]);

  useEffect(() => {
    const open = (data?: Record<string, unknown>) => {
      const target = resolveNotificationLink(
        typeof data?.link === 'string' ? data.link : undefined,
      );
      // No usable link → the list is the honest destination.
      if (!target) {
        navigation.navigate('Notifications');
        return;
      }
      navigation.navigate(target.screen, target.params);
    };

    // Expo Go has neither native library; the app runs, push is simply inert.
    const fb = getMessagingLib();
    const notifeeLib = getNotifeeLib();
    if (!fb || !notifeeLib) return;
    const { notifee, EventType } = notifeeLib;

    const fcm = fb.getMessaging();

    // Foreground: FCM does NOT display these itself, so present them and
    // refresh the list behind them.
    const unsubMessage = fb.onMessage(fcm, async (msg) => {
      const data = (msg.data ?? {}) as Record<string, string>;
      refreshLists(data.event_id);
      const title = msg.notification?.title ?? 'Truckwys';
      const body = msg.notification?.body ?? '';
      await presentForeground(title, body, data, data.channel);
    });

    // Tapping a notification the OS displayed while the app was backgrounded.
    const unsubOpened = fb.onNotificationOpenedApp(fcm, (msg) => {
      refreshLists((msg.data?.event_id as string | undefined) ?? '');
      open(msg.data);
    });

    // Tapping one we presented ourselves in the foreground.
    const unsubNotifee = notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.PRESS) open(detail.notification?.data);
    });

    // Cold start: the app was killed and the listeners above did not exist when
    // the tap happened, so the intent is only readable once, here.
    void fb.getInitialNotification(fcm).then((msg) => {
      if (!msg) return;
      refreshLists((msg.data?.event_id as string | undefined) ?? '');
      open(msg.data);
    });

    return () => {
      unsubMessage();
      unsubOpened();
      unsubNotifee();
    };
    // navigation/qc identities are stable for the life of the navigator.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
