import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Txt } from '@/components/ui';
import { formatDate } from '@/lib/formatters';
import { toast } from '@/lib/toast';
import { ACCT_KEYS, accountingApi, apiMessage, invalidateAccounting } from '../api';
import { providerBlockers } from '../copy';
import { useAccountingPermissions } from '../permissions';
import { providerConfig, type Connection } from '../types';
import { AcctCard, StepRow, plural, type StepLook } from '../components/AcctUi';
import { ConnectionDetails } from '../components/ConnectionHeader';
import type { AccountingTab } from './tabs';

/**
 * The server's provider-setting sentence, split into what to change, where and
 * why when it has the usual shape ('Turn on "X" in QuickBooks (path), then press
 * Refresh: reason'); null for any other sentence (shown as is).
 */
function parseBlocker(text: string): { what: string; where: string; why: string } | null {
  const m = text.match(/^(Turn (?:on|off) "[^"]+") in [^(]+\(([^)]+)\),? then press Refresh:\s*(.+)$/);
  if (!m) return null;
  const [, what = '', where = '', why = ''] = m;
  return {
    what: what.replace(/"([^"]+)"/, '“$1”'),
    where,
    why: why.charAt(0).toUpperCase() + why.slice(1),
  };
}

interface Item {
  key: string;
  look: StepLook;
  title: string;
  desc: ReactNode;
  tab?: AccountingTab;
  action?: string;
  provider?: boolean;
}

/** What still has to happen before documents start flowing, in order. */
export function SetupTab({
  connection,
  onOpen,
}: {
  connection: Connection;
  onOpen: (tab: AccountingTab) => void;
}) {
  const cfg = providerConfig(connection.provider);
  const { canWrite, writeTitle } = useAccountingPermissions();
  const qc = useQueryClient();
  const [checking, setChecking] = useState(false);

  const checkAgain = async () => {
    setChecking(true);
    try {
      const fresh = await accountingApi.refreshOptions();
      qc.setQueryData(ACCT_KEYS.mapping, fresh);
      invalidateAccounting(qc);
      toast.success(`Checked ${cfg.short} again`);
    } catch (e) {
      toast.error(apiMessage(e, `Couldn't reach ${cfg.short}. Try again.`));
    } finally {
      setChecking(false);
    }
  };

  const r = connection.readiness;
  const missing = r.missing_mappings ?? [];
  const backfillLook: StepLook =
    r.backfill_state === 'DONE' ? 'done' : r.backfill_state === 'RUNNING' ? 'busy' : r.backfill_state === 'FAILED' ? 'bad' : 'todo';

  const items: Item[] = [
    {
      key: 'connect',
      look: connection.status === 'ACTIVE' ? 'done' : 'todo',
      title: connection.status === 'ACTIVE' ? `Connect ${cfg.short}` : `Reconnect ${cfg.short}`,
      desc:
        connection.status !== 'ACTIVE'
          ? canWrite
            ? `Sign in to ${cfg.short} again.`
            : 'Needs a company admin.'
          : `Connected${connection.connected_by ? ` by ${connection.connected_by}` : ''}${connection.connected_at ? ` on ${formatDate(connection.connected_at)}` : ''}. Books in ${connection.base_currency || 'ZAR'}.`,
    },
    {
      key: 'mapping',
      look: r.mapping_complete ? 'done' : 'todo',
      title: 'Map accounts and VAT',
      desc: r.mapping_complete
        ? 'Every charge, expense and VAT rate is mapped.'
        : missing.length
          ? `${missing.length} still to map.`
          : 'Tell TruckWys which account and VAT rate to use for each kind of charge.',
      tab: 'mapping',
      action: r.mapping_complete ? 'Review' : 'Map accounts',
    },
    {
      key: 'contacts',
      look: r.contacts_to_confirm === 0 ? 'done' : 'todo',
      title: 'Confirm contacts',
      desc:
        r.contacts_to_confirm === 0
          ? `Customers and suppliers are linked to their ${cfg.short} contacts.`
          : `${plural(r.contacts_to_confirm, 'contact')} to check.`,
      tab: 'contacts',
      action: r.contacts_to_confirm === 0 ? 'Review' : 'Confirm contacts',
    },
    {
      key: 'cutover',
      look: backfillLook,
      title:
        r.backfill_state === 'DONE' && connection.cutover_date
          ? `Start date: ${formatDate(connection.cutover_date)}`
          : 'Choose a start date',
      desc:
        r.backfill_state === 'DONE'
          ? `History from ${connection.cutover_date ? formatDate(connection.cutover_date) : 'the start date'} was sent to ${cfg.short}.${connection.status === 'ACTIVE' && providerBlockers(r).length ? ' New documents wait for the setting above.' : ''}`
          : r.backfill_state === 'RUNNING'
            ? `Sending documents to ${cfg.short} now.`
            : r.backfill_state === 'FAILED'
              ? 'The first send stopped part-way. Open it to see what went wrong and try again.'
              : `Anything dated before it should already be in ${cfg.short}.`,
      tab: 'cutover',
      action:
        r.backfill_state === 'DONE' ? 'View' : r.backfill_state === 'RUNNING' ? 'Watch progress' : 'Choose start date',
    },
    {
      key: 'live',
      look: r.sync_enabled ? 'done' : 'todo',
      title: 'Sync starts',
      desc: r.sync_enabled
        ? `New invoices, credit notes and bills go to ${cfg.short} on their own, and payments come back every few minutes.`
        : 'Automatically, once the steps above are done.',
      tab: r.sync_enabled ? 'sync' : undefined,
      action: r.sync_enabled ? 'Sync status' : undefined,
    },
  ];

  // Settings to change inside the provider (QuickBooks "Custom transaction
  // numbers" etc.) are steps like any other, right after connecting.
  const blockers = connection.status !== 'ACTIVE' ? [] : providerBlockers(r);
  items.splice(
    1,
    0,
    ...blockers.map((text, i): Item => {
      const x = parseBlocker(text);
      const isNext = i === 0;
      return {
        key: `provider-${i}`,
        look: 'warn',
        provider: true,
        title: x ? `${x.what} in ${cfg.short}` : `Change a ${cfg.short} setting`,
        desc: x ? (
          <View className="gap-1">
            <Txt className="text-sub font-medium text-fg">{x.where}</Txt>
            <Txt className="text-sub text-muted">{x.why}</Txt>
          </View>
        ) : (
          text
        ),
        // The buttons live on the row itself (see below).
        tab: undefined,
        action: isNext ? 'next' : undefined,
      };
    }),
  );

  const liveItem = items.find((it) => it.key === 'live');
  const stillOpen = items.filter((it) => it.look !== 'done' && it.key !== 'live');
  if (liveItem && !r.sync_enabled && stillOpen.length && stillOpen.every((it) => it.provider)) {
    const nums = stillOpen.map((it) => items.indexOf(it) + 1);
    liveItem.desc = `Waiting on ${nums.length === 1 ? `step ${nums[0]}` : `steps ${nums.join(' and ')}`}.`;
  }

  // Only the next step to do gets the primary button; while the sign-in has
  // expired, Reconnect (in the header) is the only one and the rest wait.
  const reauth = connection.status !== 'ACTIVE';
  const nextKey = reauth
    ? undefined
    : items.find((it) => it.look !== 'done' && (it.tab || it.provider) && it.action)?.key;
  const open = items
    .filter((it) => it.look !== 'done' && it.key !== 'live' && it.key !== 'connect')
    .map((it) => items.indexOf(it) + 1);
  const ownOpen = items.filter((it) => it.look !== 'done' && !it.provider && it.key !== 'live' && it.key !== 'connect');
  const range = open.length === 1 ? `step ${open[0]} is` : `steps ${open[0]}–${open[open.length - 1]} are`;
  const subtitle =
    blockers.length && !ownOpen.length
      ? `Everything in TruckWys is done. Nothing new is sent until ${range} done.`
      : r.sync_enabled
        ? `Done. ${cfg.short} and TruckWys now stay in step on their own.`
        : reauth
          ? `The other steps wait until ${cfg.short} is reconnected.`
          : open.length
            ? `One-time setup. Nothing is sent to ${cfg.short} until ${range} done.`
            : `Sending your history to ${cfg.short}.`;
  const title = r.sync_enabled
    ? `${cfg.short} is set up`
    : blockers.length && !ownOpen.length
      ? `${blockers.length === 1 ? 'One change' : `${blockers.length} changes`} needed in ${cfg.short}`
      : `Finish setting up ${cfg.short}`;

  return (
    <>
      <AcctCard title={title} description={subtitle} flush>
        {items.map((it, i) => {
          const blocked = reauth && it.key !== 'connect';
          let action: ReactNode = null;
          if (it.provider) {
            action = (
              <>
                {connection.web_url && (
                  <Button
                    label={`Open in ${cfg.short}`}
                    icon="externalLink"
                    size="sm"
                    variant={it.key === nextKey ? 'primary' : 'secondary'}
                    onPress={() => void WebBrowser.openBrowserAsync(connection.web_url!)}
                  />
                )}
                <Button
                  label={checking ? 'Checking…' : 'Check again'}
                  icon="refresh"
                  size="sm"
                  variant="secondary"
                  loading={checking}
                  disabled={!canWrite}
                  onPress={() => void checkAgain()}
                />
              </>
            );
          } else if (it.tab && it.action && !(blocked && it.look !== 'done')) {
            action = (
              <Button
                label={it.action}
                size="sm"
                variant={it.key === nextKey ? 'primary' : 'secondary'}
                onPress={() => onOpen(it.tab!)}
              />
            );
          }
          return (
            <View key={it.key} style={blocked ? { opacity: 0.55 } : undefined}>
              <StepRow
                look={it.look}
                n={i + 1}
                title={it.title}
                desc={it.desc}
                action={action}
                last={i === items.length - 1}
              />
            </View>
          );
        })}
        {!canWrite && !!writeTitle && (
          <Txt className="px-4 pb-3 text-caption text-faint">{writeTitle}; you can look but not change anything.</Txt>
        )}
      </AcctCard>
      <ConnectionDetails connection={connection} />
    </>
  );
}
