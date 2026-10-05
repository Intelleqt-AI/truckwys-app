import { useMemo } from 'react';
import { View } from 'react-native';
import { StatCard } from '@/components/ui';
import { ErrorState, ListSkeleton } from '@/components/feedback';
import { Waterfall, type WaterfallStep } from '@/components/viz';
import { PeriodControl, usePeriod } from '@/features/finance/reports/ui';
import { formatCurrencyCompact, formatPercent } from '@/lib/formatters';
import { MONTHS, periodText, plural, type PeriodId } from '@/lib/ledger';
import { useLedger } from '@/lib/useLedger';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { randWhole } from './findings';
import { InsightCard, InsightEmpty, TabIntro, TabScroll } from './InsightCard';
import { chartMonths, marginFromLedger } from './margin';

// The Profit and loss report's periods: whole calendar months, this one included.
// (No year-to-date: the web does not have it, so the two read the same.)
const PERIODS: PeriodId[] = ['this-month', 'last-month', 'last-3', 'last-6', 'last-12', 'custom'];
const HALF = { width: '47.5%' } as const;
const KEYS = ['invoices', 'payments', 'expenses'] as const;

const monthName = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym;
const monthYear = (ym: string) => `${monthName(ym)} ${ym.slice(0, 4)}`;
/** "Apr to Jun 2026" or "Oct 2025 to Jun 2026". */
const monthSpan = (a: string, b: string) =>
  a === b
    ? monthYear(a)
    : a.slice(0, 4) === b.slice(0, 4)
      ? `${monthName(a)} to ${monthYear(b)}`
      : `${monthYear(a)} to ${monthYear(b)}`;

/**
 * Insights > Margin: what you keep after costs, on the Profit and loss report's
 * default basis (excl. VAT, cash basis), so it agrees with the "Costs waiting for
 * approval" finding. Costs are every expense that is not rejected, approved or
 * awaiting approval, net of input VAT; the awaiting-approval part is shown
 * separately for information and is already inside the costs.
 */
export function MarginTab() {
  const [p, setPeriod] = usePeriod('last-12');
  const ledger = useLedger([...KEYS]);
  const { nav } = useAppNavigation();

  const data = ledger.data;
  const r = useMemo(() => (data ? marginFromLedger(data, p) : null), [data, p]);

  if (ledger.loading) {
    return (
      <View className="p-screen">
        <ListSkeleton rows={3} />
      </View>
    );
  }
  if (ledger.error || !data || !r) return <ErrorState onRetry={ledger.retry} message="Couldn't load margin." />;

  const span = periodText(p);
  const partial = data.partial.length ? ` Based on the ${data.partial.join(', ')}.` : '';
  const empty = r.revenue === 0 && r.costs === 0 && r.pending === 0;
  const openPnl = () =>
    nav.navigate('FinanceReport', { report: 'pl', period: { id: p.id, from: p.from, to: p.to } });

  const { shown, before, after } = chartMonths(r.months);
  const crossYear = shown.length > 0 && shown[0]!.ym.slice(0, 4) !== shown[shown.length - 1]!.ym.slice(0, 4);
  const label = (ym: string, k: number) =>
    crossYear && (k === 0 || ym.endsWith('-01')) ? monthYear(ym) : monthName(ym);
  const gap = (list: string[]) => (list.length === 1 ? monthYear(list[0]!) : monthSpan(list[0]!, list[list.length - 1]!));
  const empties = [before.length ? gap(before) : '', after.length ? gap(after) : ''].filter(Boolean);
  const trimNote = empties.length
    ? `No entries in ${empties.join(' or ')}, so ${before.length + after.length === 1 ? 'that month is' : 'those months are'} not drawn; the total covers all of ${span}.`
    : undefined;

  const bridge: WaterfallStep[] = [
    { label: 'Revenue', value: r.revenue, kind: 'total' },
    { label: 'Costs', value: -r.costs, kind: 'delta', tone: 'cost' },
    { label: 'Net margin', value: r.net, kind: 'total' },
  ];
  const monthly: WaterfallStep[] = [
    ...shown.map((m, k) => ({
      label: label(m.ym, k),
      full: monthYear(m.ym),
      value: m.net,
      kind: 'delta' as const,
      emptyText: m.revenue === 0 && m.costs === 0 ? 'Nothing received or approved' : undefined,
      detail: `Revenue ${randWhole(m.revenue)}, costs ${randWhole(m.costs)}`,
    })),
    { label: 'Total', value: r.net, kind: 'total' as const },
  ];

  return (
    <TabScroll keys={KEYS}>
      <TabIntro text="What you keep after approved costs" />

      <View className="mb-2 flex-row flex-wrap gap-3">
        <PeriodControl period={p} onChange={setPeriod} options={PERIODS} />
      </View>

      <InsightCard
        title="Profit this period"
        description={`${span} · excl. VAT, cash (received)`}
        info={`The Profit and loss report's default basis, from the same ledgers. Revenue: money received from customers by payment date, less the VAT share of each invoice (overpayments are not revenue). Costs: every expense that is not rejected, approved or still awaiting approval, by expense date, excl. its input VAT; the part awaiting approval is shown separately for information.${partial}`}
        action={{ label: 'Open the P&L', onPress: openPnl }}
      >
        {empty ? (
          <InsightEmpty
            text={`Nothing received or spent in ${span}.`}
            action={p.id !== 'last-12' ? { label: 'Show the last 12 months', onPress: () => setPeriod('last-12') } : undefined}
          />
        ) : (
          <>
            <View className="mb-4 flex-row flex-wrap gap-3">
              <View className="flex-row" style={HALF}>
                <StatCard
                  label="Revenue"
                  value={formatCurrencyCompact(r.revenue)}
                  sub={plural(r.paymentCount, 'payment')}
                />
              </View>
              <View className="flex-row" style={HALF}>
                <StatCard
                  label="Costs excl. VAT"
                  value={formatCurrencyCompact(r.costs)}
                  sub={r.pending > 0 ? `Includes ${randWhole(r.pending)} awaiting approval` : undefined}
                />
              </View>
              <View className="flex-row" style={HALF}>
                <StatCard
                  label="Net margin"
                  value={r.pct != null ? formatPercent(r.pct) : formatCurrencyCompact(r.net)}
                  sub={r.pct != null ? randWhole(r.net) : 'no revenue received'}
                  delta={r.net < 0 ? 'Loss' : undefined}
                  deltaTone="down"
                />
              </View>
              <View className="flex-row" style={HALF}>
                <StatCard
                  label="Awaiting approval"
                  value={formatCurrencyCompact(r.pending)}
                  sub={
                    r.pending > 0
                      ? `${plural(r.pendingCount, 'expense')}, already in costs`
                      : 'Every cost is approved'
                  }
                />
              </View>
            </View>
            {/* The tiles carry every figure; the bridge shows the shape, values live in the readout. */}
            <Waterfall
              steps={bridge}
              height={200}
              valueHeader="Amount"
              caption={`Revenue, costs and net margin, ${span}, excl. VAT, cash basis`}
            />
          </>
        )}
      </InsightCard>

      {!empty && shown.length > 1 ? (
        <InsightCard
          title="Net margin by month"
          description="Each month's revenue less costs"
          info={`Each month's revenue (money received, excl. VAT) less expenses that are not rejected (excl. VAT), added to the months before. The bars add up to the period's net margin above and to the Net profit line of the P&L.${partial}`}
        >
          <Waterfall
            steps={monthly}
            height={240}
            note={trimNote}
            valueHeader="Net margin"
            caption={`Net margin per month and the running total, ${span}, excl. VAT, cash basis`}
          />
        </InsightCard>
      ) : null}
    </TabScroll>
  );
}
