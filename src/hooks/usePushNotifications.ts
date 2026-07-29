import { useEffect, useRef } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import {
  getMessaging,
  onMessage,
  onNotificationOpenedApp,
  getInitialNotification,
  type RemoteMessage,
} from '@react-native-firebase/messaging';
import notifee, { EventType } from '@notifee/react-native';
import { registerForPush, presentForeground, syncBadge } from '@/lib/push';
import { resolveNotificationLink } from '@/lib/notificationLink';
import { useUnreadCount } from '@/features/more/api';
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

  const refreshLists = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['notifications'] }),
      qc.invalidateQueries({ queryKey: ['notifications-unread'] }),
    ]);

  // Ask for permission and register the device.
  useEffect(() => {
    if (registered.current) return;
    registered.current = true;
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

    const fcm = getMessaging();

    // Foreground: FCM does NOT display these itself, so present them and
    // refresh the list behind them.
    const unsubMessage = onMessage(fcm, async (msg: RemoteMessage) => {
      await refreshLists();
      const title = msg.notification?.title ?? 'Truckwys';
      const body = msg.notification?.body ?? '';
      await presentForeground(title, body, (msg.data ?? {}) as Record<string, string>);
    });

    // Tapping a notification the OS displayed while the app was backgrounded.
    const unsubOpened = onNotificationOpenedApp(fcm, (msg: RemoteMessage) => {
      void refreshLists();
      open(msg.data);
    });

    // Tapping one we presented ourselves in the foreground.
    const unsubNotifee = notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.PRESS) open(detail.notification?.data);
    });

    // Cold start: the app was killed and the listeners above did not exist when
    // the tap happened, so the intent is only readable once, here.
    void getInitialNotification(fcm).then((msg) => {
      if (!msg) return;
      void refreshLists();
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
