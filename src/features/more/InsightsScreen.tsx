import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, Card, Badge, Txt, EmptyState } from '@/components/ui';
import { ListSkeleton, ErrorState } from '@/components/feedback';
import { useInsights, type Signal } from './api';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'Insights'>;

const SEV: Record<Signal['severity'], { bg: string; text: string }> = {
  high: { bg: 'bg-danger-bg', text: 'text-danger' },
  medium: { bg: 'bg-warning-bg', text: 'text-warning' },
  low: { bg: 'bg-info-bg', text: 'text-info' },
};

export function InsightsScreen({ navigation }: Props) {
  const { data, isLoading, isError, refetch } = useInsights();

  return (
    <SheetScreen eyebrow="AI" title="Insights" onBack={() => navigation.goBack()}>
      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState onRetry={refetch} message="Couldn't load insights." />
      ) : !data || data.length === 0 ? (
        <EmptyState icon="sparkle" title="No insights yet" body="AI signals about your operations will appear here." />
      ) : (
        <View className="gap-2.5">
          {data.map((s) => (
            <Card key={s.id} className="p-4">
              <View className="mb-2 flex-row items-center gap-2">
                <Badge label={s.category} className={SEV[s.severity].bg} textClassName={SEV[s.severity].text} />
              </View>
              {s.title ? <Txt className="text-body font-medium text-fg">{s.title}</Txt> : null}
              {s.body ? <Txt className="mt-1 text-sub text-muted">{s.body}</Txt> : null}
            </Card>
          ))}
        </View>
      )}
    </SheetScreen>
  );
}
