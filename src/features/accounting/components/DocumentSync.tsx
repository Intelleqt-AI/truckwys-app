import type { ReactNode } from 'react';
import { View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Group, DetailRow, Badge, Banner, Button, Txt } from '@/components/ui';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { formatDate } from '@/lib/formatters';
import { providerConfig, type AccountingSync } from '../types';
import { documentSyncChip } from '../copy';

// Where an invoice or credit note stands in the connected accounting system.
// Mobile counterparts of the web's AccountingSyncCard / AccountingSyncNotice /
// PaymentSourceBadge.

const FAILING = ['ERROR', 'DEAD', 'BLOCKED'];

const providerName = (sync: AccountingSync) => providerConfig(sync.provider).short || sync.provider_name;

/** Above the document: it didn't reach the accounting system, and where to fix it. */
export function AccountingSyncNotice({ sync }: { sync: AccountingSync | null | undefined }) {
  const { nav } = useAppNavigation();
  if (!sync || !FAILING.includes(sync.status)) return null;
  const name = providerName(sync);
  const retrying = sync.status === 'ERROR';
  const reason = (sync.last_error || `${name} refused it`).replace(/\.$/, '');
  return (
    <Banner
      tone="warning"
      message={`Not up to date in ${name}. ${reason}. ${
        retrying ? "Fix the mapping and we'll send the latest version on the next try." : 'Fix it, then retry from the Sync tab.'
      }`}
      // A mapping or VAT problem is fixed under Mapping; anything else in Sync.
      onPress={() =>
        nav.navigate('Accounting', { tab: /account|tax|vat|tracking/i.test(sync.last_error) ? 'mapping' : 'sync' })
      }
    />
  );
}

/** A card: the document's status in the accounting system, its number there, and a link to it. */
export function AccountingSyncCard({
  sync,
  what,
  localNumber,
}: {
  sync: AccountingSync | null | undefined;
  what: 'invoice' | 'credit note';
  localNumber?: string;
}) {
  if (!sync) return null;
  const name = providerName(sync);
  const chip = documentSyncChip(sync.status);
  const failing = FAILING.includes(sync.status);
  const showNumber = !!sync.external_number && sync.external_number !== localNumber;
  const url = sync.url;
  return (
    <Group label={name}>
      <DetailRowWithBadge label="Status" badge={<Badge label={chip.label} tone={chip.tone} dot />} last={false} />
      {showNumber && <DetailRow label={`Number in ${name}`} value={sync.external_number} />}
      <DetailRow
        label="Last sent"
        value={sync.last_synced_at ? formatDate(sync.last_synced_at) : 'Not sent yet'}
        last={!url}
        hint={failing ? 'Newer changes are waiting to send' : undefined}
      />
      {url && (
        <View className="p-3">
          <Button
            label={`Open ${what} in ${name}`}
            icon="externalLink"
            variant="secondary"
            size="sm"
            onPress={() => void WebBrowser.openBrowserAsync(url)}
            fullWidth
          />
        </View>
      )}
    </Group>
  );
}

/** A row with a label and a badge in place of a value (DetailRow only takes text). */
function DetailRowWithBadge({
  label,
  badge,
  last,
}: {
  label: string;
  badge: ReactNode;
  last?: boolean;
}) {
  return (
    <View
      className={`min-h-[48px] flex-row items-center justify-between gap-4 px-3.5 py-3 ${
        last ? '' : 'border-b border-line-row'
      }`}
    >
      <Txt className="text-callout text-muted">{label}</Txt>
      {badge}
    </View>
  );
}

/**
 * Where a payment came from, tagged only when it's the exception: a payment
 * synced from the accounting system or the bank feed.
 */
export function PaymentSourceBadge({ source }: { source?: string | null }) {
  const manual = !source || source === 'MANUAL';
  if (manual) return null;
  const label = source === 'BANK' ? 'From bank feed' : `From ${providerConfig(source).short}`;
  return <Badge label={label} variant="chip" />;
}
