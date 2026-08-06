import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, Group, ListRow, Badge, Mono, EmptyState, type Tone } from '@/components/ui';
import { ListSkeleton, ErrorState } from '@/components/feedback';
import { useRiskScores } from './api';
import { formatPercent } from '@/lib/formatters';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'RiskScores'>;

const TIER_TONE: Record<string, Tone> = {
  PRIME: 'success',
  STANDARD: 'info',
  ELEVATED: 'warning',
  HIGH: 'danger',
  INELIGIBLE: 'neutral',
};

export function RiskScoresScreen({ navigation }: Props) {
  const { data, isLoading, isError, refetch } = useRiskScores();

  return (
    <SheetScreen eyebrow="Underwriting" title="Risk scores" onBack={() => navigation.goBack()}>
      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState onRetry={refetch} message="Couldn't load risk scores." />
      ) : !data || data.length === 0 ? (
        <EmptyState icon="shield" title="No risk scores" body="Underwriting scores appear as customers are assessed." />
      ) : (
        <Group>
          {data.map((r, i) => (
            <ListRow
              key={r.id || i}
              title={r.customer}
              subtitle={r.fee ? `Fast Pay fee ${formatPercent(r.fee, 2)}` : undefined}
              trailing={
                <View className="items-end gap-1">
                  {r.score ? <Mono className="text-caption text-muted">{r.score}/100</Mono> : null}
                  <Badge label={r.tier} tone={TIER_TONE[r.tier] ?? 'neutral'} />
                </View>
              }
              last={i === data.length - 1}
            />
          ))}
        </Group>
      )}
    </SheetScreen>
  );
}
