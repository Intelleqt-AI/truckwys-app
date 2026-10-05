import { View } from 'react-native';
import { Banner, Button, Card, Txt } from '@/components/ui';
import { ListSkeleton } from '@/components/feedback';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { apiMessage, useAccountingAttention, useAccountingProviders } from '../api';
import { connectionChip } from '../copy';
import { useConnectFlow, type CallbackBanner } from '../connect';
import { useAccountingPermissions } from '../permissions';
import {
  PROVIDERS,
  PROVIDER_ORDER,
  providerConfig,
  type Connection,
  type ProviderInfo,
} from '../types';
import { ProviderMark } from './ProviderMark';
import { ToneBadge } from './AcctUi';

/** "QuickBooks Online and Sage are coming soon." (from the server's list). */
export function ComingSoonNote() {
  const q = useAccountingProviders();
  // Until the server answers, assume the usual line-up so the text doesn't pop in.
  const names = q.data
    ? q.data.providers.filter((p) => p.availability === 'coming_soon').map((p) => providerConfig(p.provider).name)
    : PROVIDER_ORDER.filter((c) => c === 'SAGE').map((c) => PROVIDERS[c].name);
  if (!names.length) return null;
  return (
    <Txt className="text-caption text-faint">
      {names.join(' and ')} {names.length === 1 ? 'is' : 'are'} coming soon.
    </Txt>
  );
}

/**
 * One card per provider. Only one accounting system can be connected at a time,
 * so while one is live the others say which one to disconnect first.
 */
export function ProviderCards({
  hideManage = false,
  onBanner,
}: {
  /** Don't offer "Manage" (the screen is already the manage screen). */
  hideManage?: boolean;
  onBanner?: (b: CallbackBanner | null) => void;
}) {
  const { canWrite, writeTitle } = useAccountingPermissions();
  const q = useAccountingProviders();
  const flow = useConnectFlow(onBanner);

  const serverList = q.data?.providers ?? [];
  const providers: ProviderInfo[] = PROVIDER_ORDER.map((code) => {
    const fromServer = serverList.find((p) => p.provider === code);
    const cfg = PROVIDERS[code];
    return (
      fromServer ?? {
        provider: code,
        slug: cfg.slug,
        name: cfg.name,
        availability: code === 'SAGE' ? 'coming_soon' : 'available',
        configured: false,
      }
    );
  });
  const connection = q.data?.connection ?? null;
  const live = connection && connection.status !== 'DISABLED' ? connection : null;
  // The connected system comes first; the ones it rules out follow.
  if (live) providers.sort((a, b) => Number(b.provider === live.provider) - Number(a.provider === live.provider));

  // Systems that aren't available yet share one quiet line instead of full cards.
  const available = providers.filter((p) => p.availability !== 'coming_soon');

  if (q.isLoading) return <ListSkeleton rows={2} />;

  return (
    <View className="gap-3">
      {q.isError && (
        <Banner tone="danger" message={apiMessage(q.error, "Couldn't load your accounting connection. Pull down to try again.")} />
      )}
      {available.map((p) => (
        <ProviderCard
          key={p.provider}
          info={p}
          live={live}
          canWrite={canWrite}
          disabledTitle={writeTitle}
          busy={flow.busy === p.provider}
          onConnect={() => void flow.connect(p.slug)}
          hideManage={hideManage}
        />
      ))}
    </View>
  );
}

function ProviderCard({
  info,
  live,
  canWrite,
  disabledTitle,
  busy,
  onConnect,
  hideManage,
}: {
  info: ProviderInfo;
  live: Connection | null;
  canWrite: boolean;
  disabledTitle?: string;
  busy: boolean;
  onConnect: () => void;
  hideManage: boolean;
}) {
  const { nav } = useAppNavigation();
  const cfg = providerConfig(info.provider);
  const mine = live && live.provider === info.provider ? live : null;
  const other = live && live.provider !== info.provider ? providerConfig(live.provider) : null;
  const attention = useAccountingAttention(mine);
  const chip = mine ? connectionChip(mine.status, mine.readiness, attention.count, cfg.short) : null;

  let desc: string = 'Invoices, credit notes and supplier bills';
  let note: string | null = null;
  let noteTone: 'normal' | 'danger' = 'normal';
  let actions: React.ReactNode = null;

  if (mine) {
    desc =
      mine.status === 'PENDING_ORG'
        ? `Signed in to ${cfg.short}; no organisation chosen yet.`
        : `Linked to ${mine.tenant_name || `your ${cfg.short} ${cfg.orgWord}`}`;
    const steps =
      mine.status === 'ACTIVE' && !mine.readiness.sync_enabled
        ? [
            !mine.readiness.mapping_complete && 'mapping',
            mine.readiness.contacts_to_confirm > 0 && 'contacts',
            mine.readiness.backfill_state !== 'DONE' && 'start date',
          ].filter((x): x is string => !!x)
        : [];
    if (steps.length > 0) note = `Still to do: ${steps.join(', ')}`;
    if (mine.status === 'NEEDS_REAUTH') {
      note = `${mine.status_reason || `Your ${cfg.short} sign-in has expired.`} Nothing is sent until an admin reconnects.`;
      noteTone = 'danger';
    }
    const needsYou = mine.status === 'PENDING_ORG' || (mine.status === 'ACTIVE' && !mine.readiness.sync_enabled);
    actions = (
      <View className="flex-row flex-wrap gap-2.5">
        {mine.status === 'NEEDS_REAUTH' && (
          <Button
            label={busy ? 'Opening…' : `Reconnect ${cfg.short}`}
            size="sm"
            loading={busy}
            disabled={!canWrite}
            onPress={onConnect}
          />
        )}
        {!hideManage && (
          <Button
            label={
              mine.status === 'PENDING_ORG'
                ? 'Choose organisation'
                : mine.status === 'ACTIVE' && !mine.readiness.sync_enabled
                  ? 'Finish setup'
                  : attention.count > 0
                    ? 'Review'
                    : 'Manage'
            }
            size="sm"
            variant={needsYou || attention.count > 0 ? 'primary' : 'secondary'}
            onPress={() =>
              nav.navigate('Accounting', attention.tab && !needsYou ? { tab: attention.tab } : undefined)
            }
          />
        )}
      </View>
    );
  } else if (other) {
    note = `Unavailable while ${other.short} is connected. One accounting system at a time.`;
  } else if (!info.configured) {
    note = 'Not set up on this server yet. Ask TruckWys support to switch it on.';
    actions = <Button label={`Connect ${cfg.short}`} size="sm" variant="secondary" disabled />;
  } else {
    actions = (
      <View>
        <Button
          label={busy ? 'Opening…' : `Connect ${cfg.short}`}
          size="sm"
          variant="secondary"
          loading={busy}
          disabled={!canWrite}
          onPress={onConnect}
        />
        {!canWrite && !!disabledTitle && <Txt className="mt-1.5 text-caption text-faint">{disabledTitle}.</Txt>}
      </View>
    );
  }

  return (
    <Card className="gap-3 p-4">
      <View className="flex-row items-center gap-3">
        <ProviderMark provider={info.provider} />
        <View className="flex-1">
          <Txt className="text-body font-semibold text-fg">{cfg.name}</Txt>
          <Txt className="mt-0.5 text-caption text-muted">{desc}</Txt>
        </View>
        {chip && <ToneBadge tone={chip.tone} label={chip.label} />}
      </View>
      {!!note && <Txt className={`text-caption ${noteTone === 'danger' ? 'text-danger' : 'text-muted'}`}>{note}</Txt>}
      {actions}
    </Card>
  );
}
