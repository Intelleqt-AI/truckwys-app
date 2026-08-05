import { useMemo, useState } from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, Group, FilterChips, Txt, Mono, EmptyState } from '@/components/ui';
import { ListSkeleton, ErrorState } from '@/components/feedback';
import { useBillingHistory, type BillingCharge } from './api';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { status as statusHues } from '@/theme/tokens';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'BillingHistory'>;

// Every charge to the card on file, split by what it was for — the monthly plan
// and the per-delivery platform fee. Mirrors the web billing-history page.

const PERIODS = ['All time', 'Today', 'This week', 'This month', 'This year'] as const;
type Period = (typeof PERIODS)[number];

/** Monday-start week, matching web's startOfWeek. */
function startOfWeek(d: Date): Date {
  const out = new Date(d);
  const day = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - day);
  out.setHours(0, 0, 0, 0);
  return out;
}

function matchesPeriod(iso: string, period: Period): boolean {
  if (period === 'All time') return true;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return false;
  const now = new Date();
  if (period === 'Today') return t.toDateString() === now.toDateString();
  if (period === 'This week') return t >= startOfWeek(now);
  if (period === 'This month')
    return t.getMonth() === now.getMonth() && t.getFullYear() === now.getFullYear();
  return t.getFullYear() === now.getFullYear();
}

const tone = (status: string) =>
  status === 'complete' ? statusHues.success : status === 'pending' ? statusHues.warning : statusHues.danger;

function ChargeGroup({ title, rows }: { title: string; rows: BillingCharge[] }) {
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  return (
    <View className="mb-5">
      <View className="mb-2 flex-row items-end justify-between">
        <Txt className="text-callout font-medium text-fg">{title}</Txt>
        {rows.length > 0 && (
          <Mono className="text-micro text-faint">
            {rows.length} charge{rows.length === 1 ? '' : 's'} · {formatCurrency(total)}
          </Mono>
        )}
      </View>
      {rows.length === 0 ? (
        <Txt className="text-caption text-faint">No charges in this period</Txt>
      ) : (
        <Group>
          {rows.map((c, i) => (
            <View key={c.id} className={`px-4 py-3 ${i === rows.length - 1 ? '' : 'border-b border-line-row'}`}>
              <View className="flex-row items-center justify-between">
                <Txt className="flex-1 pr-3 text-caption text-fg" numberOfLines={1}>
                  {c.label}
                </Txt>
                <Mono className="text-caption text-fg">{formatCurrency(c.amount)}</Mono>
              </View>
              <View className="mt-1 flex-row items-center gap-2">
                <Mono className="text-micro text-faint">
                  {[c.createdAt ? formatDate(c.createdAt) : '', c.reference].filter(Boolean).join(' · ')}
                </Mono>
                <Mono className="text-micro uppercase" style={{ color: tone(c.status) }}>
                  {c.status}
                </Mono>
              </View>
            </View>
          ))}
        </Group>
      )}
    </View>
  );
}

export function BillingHistoryScreen({ navigation }: Props) {
  const { data, isLoading, isError, refetch } = useBillingHistory();
  const [period, setPeriod] = useState<Period>('All time');

  const filtered = useMemo(
    () => (data ?? []).filter((c) => matchesPeriod(c.createdAt, period)),
    [data, period],
  );
  const plan = filtered.filter((c) => c.kind === 'subscription');
  const fees = filtered.filter((c) => c.kind === 'delivery_fee');

  return (
    <SheetScreen
      eyebrow="Billing"
      title="Billing history"
      onBack={() => navigation.goBack()}
      onRefresh={refetch}
    >
      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState onRetry={refetch} message="Couldn't load billing history." />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon="receipt"
          title="No billing history yet"
          body="Charges appear here after your first transaction."
        />
      ) : (
        <View>
          <Txt className="mb-4 text-sub text-muted">
            Every charge to your card on file — the monthly plan and the per-delivery platform fee.
          </Txt>
          <View className="mb-5">
            <FilterChips
              options={PERIODS.map((p) => ({ label: p, value: p }))}
              value={period}
              onChange={(v) => setPeriod(v as Period)}
            />
          </View>
          <ChargeGroup title="Plan purchased" rows={plan} />
          <ChargeGroup title="Platform fee (per delivery)" rows={fees} />
        </View>
      )}
    </SheetScreen>
  );
}
