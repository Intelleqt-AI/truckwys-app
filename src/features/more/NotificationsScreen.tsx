import { View, Pressable } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, Txt, Mono, Icon, EmptyState } from '@/components/ui';
import { ListSkeleton, ErrorState } from '@/components/feedback';
import {
  useNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationItem,
} from './api';
import { resolveNotificationLink } from '@/lib/notificationLink';
import { formatRelativeTime } from '@/lib/formatters';
import { status as statusHues } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'Notifications'>;

// Notification `type` mirrors the backend's choices (INFO/SUCCESS/WARNING/ALERT,
// serialized lowercase).
const DOT_COLOR: Record<string, string> = {
  info: statusHues.info,
  success: statusHues.success,
  warning: statusHues.warning,
  alert: statusHues.danger,
};

export function NotificationsScreen({ navigation }: Props) {
  const { data, isLoading, isError, refetch, isRefetching } = useNotifications();
  const qc = useQueryClient();
  const { colors } = useTheme();
  const hasUnread = !!data?.some((n) => !n.read);

  const invalidate = () => invalidateFor(qc, 'notification');

  const onRead = async (id: string) => {
    try {
      await markNotificationRead(id);
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not mark read');
    }
  };

  const readAll = async () => {
    try {
      await markAllNotificationsRead();
      invalidate();
      toast.success('All marked read');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not mark read');
    }
  };

  // Opening a notification is also an acknowledgement of it.
  const open = (n: NotificationItem) => {
    if (!n.read) void onRead(n.id);
    const target = resolveNotificationLink(n.link);
    if (!target) return;
    // The link table is validated at runtime, not by the param-list types, so
    // this dispatch is deliberately untyped.
    (navigation.navigate as (screen: string, params?: Record<string, unknown>) => void)(
      target.screen,
      target.params,
    );
  };

  return (
    <SheetScreen
      eyebrow="Inbox"
      title="Notifications"
      onBack={() => navigation.goBack()}
      // Icon rather than a text button: every other detail screen's header
      // action is an icon, and "Mark all read" was the only word up there.
      actionLabel={hasUnread ? 'Mark all read' : undefined}
      actionIcon={hasUnread ? 'checkCircle' : undefined}
      onAction={hasUnread ? readAll : undefined}
      onRefresh={refetch}
      refreshing={isRefetching}
    >
      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState onRetry={refetch} message="Couldn't load notifications." />
      ) : !data || data.length === 0 ? (
        <EmptyState icon="bell" title="All caught up" body="You have no notifications right now." />
      ) : (
        <View className="overflow-hidden rounded-xs border border-line bg-surface">
          {data.map((n, i) => {
            const linked = !!resolveNotificationLink(n.link);
            return (
              <View
                key={n.id}
                className={`flex-row items-center ${
                  i === data.length - 1 ? '' : 'border-b border-line-row'
                }`}
              >
                <Pressable
                  onPress={() => open(n)}
                  className="min-h-[56px] flex-1 flex-row gap-3 py-3 pl-4 active:bg-surface-hover"
                >
                  <View
                    className="mt-1.5 h-2 w-2 rounded-pill"
                    style={{
                      backgroundColor: n.read ? 'transparent' : DOT_COLOR[n.type] ?? statusHues.info,
                    }}
                  />
                  <View className="flex-1">
                    <Txt className={`text-callout ${n.read ? 'text-muted' : 'font-medium text-fg'}`}>
                      {n.title}
                    </Txt>
                    {n.body ? <Txt className="mt-0.5 text-caption text-muted">{n.body}</Txt> : null}
                    <View className="mt-1 flex-row items-center gap-2">
                      {n.time ? (
                        <Mono className="text-micro text-faint">{formatRelativeTime(n.time)}</Mono>
                      ) : null}
                      {linked && (
                        <Icon name="chevronRight" size={12} color={colors.faint} />
                      )}
                    </View>
                  </View>
                </Pressable>

                {/* Explicit per-row acknowledge. Previously the only way to mark
                    a row read was tapping it, which was invisible and also
                    re-fired on rows that were already read. */}
                {!n.read ? (
                  <Pressable
                    onPress={() => onRead(n.id)}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={`Mark "${n.title}" as read`}
                    className="h-[44px] w-[44px] items-center justify-center active:opacity-40"
                  >
                    <Icon name="check" size={19} color={colors.accent} strokeWidth={2.2} />
                  </Pressable>
                ) : (
                  <View className="w-3" />
                )}
              </View>
            );
          })}
        </View>
      )}
    </SheetScreen>
  );
}
