import { useState } from 'react';
import { View, Alert, TouchableOpacity } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useQueryClient } from '@tanstack/react-query';
import {
  Banner,
  Button,
  Card,
  DetailRow,
  Group,
  OverflowMenu,
  Txt,
  type OverflowAction,
} from '@/components/ui';
import { formatDate, formatDateTime } from '@/lib/formatters';
import { toast } from '@/lib/toast';
import {
  ACCT_KEYS,
  accountingApi,
  apiMessage,
  invalidateAccounting,
  useAccountingAttention,
} from '../api';
import { connectionChip } from '../copy';
import { useConnectFlow, type CallbackBanner } from '../connect';
import { useAccountingPermissions } from '../permissions';
import { providerConfig, type Connection } from '../types';
import { OrgInitials, ProviderMark } from './ProviderMark';
import { ToneBadge } from './AcctUi';

/** Disconnect (or cancel a half-finished connection) behind a confirm. */
function useDisconnect(connection: Connection) {
  const qc = useQueryClient();
  const cfg = providerConfig(connection.provider);
  const [busy, setBusy] = useState(false);
  const pending = connection.status === 'PENDING_ORG';

  const run = async () => {
    setBusy(true);
    try {
      await accountingApi.disconnect();
      toast.success(
        pending ? 'Connection cancelled' : `${cfg.short} disconnected. Record payments in TruckWys again from now on.`,
      );
      invalidateAccounting(qc);
    } catch (e) {
      toast.error(apiMessage(e, `Couldn't disconnect ${cfg.short}. Try again.`));
    } finally {
      setBusy(false);
    }
  };

  const ask = () =>
    Alert.alert(
      pending ? 'Cancel this connection?' : `Disconnect ${cfg.short}?`,
      pending
        ? `Nothing has been linked yet. You can connect again with a different ${cfg.short} login.`
        : `Payments will need to be recorded in TruckWys again. Nothing in ${cfg.short} is deleted, and the sync history stays here. You can connect again later.`,
      [
        { text: 'Keep it', style: 'cancel' },
        { text: pending ? 'Cancel connection' : `Disconnect ${cfg.short}`, style: 'destructive', onPress: () => void run() },
      ],
    );

  return { ask, busy };
}

/**
 * Org name, status and the connection's actions. The facts (who connected it,
 * when, the start date) are on the Setup tab, so the header stays one row.
 */
export function ConnectionHeader({
  connection,
  onOpenTab,
  onBanner,
}: {
  connection: Connection;
  /** Opens the tab the attention pill points at. */
  onOpenTab?: (tab: 'sync' | 'reconciliation') => void;
  onBanner?: (b: CallbackBanner | null) => void;
}) {
  const { canWrite, writeTitle } = useAccountingPermissions();
  const cfg = providerConfig(connection.provider);
  const r = connection.readiness;
  const attention = useAccountingAttention(connection);
  const chip = connectionChip(connection.status, r, attention.count, cfg.short);
  const dis = useDisconnect(connection);
  const flow = useConnectFlow(onBanner);
  const reauth = connection.status === 'NEEDS_REAUTH';

  const menu: OverflowAction[] = [];
  if (connection.web_url) {
    const url = connection.web_url;
    menu.push({ label: `Open in ${cfg.short}`, icon: 'externalLink', onPress: () => void WebBrowser.openBrowserAsync(url) });
  }
  if (canWrite) {
    menu.push({
      label: dis.busy ? 'Disconnecting…' : `Disconnect ${cfg.short}`,
      icon: 'x',
      destructive: true,
      disabled: dis.busy,
      onPress: dis.ask,
    });
  }

  const pill = <ToneBadge tone={chip.tone} label={chip.label} />;

  return (
    <Card className="mb-4 p-4">
      <View className="flex-row items-center gap-3">
        <ProviderMark provider={connection.provider} />
        <View className="flex-1">
          <Txt className="text-body font-semibold text-fg" numberOfLines={1}>
            {connection.tenant_name || `${cfg.short} ${cfg.orgWord}`}
          </Txt>
          <View className="mt-1 flex-row flex-wrap items-center gap-2">
            <Txt className="text-caption text-muted">{cfg.name}</Txt>
            {/* Signed out: the banner below is the one signal, so no pill here. */}
            {reauth ? null : attention.count > 0 && attention.tab && onOpenTab ? (
              <TouchableOpacity
                onPress={() => onOpenTab(attention.tab!)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={attention.tab === 'sync' ? 'Open Sync' : 'Open Reconciliation'}
              >
                {pill}
              </TouchableOpacity>
            ) : (
              pill
            )}
          </View>
        </View>
        <OverflowMenu actions={menu} accessibilityLabel={`${cfg.short} connection`} title={cfg.name} />
      </View>

      {/* The why first, then the one thing to do about it. */}
      {reauth && (
        <View className="mt-4 gap-3">
          <Banner
            tone="danger"
            message={`${connection.status_reason || `Your ${cfg.short} sign-in has expired.`} ${
              canWrite ? 'Sign in again to carry on.' : `Ask your company admin to reconnect ${cfg.short}.`
            } Your mapping and contacts are kept.`}
          />
          <Button
            label={flow.busy ? 'Opening…' : `Reconnect ${cfg.short}`}
            loading={!!flow.busy}
            disabled={!canWrite}
            onPress={() => void flow.connect(cfg.slug)}
            fullWidth
          />
          {!canWrite && !!writeTitle && <Txt className="text-caption text-faint">{writeTitle}.</Txt>}
        </View>
      )}
    </Card>
  );
}

/** Who connected it and when, and what has been fetched: a short group at the end of Setup. */
export function ConnectionDetails({ connection }: { connection: Connection }) {
  if (!(connection.readiness?.sync_enabled ?? false)) return null;
  return (
    <Group label="Connection">
      <DetailRow label="Connected by" value={connection.connected_by || '—'} mono={false} />
      <DetailRow
        label="Connected on"
        value={connection.connected_at ? formatDate(connection.connected_at) : '—'}
      />
      <DetailRow label="Base currency" value={connection.base_currency || '—'} />
      {!!connection.cutover_date && <DetailRow label="Start date" value={formatDate(connection.cutover_date)} />}
      <DetailRow
        label="Payments last fetched"
        value={connection.last_payment_sync_at ? formatDateTime(connection.last_payment_sync_at) : 'Not yet'}
      />
      <DetailRow
        label="Last checked"
        value={connection.last_reconciled_at ? formatDateTime(connection.last_reconciled_at) : 'Not yet'}
        last
      />
    </Group>
  );
}

/** PENDING_ORG: the login sees several organisations; pick the one with this company's books. */
export function OrgPicker({ connection }: { connection: Connection }) {
  const qc = useQueryClient();
  const { canWrite, writeTitle } = useAccountingPermissions();
  const cfg = providerConfig(connection.provider);
  const dis = useDisconnect(connection);
  const tenants = connection.pending_tenants ?? [];
  const isZar = (c: string) => !c || c.toUpperCase() === 'ZAR';
  const eligible = tenants.filter((t) => isZar(t.currency));
  const unavailable = tenants.filter((t) => !isZar(t.currency));
  const single = eligible.length === 1 ? eligible[0] : null;
  // One organisation that can be linked: choose it for them.
  const [choice, setChoice] = useState<string>(single?.tenant_id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!choice) return;
    setBusy(true);
    setError('');
    try {
      const updated = await accountingApi.selectOrg(choice);
      qc.setQueryData(ACCT_KEYS.connection, updated);
      invalidateAccounting(qc);
      toast.success(`${updated.tenant_name || 'Organisation'} linked`);
    } catch (e) {
      setError(apiMessage(e, "Couldn't link that organisation. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-4">
      <View className="flex-row items-center gap-3">
        <ProviderMark provider={connection.provider} size={36} />
        <Txt className="flex-1 text-heading font-semibold text-fg">
          {single ? `Link your ${cfg.short} ${cfg.orgWord}` : `Choose the ${cfg.short} ${cfg.orgWord} to link`}
        </Txt>
      </View>
      <Txt className="text-sub text-muted">
        {single
          ? `TruckWys will send your invoices and bills to this ${cfg.short} ${cfg.orgWord}.`
          : `Pick the ${cfg.short} ${cfg.orgWord} that holds this company's books.`}
      </Txt>

      <Card className="overflow-hidden">
        {tenants.length === 0 ? (
          <Txt className="p-4 text-sub text-muted">
            No organisations came back from {cfg.short}. Use a different login and try again.
          </Txt>
        ) : (
          <>
            {eligible.map((t, i) => {
              const selected = choice === t.tenant_id;
              return (
                <TouchableOpacity
                  key={t.tenant_id}
                  onPress={() => canWrite && setChoice(t.tenant_id)}
                  activeOpacity={0.7}
                  disabled={!canWrite}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, disabled: !canWrite }}
                  className={`min-h-[60px] flex-row items-center gap-3 px-4 py-3 ${
                    i < eligible.length + unavailable.length - 1 ? 'border-b border-line-row' : ''
                  } ${selected ? 'bg-surface-hover' : ''}`}
                >
                  <OrgInitials name={t.name} />
                  <View className="flex-1">
                    <Txt className="text-body text-fg">{t.name}</Txt>
                    <Txt className="mt-0.5 text-caption text-muted">Books in {t.currency || 'ZAR'}</Txt>
                  </View>
                  {selected && <Txt className="text-callout font-semibold text-link">✓</Txt>}
                </TouchableOpacity>
              );
            })}
            {unavailable.map((t, i) => (
              <View
                key={t.tenant_id}
                className={`min-h-[60px] flex-row items-center gap-3 px-4 py-3 opacity-60 ${
                  i < unavailable.length - 1 ? 'border-b border-line-row' : ''
                }`}
              >
                <OrgInitials name={t.name} />
                <View className="flex-1">
                  <Txt className="text-body text-fg">{t.name}</Txt>
                  <Txt className="mt-0.5 text-caption text-muted">
                    Books in {t.currency}. Only ZAR books can be linked.
                  </Txt>
                </View>
                <ToneBadge tone="neutral" label="Not supported" />
              </View>
            ))}
          </>
        )}
      </Card>

      {!!error && <Banner tone="danger" message={error} />}
      {!canWrite && !!writeTitle ? (
        <Txt className="text-caption text-faint">{writeTitle}.</Txt>
      ) : (
        <Txt className="text-caption text-faint">Nothing is sent until you finish setup.</Txt>
      )}
      <Button
        label={busy ? 'Linking…' : 'Link organisation'}
        loading={busy}
        disabled={!canWrite || !choice || busy}
        onPress={() => void submit()}
        fullWidth
      />
      {canWrite && (
        <Button
          label={`Use a different ${cfg.short} login`}
          variant="ghost"
          disabled={dis.busy || busy}
          onPress={dis.ask}
          fullWidth
        />
      )}
    </View>
  );
}
