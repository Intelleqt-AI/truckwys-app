import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, Txt, Mono, EmptyState, Icon } from '@/components/ui';
import { ListSkeleton, ErrorState } from '@/components/feedback';
import { useActivity } from './api';
import { formatRelativeTime } from '@/lib/formatters';
import { useTheme } from '@/theme/ThemeProvider';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'Activity'>;

export function ActivityScreen({ navigation }: Props) {
  const { data, isLoading, isError, refetch } = useActivity();
  const { colors } = useTheme();

  return (
    <SheetScreen eyebrow="Audit" title="Activity" onBack={() => navigation.goBack()}>
      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState onRetry={refetch} message="Couldn't load activity." />
      ) : !data || data.length === 0 ? (
        <EmptyState icon="clock" title="No activity yet" body="Recent actions across your account appear here." />
      ) : (
        <View className="rounded-xs border border-line bg-surface">
          {data.map((a, i) => (
            <View
              key={a.id}
              className={`flex-row gap-3 px-4 py-3 ${i === data.length - 1 ? '' : 'border-b border-line-row'}`}
            >
              <Icon name="clock" size={16} color={colors.faint} />
              <View className="flex-1">
                <Txt className="text-callout text-fg">{a.title}</Txt>
                {a.detail ? <Txt className="mt-0.5 text-caption text-muted">{a.detail}</Txt> : null}
              </View>
              {a.time ? <Mono className="text-micro text-faint">{formatRelativeTime(a.time)}</Mono> : null}
            </View>
          ))}
        </View>
      )}
    </SheetScreen>
  );
}
