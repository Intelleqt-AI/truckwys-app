import { View, Pressable } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, Txt, Mono, EmptyState } from '@/components/ui';
import { ListSkeleton, ErrorState } from '@/components/feedback';
import { useNotifications, markNotificationRead } from './api';
import { formatRelativeTime } from '@/lib/formatters';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'Notifications'>;

export function NotificationsScreen({ navigation }: Props) {
  const { data, isLoading, isError, refetch } = useNotifications();
  const qc = useQueryClient();

  const onRead = async (id: string) => {
    await markNotificationRead(id);
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };

  return (
    <SheetScreen eyebrow="Inbox" title="Notifications" onBack={() => navigation.goBack()}>
      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState onRetry={refetch} message="Couldn't load notifications." />
      ) : !data || data.length === 0 ? (
        <EmptyState icon="bell" title="All caught up" body="You have no notifications right now." />
      ) : (
        <View className="overflow-hidden rounded-xs border border-line bg-surface">
          {data.map((n, i) => (
            <Pressable
              key={n.id}
              onPress={() => !n.read && onRead(n.id)}
              className={`flex-row gap-3 px-4 py-3 active:bg-surface-hover ${
                i === data.length - 1 ? '' : 'border-b border-line-row'
              }`}
            >
              <View
                className="mt-1.5 h-2 w-2 rounded-pill"
                style={{ backgroundColor: n.read ? 'transparent' : '#4D9EFF' }}
              />
              <View className="flex-1">
                <Txt className={`text-callout ${n.read ? 'text-muted' : 'font-medium text-fg'}`}>{n.title}</Txt>
                {n.body ? <Txt className="mt-0.5 text-caption text-muted">{n.body}</Txt> : null}
              </View>
              {n.time ? <Mono className="text-micro text-faint">{formatRelativeTime(n.time)}</Mono> : null}
            </Pressable>
          ))}
        </View>
      )}
    </SheetScreen>
  );
}
