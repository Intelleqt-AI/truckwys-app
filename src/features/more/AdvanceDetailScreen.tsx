import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, StatCard, StatusPill, Group, DetailRow, Timeline } from '@/components/ui';
import { View } from 'react-native';
import { ErrorState } from '@/components/feedback';
import { useAdvance } from './api';
import { num, str, pick } from '@/lib/api/list';
import { formatCurrency, formatDate } from '@/lib/formatters';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'AdvanceDetail'>;

const LIFECYCLE = ['REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'DISBURSED', 'REPAID'];

export function AdvanceDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const { data, isError, refetch } = useAdvance(id);
  if (isError && !data) return <ErrorState onRetry={refetch} message="Couldn't load this advance." />;
  const a = (data ?? {}) as Record<string, unknown>;
  const status = str(pick(a, ['status']), 'REQUESTED').toUpperCase().replace(/[\s-]/g, '_');
  const idx = LIFECYCLE.indexOf(status);

  return (
    <SheetScreen eyebrow="Advance" title={formatCurrency(num(pick(a, ['amount', 'advance_amount'])))} onBack={() => navigation.goBack()}>
      <View className="mb-4 flex-row">
        <StatusPill status={status} />
      </View>
      <View className="mb-5 flex-row gap-3">
        <StatCard label="Advance" value={formatCurrency(num(pick(a, ['amount', 'advance_amount'])), { maximumFractionDigits: 0 })} />
        <StatCard label="Fee" value={`${num(pick(a, ['fee_pct', 'fee']))}%`} />
      </View>

      <Group label="Details">
        <DetailRow label="Invoice" value={str(pick(a, ['invoice_number', 'invoice']), '—')} />
        <DetailRow label="Tier" value={str(pick(a, ['tier', 'risk_tier']), '—')} mono={false} />
        <DetailRow label="Repay by" value={formatDate(str(pick(a, ['repayment_date', 'due_date'])) || new Date().toISOString())} last />
      </Group>

      <Group label="Status">
        <View className="p-4">
          <Timeline
            steps={LIFECYCLE.map((s, i) => ({
              label: s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
              done: i <= idx,
            }))}
          />
        </View>
      </Group>
    </SheetScreen>
  );
}
