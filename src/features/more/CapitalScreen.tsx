import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, SectionLabel, StatCard, Button, Badge, Card, Txt, Mono, EmptyState } from '@/components/ui';
import { ListSkeleton, ErrorState } from '@/components/feedback';
import { useInvoiceAging } from '@/features/finance/api';
import { useCapitalEligible, INVOICE_CHECKS, checksFor, isAccountLevel } from '@/features/finance/fastpay';
import { CAPITAL_COMING_SOON, CAPITAL_LAUNCHED } from '@/lib/features';
import { FastPayLaunched } from '@/features/capital/FastPayLaunched';
import { num } from '@/lib/api/list';
import { formatCurrency } from '@/lib/formatters';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'Capital'>;

// Fast Pay before launch. There is no funding partner yet, so this screen shows
// no facility, limit, availability, fee or timing, and nothing here applies for
// anything. It shows what Fast Pay would work on (the receivables) and the
// invoice checks that would hold invoices back, then how the product will work.
// Mirrors the web's CapitalPrelaunch.

// Backend bucket keys, in age order.
const BUCKETS: { key: string; label: string }[] = [
  { key: 'current', label: 'Not yet due' },
  { key: '1-30', label: '1 to 30 days late' },
  { key: '31-60', label: '31 to 60 days late' },
  { key: '61-90', label: '61 to 90 days late' },
  { key: '90+', label: 'More than 90 days late' },
];

const STEPS = [
  {
    title: 'Pick a delivered invoice',
    body: 'Choose a sent invoice with proof of delivery on file that is no more than 90 days old.',
  },
  {
    title: 'See the numbers first',
    body: 'Before anything is requested you see the fee and the exact amount you would receive.',
  },
  {
    title: 'Get paid, your customer pays later',
    body: 'The money goes to your bank account, and the advance is repaid when your customer settles the invoice.',
  },
];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/**
 * Fast Pay. Before launch (lib/features.ts CAPITAL_LAUNCHED) this is the
 * pre-launch page below; once launched it is the live page, with the line, the
 * application, offers, requests and history (features/capital/FastPayLaunched).
 */
export function CapitalScreen(props: Props) {
  return CAPITAL_LAUNCHED ? <CapitalLive {...props} /> : <CapitalPrelaunch {...props} />;
}

function CapitalLive({ navigation }: Props) {
  return (
    <SheetScreen title="Fast Pay" onBack={() => navigation.goBack()}>
      <FastPayLaunched />
    </SheetScreen>
  );
}

function CapitalPrelaunch({ navigation }: Props) {
  const aging = useInvoiceAging();
  const eligible = useCapitalEligible();

  return (
    <SheetScreen title="Fast Pay" onBack={() => navigation.goBack()}>
      <View className="mb-4 items-start gap-2">
        <Badge label="Coming soon" tone="neutral" />
        <Txt className="text-sub text-muted">Get paid for delivered loads before customers pay.</Txt>
      </View>

      <SectionLabel>Waiting on customers</SectionLabel>
      {aging.isLoading ? (
        <ListSkeleton rows={3} />
      ) : aging.isError || !aging.data?.summary ? (
        <ErrorState onRetry={aging.refetch} message="Couldn't load your unpaid invoices." />
      ) : (
        <WaitingOnCustomers aging={aging.data} />
      )}

      <SectionLabel>Invoice checks</SectionLabel>
      {eligible.isLoading ? (
        <ListSkeleton rows={2} />
      ) : (
        <InvoiceChecks data={eligible.data} />
      )}

      <SectionLabel>How Fast Pay will work</SectionLabel>
      <Card className="mb-5 gap-3 p-4">
        {STEPS.map((step, i) => (
          <View key={step.title} className="flex-row gap-3">
            <Mono className="w-5 text-callout font-semibold text-muted">{i + 1}</Mono>
            <View className="flex-1">
              <Txt className="text-callout font-medium text-fg">{step.title}</Txt>
              <Txt className="mt-0.5 text-sub text-muted">{step.body}</Txt>
            </View>
          </View>
        ))}
        <Button label="Request early payment" disabled fullWidth />
        <Txt className="text-caption text-faint">{CAPITAL_COMING_SOON}</Txt>
      </Card>
    </SheetScreen>
  );
}

function WaitingOnCustomers({ aging }: { aging: NonNullable<ReturnType<typeof useInvoiceAging>['data']> }) {
  const total = num(aging.summary.total_outstanding);
  const count = num(aging.summary.total_invoice_count);
  const customers = num(aging.summary.customer_count);

  if (count === 0 || total <= 0) {
    return (
      <EmptyState
        icon="banknote"
        title="Nothing is waiting"
        body="Every invoice you have sent is paid, so there is nothing Fast Pay would advance today."
      />
    );
  }

  const rows = BUCKETS.map((b) => {
    const hit = aging.buckets?.find((x) => x.bucket_name === b.key);
    return { ...b, amount: num(hit?.total_amount), count: num(hit?.invoice_count) };
  });
  const lateAmount = rows.filter((r) => r.key !== 'current').reduce((s, r) => s + r.amount, 0);
  const lateCount = rows.filter((r) => r.key !== 'current').reduce((s, r) => s + r.count, 0);
  const dso = aging.summary.dso;

  return (
    <View className="mb-5">
      <View className="mb-3 flex-row gap-3">
        <StatCard
          label="Owed to you"
          value={formatCurrency(total, { maximumFractionDigits: 0 })}
          sub={`${plural(count, 'invoice')}, ${plural(customers, 'customer')}`}
        />
        <StatCard
          label="Past its due date"
          value={lateCount === count ? 'All of it' : `${pct(lateAmount, total)}%`}
          sub={lateCount === count ? undefined : `${lateCount} of ${plural(count, 'invoice')}`}
        />
      </View>
      {dso != null && (
        <Txt className="mb-3 text-sub text-muted">Customers take about {Math.round(num(dso))} days to pay.</Txt>
      )}
      <Card>
        {rows.map((r, i) => (
          <View
            key={r.key}
            className={`flex-row items-center justify-between px-3.5 py-3 ${
              i < rows.length - 1 ? 'border-b border-line-row' : ''
            }`}
          >
            <Txt className="flex-1 text-callout text-muted">{r.label}</Txt>
            <Mono className="text-sub font-semibold text-fg">
              {formatCurrency(r.amount, { maximumFractionDigits: 0 })}
            </Mono>
          </View>
        ))}
      </Card>
    </View>
  );
}

function InvoiceChecks({ data }: { data: ReturnType<typeof useCapitalEligible>['data'] }) {
  // Account-level blockers (no Fast Pay line, application not approved, ...) are
  // true of every invoice before launch, so they say nothing about the invoice.
  const ineligible = (data?.ineligible_invoices ?? []).filter((i) => !isAccountLevel(i));
  const passed = data?.invoices ?? [];
  const checked = ineligible.length + passed.length;

  if (checked === 0) {
    return (
      <Card className="mb-5 p-4">
        <Txt className="text-sub text-muted">
          Invoice checks switch on when Fast Pay goes live. Each open invoice will be checked for proof of
          delivery, an age of 90 days or less, and no open dispute. Keeping the signed proof of delivery on
          every booking is the one thing you can do now.
        </Txt>
      </Card>
    );
  }

  const withChecks = ineligible.map((inv) => ({ inv, keys: checksFor(inv) }));
  const rows = INVOICE_CHECKS.map((c) => ({
    ...c,
    count: withChecks.filter((w) => w.keys.includes(c.key)).length,
  }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
  const blocked = withChecks.filter((w) => w.keys.length > 0).length;

  if (rows.length === 0) {
    return (
      <Card className="mb-5 p-4">
        <Txt className="text-sub text-muted">None of the {plural(checked, 'checked invoice')} fail an invoice check.</Txt>
      </Card>
    );
  }

  return (
    <View className="mb-5">
      <Txt className="mb-2 text-sub text-muted">
        {checked - blocked} of {plural(checked, 'checked invoice')} {checked - blocked === 1 ? 'passes' : 'pass'}{' '}
        every check.
      </Txt>
      <Card>
        {rows.map((r, i) => (
          <View
            key={r.key}
            className={`flex-row items-center justify-between px-3.5 py-3 ${
              i < rows.length - 1 ? 'border-b border-line-row' : ''
            }`}
          >
            <Txt className="flex-1 text-callout text-muted">{r.label}</Txt>
            <Mono className="text-sub font-semibold text-fg">
              {r.count} of {checked}
            </Mono>
          </View>
        ))}
      </Card>
    </View>
  );
}
