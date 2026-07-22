import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  SheetScreen,
  StatCard,
  Group,
  ListRow,
  SectionLabel,
  Badge,
  Txt,
  Mono,
} from '@/components/ui';
import type { BadgeTone } from '@/components/ui/primitives';
import { ListSkeleton, ErrorState } from '@/components/feedback';
import { useCustomerRisk } from './api';
import { asArray, num, str, pick } from '@/lib/api/list';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { useTheme } from '@/theme/ThemeProvider';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'CustomerRisk'>;

const BAND_TONE: Record<string, BadgeTone> = {
  LOW: 'success',
  MEDIUM: 'warning',
  HIGH: 'danger',
  CRITICAL: 'danger',
  NEW: 'neutral',
};
const BAND_COLOR: Record<string, string> = {
  LOW: '#22C55E',
  MEDIUM: '#F59E0B',
  HIGH: '#FF4949',
  CRITICAL: '#FF4949',
  NEW: '#888888',
};

export function CustomerRiskScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const { data, isLoading, isError, refetch } = useCustomerRisk(id);

  const r = (data ?? {}) as Record<string, unknown>;
  const band = str(pick(r, ['band']), 'NEW').toUpperCase();
  const riskPct = num(pick(r, ['risk_pct']));
  const stats = (pick(r, ['stats']) ?? {}) as Record<string, unknown>;
  const rows = asArray(pick(r, ['rows']));
  const summary = str(pick(r, ['ai_summary']));
  const insufficient = pick(r, ['insufficient_history']) === true;

  return (
    <RiskBody
      title={str(pick(r, ['customer_name']), 'AI analysis')}
      onBack={() => navigation.goBack()}
    >
      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : isError ? (
        <ErrorState onRetry={refetch} message="Couldn't load the risk profile." />
      ) : (
        <>
          <RiskBadge band={band} riskPct={riskPct} />

          <View className="mb-5 flex-row flex-wrap gap-3">
            <View style={{ width: '47.5%' }}>
              <StatCard label="AI risk" value={`${riskPct}%`} />
            </View>
            <View style={{ width: '47.5%' }}>
              <StatCard label="Avg days to pay" value={`${num(pick(stats, ['avg_days_to_pay']))}d`} />
            </View>
            <View style={{ width: '47.5%' }}>
              <StatCard label="On-time rate" value={`${num(pick(stats, ['on_time_pct']))}%`} />
            </View>
            <View style={{ width: '47.5%' }}>
              <StatCard label="Overdue >30d" value={formatCurrency(num(pick(stats, ['overdue_30_total'])), { maximumFractionDigits: 0 })} />
            </View>
          </View>

          {summary ? (
            <>
              <SectionLabel>AI summary</SectionLabel>
              <View className="mb-5 rounded-xs border border-line bg-surface p-4">
                <Txt className="text-sub text-muted">{summary}</Txt>
              </View>
            </>
          ) : null}

          {insufficient ? (
            <View className="rounded-xs border border-line bg-surface p-4">
              <Txt className="text-sub text-muted">
                Not enough payment history yet — the risk profile sharpens as invoices are paid.
              </Txt>
            </View>
          ) : (
            <Group label={`Payment behavior (${rows.length})`}>
              {rows.length === 0 ? (
                <View className="px-3.5 py-4">
                  <Txt className="text-sub text-muted">No invoices on record.</Txt>
                </View>
              ) : (
                rows.map((row, i, arr) => {
                  const o = row as Record<string, unknown>;
                  const late = num(pick(o, ['days_late']));
                  const sub = [
                    pick(o, ['due_date']) ? `Due ${formatDate(str(pick(o, ['due_date'])))}` : '',
                    late > 0 ? `${late}d late` : 'On time',
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <ListRow
                      key={String(pick(o, ['invoice_number']) ?? i)}
                      title={str(pick(o, ['invoice_number']), `#${i + 1}`)}
                      subtitle={sub}
                      trailing={
                        <Mono
                          className="text-callout font-semibold"
                          style={{ color: late > 30 ? '#FF4949' : late > 0 ? '#F59E0B' : '#22C55E' }}
                        >
                          {formatCurrency(num(pick(o, ['amount'])), { maximumFractionDigits: 0 })}
                        </Mono>
                      }
                      last={i === arr.length - 1}
                    />
                  );
                })
              )}
            </Group>
          )}
        </>
      )}
    </RiskBody>
  );
}

// Small wrapper so hooks stay above the conditional body.
function RiskBody({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <SheetScreen eyebrow="Risk profile" title={title} onBack={onBack}>
      {children}
    </SheetScreen>
  );
}

function RiskBadge({ band, riskPct }: { band: string; riskPct: number }) {
  const { colors } = useTheme();
  const color = BAND_COLOR[band] ?? colors.muted;
  const tone = BAND_TONE[band] ?? 'neutral';
  return (
    <View className="mb-5 items-center rounded-xs border border-line bg-surface py-6">
      <Mono style={{ fontSize: 44, fontWeight: '700', color }}>{riskPct}%</Mono>
      <View className="mt-2">
        <Badge label={`${band} risk`} tone={tone} />
      </View>
    </View>
  );
}
