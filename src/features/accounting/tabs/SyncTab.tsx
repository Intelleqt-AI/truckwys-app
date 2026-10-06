import { useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Txt } from '@/components/ui';
import { ListSkeleton } from '@/components/feedback';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { formatDateTime, formatRelativeTime } from '@/lib/formatters';
import { toast } from '@/lib/toast';
import { ACCT_KEYS, accountingApi, apiMessage, useSyncStatus } from '../api';
import { OBJECT_TYPE_LABEL, humanise, type StatusTone } from '../copy';
import { useAccountingPermissions } from '../permissions';
import { providerConfig, type Connection, type LinkError, type SyncStatus } from '../types';
import { AcctCard, CountTile, ErrorBlock, ToneBadge } from '../components/AcctUi';
import type { AccountingTab } from './tabs';

// One vocabulary for failures, used in the list and the activity log.
const ERROR_META: Record<string, { tone: StatusTone; label: string }> = {
  ERROR: { tone: 'warning', label: 'Needs a fix' },
  DEAD: { tone: 'danger', label: 'Stopped retrying' },
  BLOCKED: { tone: 'neutral', label: 'Waiting on you' },
};
const LEVEL: Record<string, { tone: StatusTone; label: string }> = {
  INFO: { tone: 'success', label: 'Done' },
  WARNING: { tone: 'warning', label: 'Warning' },
  ERROR: { tone: 'warning', label: 'Failed' },
};
const OVERDUE_MS = 2 * 60 * 60 * 1000;

/** "in 4m", "due now", "10:00 tomorrow", else the date and time. */
function nextTry(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const mins = Math.round((d.getTime() - Date.now()) / 60000);
  if (mins <= 0) return 'due now';
  if (mins < 60) return `in ${mins}m`;
  const time = d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false });
  const day = (x: Date) => x.toLocaleDateString('en-CA');
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 86_400_000);
  if (day(d) === day(now)) return `${time} today`;
  if (day(d) === day(tomorrow)) return `${time} tomorrow`;
  return formatDateTime(iso);
}

/** Counts, what failed (with retry), and the recent activity log. */
export function SyncTab({
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
  const [syncing, setSyncing] = useState(false);
  const [retrying, setRetrying] = useState<number | null>(null);

  const q = useSyncStatus();

  const syncNow = async () => {
    setSyncing(true);
    try {
      await accountingApi.syncNow();
      toast.success(`Fetching payments from ${cfg.short}. New payments show on invoices within a minute.`);
      setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ACCT_KEYS.sync });
        void qc.invalidateQueries({ queryKey: ACCT_KEYS.connection });
      }, 5000);
    } catch (e) {
      toast.error(apiMessage(e, `Couldn't reach ${cfg.short}. Try again.`));
    } finally {
      setSyncing(false);
    }
  };

  const retry = async (row: LinkError) => {
    setRetrying(row.id);
    try {
      const updated = await accountingApi.retry(row.id);
      qc.setQueryData<SyncStatus>(ACCT_KEYS.sync, (old) =>
        old ? { ...old, errors: old.errors.map((e) => (e.id === updated.id ? updated : e)) } : old,
      );
      toast.success(`${row.label} queued to send again`);
      void qc.invalidateQueries({ queryKey: ACCT_KEYS.sync });
    } catch (e) {
      toast.error(apiMessage(e, `Couldn't retry ${row.label}.`));
    } finally {
      setRetrying(null);
    }
  };

  // A document's link: an in-app screen for our own invoices and credit notes, the
  // provider's page when the server gave a URL.
  const openLocal = (type: string, id: number | null, url: string | null) => {
    if (url && /^https?:/.test(url)) return () => void WebBrowser.openBrowserAsync(url);
    if (id == null) return undefined;
    if (/CREDIT_NOTE/.test(type)) return () => nav.navigate('CreditNoteDetail', { id });
    if (/INVOICE/.test(type)) return () => nav.navigate('InvoiceDetail', { id });
    return undefined;
  };

  if (q.isLoading) return <ListSkeleton rows={4} />;
  if (q.isError || !q.data) {
    return (
      <AcctCard title="Sync">
        <ErrorBlock message={apiMessage(q.error, "Couldn't load the sync status.")} onRetry={() => void q.refetch()} />
      </AcctCard>
    );
  }

  const s = q.data;
  const c = s.counts;
  const lastFetch = s.last_payment_sync_at ? new Date(s.last_payment_sync_at).getTime() : null;
  const overdue =
    connection.status === 'ACTIVE' &&
    connection.readiness.sync_enabled &&
    (lastFetch == null || Date.now() - lastFetch > OVERDUE_MS);

  const attention = (
    <AcctCard
      title="Needs attention"
      description={s.errors.length ? 'Fix the cause, then retry. We also retry on our own, up to 8 times.' : undefined}
      flush
    >
      {s.errors.length === 0 ? (
        <Txt className="p-4 text-sub text-muted">Nothing is stuck. Every document reached {cfg.short}.</Txt>
      ) : (
        s.errors.map((e, i) => {
          const meta = ERROR_META[e.status] ?? { tone: 'neutral' as StatusTone, label: humanise(e.status) };
          const open = openLocal(e.object_type, e.local_id, e.local_url);
          return (
            <View key={e.id} className={`gap-2 px-4 py-3.5 ${i < s.errors.length - 1 ? 'border-b border-line-row' : ''}`}>
              <Txt className="text-body font-medium text-fg">{e.last_error || 'No reason given'}</Txt>
              <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
                <Txt className="text-caption text-muted">{OBJECT_TYPE_LABEL[e.object_type] ?? humanise(e.object_type)}</Txt>
                {open ? (
                  <TouchableOpacity onPress={open} activeOpacity={0.6} hitSlop={8} accessibilityRole="link">
                    <Txt className="text-caption font-medium text-link">{e.label}</Txt>
                  </TouchableOpacity>
                ) : (
                  <Txt className="text-caption text-muted">{e.label}</Txt>
                )}
                {e.status !== 'ERROR' && <ToneBadge tone={meta.tone} label={meta.label} />}
                {e.status === 'ERROR' && e.next_attempt_at && (
                  <Txt className="text-caption text-muted">
                    · Try {e.attempts} of 8, next {nextTry(e.next_attempt_at)}
                  </Txt>
                )}
              </View>
              <View className="mt-1 flex-row flex-wrap gap-2.5">
                {/* The usual cause is a mapping or a contact: fix that first, then retry. */}
                {onOpen && /account|tax|vat|tracking/i.test(e.last_error) && (
                  <Button label="Fix account mapping" size="sm" onPress={() => onOpen('mapping')} />
                )}
                {onOpen && /contact/i.test(e.last_error) && (
                  <Button label="Fix in Contacts" size="sm" onPress={() => onOpen('contacts')} />
                )}
                {canWrite && (
                  <Button
                    label={retrying === e.id ? 'Retrying…' : 'Retry now'}
                    size="sm"
                    variant="secondary"
                    loading={retrying === e.id}
                    onPress={() => void retry(e)}
                  />
                )}
              </View>
            </View>
          );
        })
      )}
    </AcctCard>
  );

  const recent = [...s.recent].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <>
      {s.errors.length > 0 && attention}

      <AcctCard
        title={`Sync with ${cfg.short}`}
        description={
          <View className="gap-1">
            <Txt className="text-sub text-muted">
              Documents go to {cfg.short} as you create them; payments are fetched every few minutes.
              {!overdue && s.last_payment_sync_at ? ` Last fetched ${formatRelativeTime(s.last_payment_sync_at).toLowerCase()}.` : ''}
            </Txt>
            {overdue && (
              <Txt className="text-sub text-warning">
                Payment fetch is overdue: last fetched{' '}
                {s.last_payment_sync_at ? formatRelativeTime(s.last_payment_sync_at).toLowerCase() : 'never'}.
              </Txt>
            )}
          </View>
        }
        actions={
          <Button
            label={syncing ? 'Asking…' : 'Fetch payments now'}
            icon="refresh"
            variant="secondary"
            size="sm"
            loading={syncing}
            disabled={!canWrite || syncing || connection.status !== 'ACTIVE'}
            onPress={() => void syncNow()}
          />
        }
      >
        <View className="flex-row flex-wrap gap-2.5">
          <CountTile label={`Sent to ${cfg.short}`} value={c.synced} />
          <CountTile label="Waiting to send" value={c.queued} muted={!c.queued} />
          <CountTile label="Needs a fix" value={c.errors} muted={!c.errors} />
          <CountTile label="Stopped retrying" value={c.dead} muted={!c.dead} />
        </View>
      </AcctCard>

      {s.errors.length === 0 && attention}

      <AcctCard title="Recent activity" flush>
        {recent.length === 0 ? (
          <Txt className="p-4 text-sub text-muted">No activity yet.</Txt>
        ) : (
          recent.map((ev, i) => {
            const lvl = LEVEL[ev.level] ?? LEVEL.INFO!;
            const open = ev.local_id ? openLocal(ev.object_type, ev.local_id, null) : undefined;
            return (
              <View key={ev.id} className={`gap-1 px-4 py-3 ${i < recent.length - 1 ? 'border-b border-line-row' : ''}`}>
                <View className="flex-row items-start justify-between gap-3">
                  <Txt className="flex-1 text-sub text-fg">
                    {ev.level !== 'INFO' ? `${lvl.label}: ` : ''}
                    {ev.label ? `${ev.label} · ` : ''}
                    {ev.message || humanise(ev.action)}
                  </Txt>
                  <Txt className="text-caption text-faint">{formatRelativeTime(ev.created_at)}</Txt>
                </View>
                {open && (
                  <TouchableOpacity onPress={open} activeOpacity={0.6} hitSlop={8} accessibilityRole="link" className="self-start">
                    <Txt className="text-caption font-medium text-link">Open {ev.label || 'document'}</Txt>
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}
      </AcctCard>
    </>
  );
}
