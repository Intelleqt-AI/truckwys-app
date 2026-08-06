import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, StatCard, StatusPill, Group, DetailRow, Timeline } from '@/components/ui';
import { View } from 'react-native';
import { ErrorState } from '@/components/feedback';
import { useAdvance } from './api';
import { num, str, pick } from '@/lib/api/list';
import { formatCurrency, formatDate, formatPercent } from '@/lib/formatters';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'AdvanceDetail'>;

const LIFECYCLE = ['REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'DISBURSED', 'REPAID'];

// The risk tier lives on the nested risk_score_detail, not at the top level.
function advanceTier(a: Record<string, unknown>): string {
  const detail = a.risk_score_detail as Record<string, unknown> | null | undefined;
  return str(pick(a, ['risk_tier'])) || (detail ? str(pick(detail, ['tier', 'risk_tier'])) : '') || '—';
}

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
        {/* AdvanceRequestSerializer calls these fee_percent / invoice_due_date,
            and puts the tier under risk_score_detail — the old fee_pct / tier /
            repayment_date keys don't exist on it, so Fee read 0% and Tier and
            Repay-by both read "—" on every advance. */}
        <StatCard label="Fee" value={formatPercent(num(pick(a, ['fee_percent', 'fee_pct'])), 2)} />
      </View>

      <Group label="Details">
        <DetailRow label="Invoice" value={str(pick(a, ['invoice_number', 'invoice']), '—')} />
        <DetailRow label="Tier" value={advanceTier(a)} mono={false} />
        <DetailRow label="Repay by" value={formatDate(str(pick(a, ['invoice_due_date', 'due_date'])) || new Date().toISOString())} last />
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
