import { useMemo } from 'react';
import { View } from 'react-native';
import { KpiRow, StatCard } from '@/components/ui';
import { ErrorState, ListSkeleton } from '@/components/feedback';
import { Funnel, PaymentDotPlot, type FunnelStage } from '@/components/viz';
import { isDraft, isPaid, num, plural, type Invoice } from '@/lib/ledger';
import { useLedger } from '@/lib/useLedger';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { randWhole } from './findings';
import { InsightCard, InsightEmpty, TabIntro, TabScroll } from './InsightCard';
import { OwedNow } from './OwedNow';
import { habitRows, owedRows, paidSummary } from './series';

const KEYS = ['invoices'] as const;
const up = (s?: string | null) => (s || '').toUpperCase();

/**
 * Insights > Getting paid: how fast invoices turn into cash and who to chase.
 * Headline figures first, then what is overdue now (to act on), then how each
 * customer has paid over the last 12 months (the habit), then the invoice-to-cash
 * funnel. Reads only; chasing happens on the invoice.
 */
export function PaidTab() {
  const ledger = useLedger([...KEYS]);
  const { nav, goTab, openInvoice } = useAppNavigation();
  const data = ledger.data;

  const view = useMemo(() => {
    if (!data) return null;
    const live = data.invoices.filter((i) => !['CANCELLED', 'VOID'].includes(up(i.status)));
    const sent = live.filter((i) => !isDraft(i));
    const paid = sent.filter(isPaid);
    const sum = (l: Invoice[]) => l.reduce((s, i) => s + num(i.total_amount), 0);
    const stages: FunnelStage[] = [
      { key: 'raised', label: 'Raised', sub: randWhole(sum(live)), count: live.length },
      { key: 'sent', label: 'Sent', sub: randWhole(sum(sent)), count: sent.length, dropNote: 'still drafts' },
      { key: 'paid', label: 'Paid in full', sub: randWhole(sum(paid)), count: paid.length, dropNote: 'sent, not yet paid' },
    ];
    return {
      live: live.length,
      stages,
      summary: paidSummary(data.invoices),
      owed: owedRows(data.invoices),
      habit: habitRows(data.invoices),
    };
  }, [data]);

  if (ledger.loading) {
    return (
      <View className="p-screen">
        <ListSkeleton rows={3} />
      </View>
    );
  }
  if (ledger.error || !data || !view) return <ErrorState onRetry={ledger.retry} message="Couldn't load invoices." />;

  const partial = data.partial.length ? ` Based on the ${data.partial.join(', ')}.` : '';
  const { summary: s, owed, habit } = view;

  return (
    <TabScroll keys={KEYS}>
      <TabIntro text="How fast invoices turn into cash, and who to chase" />

      {view.live === 0 ? (
        <InsightCard title="Invoice to cash" description="Every invoice, by the furthest stage reached">
          <InsightEmpty
            text="No invoices yet."
            action={{ label: 'Create an invoice', onPress: () => nav.navigate('CreateInvoice') }}
          />
        </InsightCard>
      ) : (
        <>
          <View className="mb-3">
            <KpiRow>
              <StatCard
                label="Typical days to pay"
                value={s.medianDays == null ? 'n/a' : String(s.medianDays)}
                sub={
                  s.medianDays == null
                    ? 'Nothing paid in 12 months'
                    : s.usualTerms != null
                      ? `Terms usually ${s.usualTerms}`
                      : 'Last 12 months'
                }
              />
              <StatCard
                label="Paid on time"
                value={s.onTimePct == null ? 'n/a' : `${Math.round(s.onTimePct)}%`}
                sub={s.judged ? `${s.onTime} of ${s.judged} invoices` : 'Last 12 months'}
              />
              <StatCard
                label="Overdue now"
                value={randWhole(s.overdueBalance)}
                sub={
                  s.overdueInvoices
                    ? `${plural(s.overdueInvoices, 'invoice')}, ${plural(s.overdueCustomers, 'customer')}`
                    : 'Nothing overdue'
                }
              />
              <StatCard
                label="Over 90 days"
                value={randWhole(s.over90)}
                note={s.over90 > 0 ? 'Chase or mark paid' : undefined}
                sub={s.over90 > 0 ? undefined : 'None'}
                tone={s.over90 > 0 ? 'danger' : undefined}
              />
            </KpiRow>
          </View>

          <InsightCard
            title="Owed now"
            description="Overdue balance, by customer"
            info={`Open invoices past their due date, grouped by customer, biggest first. The bar splits each customer's overdue rand by how late it is, on one scale for the list. These are the same figures as Finance > Reports > Debtors age. Amounts include VAT.${partial}`}
            action={{ label: 'Debtors age', onPress: () => goTab('Finance', { tab: 'reports' }) }}
          >
            {owed.length === 0 ? (
              <InsightEmpty text="Nobody is overdue." />
            ) : (
              <OwedNow rows={owed} />
            )}
          </InsightCard>

          <InsightCard
            title="How customers pay"
            description="Paid invoices, last 12 months, against the due date"
            info={`Each dot is an invoice paid in the last 12 months, placed by how many days after its due date it was paid (left of Due is early). Bigger dots are bigger invoices. The bar is the customer's usual day, weighted by amount, and customers are ranked by it. Later than 90 days sits in the 90+ strip. Customers with fewer than 3 paid invoices are drawn hollow. Open invoices are in Owed now.${partial}`}
          >
            {habit.length === 0 ? (
              <InsightEmpty text="No invoices paid in the last 12 months." />
            ) : (
              <PaymentDotPlot rows={habit} maxRows={10} onOpenInvoice={openInvoice} />
            )}
          </InsightCard>

          <InsightCard
            title="Invoice to cash"
            description="Every invoice, by the furthest stage reached"
            info={`Raised: every invoice that is not cancelled. Sent: no longer a draft. Paid in full: status Paid. Amounts include VAT.${partial}`}
          >
            <Funnel noun="invoice" stages={view.stages} />
          </InsightCard>
        </>
      )}
    </TabScroll>
  );
}
