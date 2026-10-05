import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Banner, Button, DateField, Txt } from '@/components/ui';
import { ListSkeleton } from '@/components/feedback';
import { useTheme } from '@/theme/ThemeProvider';
import { formatDate, formatDateTime, formatRelativeTime } from '@/lib/formatters';
import { localDateISO } from '@/lib/dates';
import { toast } from '@/lib/toast';
import { ACCT_KEYS, accountingApi, apiCode, apiMessage, invalidateAccounting, useBackfill } from '../api';
import { providerBlockers } from '../copy';
import { useAccountingPermissions } from '../permissions';
import { providerConfig, type Backfill, type Connection, type StepState } from '../types';
import { AcctCard, CountTile, ErrorBlock, LinkButton, StepRow, ToneBadge, plural, type StepLook } from '../components/AcctUi';
import type { AccountingTab } from './tabs';

/** Plain-English step names (the server's labels are the fallback). */
const STEP_LABEL: Record<string, (p: string) => string> = {
  settings: (p) => `Read accounts and VAT from ${p}`,
  contacts: () => 'Link customers and suppliers',
  invoices: () => 'Send invoices and credit notes',
  receipts: () => 'Send recorded payments',
  bills: () => 'Send supplier bills',
  payments: (p) => `Import payments from ${p}`,
};

const STEP_LOOK: Record<StepState, StepLook> = { PENDING: 'todo', RUNNING: 'busy', DONE: 'done', FAILED: 'bad', SKIPPED: 'skip' };

/** First day of the current month, as YYYY-MM-DD: a sensible default start date. */
const firstOfMonth = () => `${localDateISO().slice(0, 7)}-01`;

const n = (v: number) => v.toLocaleString('en-ZA');

/**
 * Start date + history: choose the date from which TruckWys owns sending
 * documents, see what will go, start, and watch each step.
 */
export function BackfillTab({
  connection,
  onOpen,
}: {
  connection: Connection;
  onOpen: (tab: AccountingTab) => void;
}) {
  const qc = useQueryClient();
  const { colors } = useTheme();
  const cfg = providerConfig(connection.provider);
  const { canWrite, writeTitle } = useAccountingPermissions();
  const [date, setDate] = useState<string>(connection.cutover_date ?? '');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  // The chosen date rides along so the server can preview that date; the counts
  // are labelled with the date the server says it used. Polls while it runs.
  const q = useBackfill(date || null);
  const b = q.data;

  // Seed the picker from the server once.
  useEffect(() => {
    if (!date && b?.cutover_date) setDate(b.cutover_date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b?.cutover_date]);

  // When a run finishes, refresh the connection (readiness, counts).
  const prevState = useRef(b?.state);
  useEffect(() => {
    if (prevState.current === 'RUNNING' && b && b.state !== 'RUNNING') {
      invalidateAccounting(qc);
      if (b.state === 'DONE') toast.success(`Done. ${cfg.short} is up to date from ${formatDate(b.cutover_date ?? '')}.`);
      else if (b.state === 'FAILED') toast.error('The first send stopped part-way. See the failed step below.');
    }
    prevState.current = b?.state;
  }, [b, qc, cfg.short]);

  if (q.isLoading) return <ListSkeleton rows={4} />;
  if (q.isError || !b) {
    return (
      <AcctCard title="Start date">
        <ErrorBlock message={apiMessage(q.error, "Couldn't load the start date.")} onRetry={() => void q.refetch()} />
      </AcctCard>
    );
  }

  const r = connection.readiness;
  const running = b.state === 'RUNNING';
  const done = b.state === 'DONE';
  const locked = running || done;
  const p = b.preview;

  const reasons: string[] = [];
  if (!canWrite && writeTitle) reasons.push(writeTitle);
  if (connection.status !== 'ACTIVE') reasons.push(`Reconnect ${cfg.short} first`);
  if (!r.mapping_complete) reasons.push('Map every account and VAT code first');
  if (r.contacts_to_confirm > 0 || (p?.contacts_unconfirmed ?? 0) > 0) {
    reasons.push(
      `Confirm the ${plural(Math.max(r.contacts_to_confirm, p?.contacts_unconfirmed ?? 0), 'contact')} matched on name only`,
    );
  }
  if (!date) reasons.push('Choose a start date');
  if (connection.status === 'ACTIVE' && providerBlockers(r).length) {
    reasons.push(`Change the ${cfg.short} settings listed on the Setup tab`);
  }
  const canStart = reasons.length === 0 && !locked && !starting;

  const start = async () => {
    if (!canStart) return;
    setStarting(true);
    setError('');
    try {
      const res = await accountingApi.startBackfill(date);
      qc.setQueryData([...ACCT_KEYS.backfill, date], res);
      void qc.invalidateQueries({ queryKey: ACCT_KEYS.connection });
    } catch (e) {
      setError(
        apiCode(e) === 'provider_settings'
          ? `${cfg.short} settings stop this: ${apiMessage(e, 'see the Setup tab')}. Change them in ${cfg.short}, then use Check again on the Setup tab.`
          : apiMessage(e, "Couldn't start. Try again."),
      );
      if (apiCode(e) === 'provider_settings') void qc.invalidateQueries({ queryKey: ACCT_KEYS.connection });
    } finally {
      setStarting(false);
    }
  };

  const previewDate = b.cutover_date ?? date;
  // "31 of 52" where the preview knows the total for that step.
  const totals: Record<string, number | undefined> = p
    ? { invoices: p.invoices + p.credit_notes, receipts: p.historic_receipts, bills: p.bills }
    : {};
  const stepCount = (x: Backfill['steps'][number]) => {
    const total = totals[x.key];
    if (x.state === 'RUNNING') return total ? `${n(x.count)} of ${n(total)}` : `${n(x.count)} so far`;
    if (x.state === 'DONE') return total ? `${n(x.count)} of ${n(total)}` : 'Done';
    if (x.state === 'SKIPPED') return '';
    return total ? `0 of ${n(total)}` : 'Queued';
  };
  // The bar follows the documents (where the preview knows them), not the steps.
  const itemTotal = Object.values(totals).reduce<number>((sum, v) => sum + (v ?? 0), 0);
  const itemsDone = b.steps.reduce((sum, x) => {
    const t = totals[x.key];
    if (t == null) return sum;
    return sum + (x.state === 'DONE' ? t : x.state === 'RUNNING' ? Math.min(x.count, t) : 0);
  }, 0);
  const doneSteps = b.steps.filter((x) => x.state === 'DONE' || x.state === 'SKIPPED').length;
  const pctDone = itemTotal ? (itemsDone / itemTotal) * 100 : b.steps.length ? (doneSteps / b.steps.length) * 100 : 0;

  const cutoverCard = (
    <AcctCard
      title="Start date"
      description={`TruckWys sends everything dated on or after this date to ${cfg.short}. Earlier documents are assumed to be in your books already.`}
    >
      <View className="gap-3">
        {locked ? (
          <View className="flex-row items-center gap-2.5">
            <Txt className="text-heading font-semibold text-fg">{formatDate(b.cutover_date ?? '')}</Txt>
            <ToneBadge tone="neutral" label="Locked" />
          </View>
        ) : (
          <DateField label="Start date" value={date} onChange={setDate} />
        )}
        <Txt className="text-caption text-muted">
          {locked
            ? 'It can’t be changed once sending has started.'
            : 'Usually the first day of a month or VAT period still open in your books.'}
        </Txt>
        {!locked && !date && <LinkButton label={`Use ${formatDate(firstOfMonth())}`} onPress={() => setDate(firstOfMonth())} />}

        {!locked && (
          <View className="mt-1 gap-2">
            <Txt className="text-sub font-medium text-fg">
              {previewDate ? `What will be sent, from ${formatDate(previewDate)}` : 'What will be sent'}
            </Txt>
            {p ? (
              <View className="flex-row flex-wrap gap-2.5">
                <CountTile label="Invoices" value={p.invoices} />
                <CountTile label="Credit notes" value={p.credit_notes} />
                <CountTile label="Supplier bills" value={p.bills} />
                <CountTile label="Recorded payments" value={p.historic_receipts} />
              </View>
            ) : (
              <Txt className="text-caption text-muted">Choose a date to see the counts.</Txt>
            )}
            {p && p.historic_receipts > 0 && (
              <View className="flex-row flex-wrap items-center gap-x-1">
                <Txt className="text-caption text-muted">Payments already recorded in TruckWys go into the bank account chosen under</Txt>
                <LinkButton label="Mapping" onPress={() => onOpen('mapping')} />
              </View>
            )}
          </View>
        )}

        {!locked && (
          <View className="mt-1 gap-3">
            {error ? (
              <Banner tone="danger" message={error} />
            ) : reasons.length > 0 ? (
              <View className="gap-1">
                {reasons.map((x) => (
                  <Txt key={x} className="text-caption text-muted">
                    • {x}
                  </Txt>
                ))}
              </View>
            ) : null}
            <Button
              label={starting ? 'Starting…' : b.state === 'FAILED' ? 'Try again' : `Start sending to ${cfg.short}`}
              loading={starting}
              disabled={!canStart}
              onPress={() => void start()}
              fullWidth
            />
          </View>
        )}
      </View>
    </AcctCard>
  );

  const progressCard = (b.state !== 'NOT_STARTED' || b.steps.some((x) => x.state !== 'PENDING')) && (
    <AcctCard
      title={running ? `Sending history to ${cfg.short}` : 'Progress'}
      description={
        running ? (
          <View className="gap-2">
            <Txt className="text-sub text-muted">
              {`${b.cutover_date ? `Sending everything dated from ${formatDate(b.cutover_date)}. ` : ''}${b.started_at ? `Started ${formatRelativeTime(b.started_at).toLowerCase()}` : 'Started'}, updated ${formatRelativeTime(new Date(q.dataUpdatedAt || Date.now())).toLowerCase()}. You can leave this page; sending carries on.`}
            </Txt>
            <View
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: Math.round(pctDone) }}
              className="gap-1.5"
            >
              <View className="h-2 overflow-hidden rounded-pill" style={{ backgroundColor: colors.chartBar }}>
                <View style={{ width: `${Math.max(2, pctDone)}%`, height: '100%', backgroundColor: colors.accent }} />
              </View>
              <Txt className="text-caption text-muted">
                {itemTotal ? `${n(itemsDone)} of ${n(itemTotal)} sent` : `${doneSteps} of ${b.steps.length} steps`}
              </Txt>
            </View>
          </View>
        ) : done ? (
          `Finished ${b.finished_at ? formatDateTime(b.finished_at) : ''}.`
        ) : b.state === 'FAILED' ? (
          'Stopped. Fix what the failed step says, then try again.'
        ) : undefined
      }
      actions={
        done ? <ToneBadge tone="success" label="Done" /> : b.state === 'FAILED' ? <ToneBadge tone="danger" label="Stopped" /> : undefined
      }
      flush
    >
      {b.steps.map((x, i) => (
        <StepRow
          key={x.key}
          look={STEP_LOOK[x.state] ?? 'todo'}
          title={STEP_LABEL[x.key]?.(cfg.short) ?? x.label}
          trailing={stepCount(x)}
          desc={
            x.error ? (
              <Txt className="text-sub text-danger">{x.error}</Txt>
            ) : x.state === 'SKIPPED' ? (
              'Nothing to do'
            ) : undefined
          }
          last={i === b.steps.length - 1}
        />
      ))}
    </AcctCard>
  );

  // While it runs, progress is what people came to see: it goes first.
  return running ? (
    <>
      {progressCard}
      {cutoverCard}
    </>
  ) : (
    <>
      {cutoverCard}
      {progressCard}
    </>
  );
}
