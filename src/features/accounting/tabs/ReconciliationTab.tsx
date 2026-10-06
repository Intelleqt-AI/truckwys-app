import { useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Txt } from '@/components/ui';
import { ListSkeleton } from '@/components/feedback';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { formatCurrency, formatDateTime } from '@/lib/formatters';
import { toast } from '@/lib/toast';
import { ACCT_KEYS, accountingApi, apiMessage, useReconciliation } from '../api';
import { humanise } from '../copy';
import { useAccountingPermissions } from '../permissions';
import { providerConfig, type Connection, type ReconDifference, type ReconScope } from '../types';
import { AcctCard, CountTile, ErrorBlock, LinkButton, plural } from '../components/AcctUi';
import type { AccountingTab } from './tabs';

const SCOPES: { scope: ReconScope; title: string }[] = [
  { scope: 'INVOICE', title: 'Invoices' },
  { scope: 'CUSTOMER', title: 'Customers' },
  { scope: 'MONTH', title: 'Sales and VAT by month' },
];

const FIELD_LABEL: Record<string, string> = {
  total: 'Total',
  vat: 'VAT',
  paid: 'Paid',
  credited: 'Credited',
  status: 'Status',
  open_balance: 'Balance owed',
  sales_excl_vat: 'Sales excl. VAT',
  output_vat: 'Output VAT',
  receipts: 'Money received',
  debtors: 'Debtors',
};

const isMoney = (v: string) => /^-?\d+(\.\d+)?$/.test(String(v).trim());
/** Provider status codes in plain words (Xero's AUTHORISED is an unpaid, approved invoice). */
const STATUS_WORD: Record<string, string> = {
  AUTHORISED: 'Awaiting payment',
  SUBMITTED: 'Awaiting approval',
  OPEN: 'Open',
  OVERDUE: 'Overdue',
  VOIDED: 'Void',
};
const showValue = (v: string) => (isMoney(v) ? formatCurrency(Number(v)) : (STATUS_WORD[String(v).toUpperCase()] ?? (humanise(v) || '—')));

/** Money differences as rand; a status mismatch has no amount. */
const diffText = (d: ReconDifference) => {
  if (!isMoney(d.difference) || d.difference === '') return 'Status differs';
  const v = parseFloat(d.difference);
  return v > 0 ? `+${formatCurrency(v)}` : formatCurrency(v);
};

/** The time of the last run, as "03:00" (the check repeats nightly at that time). */
function nextCheck(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '03:00' : d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Does TruckWys agree with the books? Per invoice, per customer, per month. */
export function ReconciliationTab({
  connection,
  onOpen,
}: {
  connection: Connection;
  onOpen?: (tab: AccountingTab) => void;
}) {
  const qc = useQueryClient();
  const { nav } = useAppNavigation();
  const cfg = providerConfig(connection.provider);
  const { canWrite } = useAccountingPermissions();
  const [running, setRunning] = useState(false);
  const q = useReconciliation();

  const run = async () => {
    setRunning(true);
    try {
      const res = await accountingApi.runReconciliation();
      qc.setQueryData(ACCT_KEYS.reconciliation, res);
      void qc.invalidateQueries({ queryKey: ACCT_KEYS.connection });
      const count = res.run?.difference_count ?? 0;
      if (res.run?.status === 'FAILED') toast.error(res.run.error || "The check couldn't finish. Try again.");
      else toast.success(count === 0 ? `Everything matches ${cfg.short}` : `${plural(count, 'difference')} found`);
    } catch (e) {
      toast.error(apiMessage(e, "Couldn't run the check. Try again."));
    } finally {
      setRunning(false);
    }
  };

  /** In-app link for one of our invoices, from the server's web path. */
  const openLocal = (url: string | null) => {
    const m = url ? /\/finance\/invoices\/(\d+)/.exec(url) : null;
    return m?.[1] ? () => nav.navigate('InvoiceDetail', { id: m[1]! }) : undefined;
  };

  if (q.isLoading) return <ListSkeleton rows={4} />;
  if (q.isError || !q.data) {
    return (
      <AcctCard title="Reconciliation">
        <ErrorBlock message={apiMessage(q.error, "Couldn't load the reconciliation.")} onRetry={() => void q.refetch()} />
      </AcctCard>
    );
  }

  const { run: last, differences } = q.data;
  const unsent = connection.counts.errors + connection.counts.dead;

  return (
    <>
      <AcctCard
        title={`Checked against ${cfg.short}`}
        description={`We compare invoices, customer balances and monthly sales and VAT with ${cfg.short}.`}
        actions={
          <Button
            label={running ? 'Checking…' : 'Check now'}
            icon="refresh"
            variant="secondary"
            size="sm"
            loading={running}
            disabled={!canWrite || running || connection.status !== 'ACTIVE'}
            onPress={() => void run()}
          />
        }
      >
        {!last ? (
          <Txt className="text-sub text-muted">{"No check has run yet. Run one now, or wait for tonight's."}</Txt>
        ) : (
          <View className="gap-3">
            {/* The result, said once, first. */}
            {last.status === 'FAILED' ? (
              <Txt className="text-body font-semibold text-warning">{"The last check didn't finish"}</Txt>
            ) : differences.length === 0 ? (
              <>
                <Txt className="text-body font-semibold text-success">Everything matches {cfg.short}</Txt>
                {unsent > 0 && (
                  <View className="flex-row flex-wrap items-center gap-x-1">
                    <Txt className="text-caption text-muted">
                      {plural(unsent, 'document')} {unsent === 1 ? "hasn't" : "haven't"} reached {cfg.short} yet, so{' '}
                      {unsent === 1 ? "it isn't" : "they aren't"} compared.
                    </Txt>
                    {onOpen && <LinkButton label="View in Sync" onPress={() => onOpen('sync')} />}
                  </View>
                )}
              </>
            ) : (
              <Txt className="text-body font-semibold text-warning">
                {plural(last.difference_count, 'difference')} with {cfg.short}
              </Txt>
            )}
            <Txt className="text-caption text-muted">
              Checked {formatDateTime(last.ran_at)} · Checks again nightly at {nextCheck(last.ran_at)}
            </Txt>
            <View className="flex-row flex-wrap gap-2.5">
              {SCOPES.map((sc) => {
                const count =
                  sc.scope === 'INVOICE' ? last.checked.invoices : sc.scope === 'CUSTOMER' ? last.checked.customers : last.checked.months;
                const bad = differences.filter((d) => d.scope === sc.scope).length;
                return (
                  <View key={sc.scope} className="min-w-[30%] flex-1">
                    <CountTile
                      label={`${sc.scope === 'MONTH' ? 'Months' : sc.title} checked`}
                      value={count ?? 0}
                    />
                    <Txt className={`mt-1 text-caption ${bad ? 'text-warning' : 'text-faint'}`}>
                      {bad ? `${bad} ${bad === 1 ? 'differs' : 'differ'}` : 'All match'}
                    </Txt>
                  </View>
                );
              })}
            </View>
            {last.status === 'FAILED' && !!last.error && <Txt className="text-sub text-danger">{last.error}</Txt>}
            {differences.length > 0 && (
              <Txt className="text-caption text-muted">
                Difference is TruckWys minus {cfg.short}. Correct it in {cfg.short} or TruckWys; it clears on the next check.
              </Txt>
            )}
          </View>
        )}
      </AcctCard>

      {last &&
        last.status !== 'FAILED' &&
        differences.length > 0 &&
        SCOPES.map(({ scope, title }) => {
          const rows = differences.filter((d) => d.scope === scope);
          if (!rows.length) return null;
          return (
            <AcctCard key={scope} title={`${title} · ${plural(rows.length, 'difference')}`} flush>
              {rows.map((d, i) => {
                const [head = '', ...rest] = (d.label || d.key).split(' · ');
                const open = openLocal(d.local_url);
                return (
                  <View key={d.id} className={`gap-1.5 px-4 py-3.5 ${i < rows.length - 1 ? 'border-b border-line-row' : ''}`}>
                    <View className="flex-row items-start justify-between gap-3">
                      <View className="flex-1">
                        {open ? (
                          <TouchableOpacity onPress={open} activeOpacity={0.6} hitSlop={8} accessibilityRole="link" className="self-start">
                            <Txt className="text-body font-medium text-link">{head}</Txt>
                          </TouchableOpacity>
                        ) : (
                          <Txt className="text-body font-medium text-fg">{head}</Txt>
                        )}
                        {rest.length > 0 && <Txt className="text-caption text-muted">{rest.join(' · ')}</Txt>}
                      </View>
                      <Txt className="text-callout font-semibold text-fg">{diffText(d)}</Txt>
                    </View>
                    <Txt className="text-caption text-muted">{FIELD_LABEL[d.field] ?? humanise(d.field)} differs</Txt>
                    <View className="flex-row gap-6">
                      <View>
                        <Txt className="text-caption text-faint">TruckWys</Txt>
                        <Txt className="text-sub text-fg">{showValue(d.truckwys)}</Txt>
                      </View>
                      <View>
                        <Txt className="text-caption text-faint">{cfg.short}</Txt>
                        <Txt className="text-sub text-fg">{showValue(d.provider)}</Txt>
                      </View>
                    </View>
                    {!!d.provider_url && (
                      <LinkButton label={`Open in ${cfg.short}`} onPress={() => void WebBrowser.openBrowserAsync(d.provider_url!)} />
                    )}
                  </View>
                );
              })}
            </AcctCard>
          );
        })}
    </>
  );
}
