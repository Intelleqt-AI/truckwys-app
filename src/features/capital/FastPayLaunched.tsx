import { View, TouchableOpacity, Alert } from 'react-native';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Group,
  InfoTip,
  KpiRow,
  Label,
  Mono,
  StatCard,
  Txt,
} from '@/components/ui';
import { ErrorState, ListSkeleton } from '@/components/feedback';
import {
  isUnavailable,
  serverMessage,
  useAdvances,
  useApplication,
  useCancelAdvance,
  useCapitalStatus,
  useFastPayInvoices,
} from '@/lib/capital/api';
import type { AdvanceRow, Offer } from '@/lib/capital/types';
import { canEditFastPayApplication, useRole } from '@/lib/access';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { formatCurrency } from '@/lib/formatters';
import { toast } from '@/lib/toast';
import { ApplicationCard } from './ApplicationCard';
import {
  AdvanceChip,
  DecisionChip,
  LIVE_STATUSES,
  PROVIDER,
  ProviderNote,
  ReasonList,
  day,
  money,
} from './capitalUi';

const whole = (v: number | null | undefined) =>
  v == null ? '—' : formatCurrency(v, { maximumFractionDigits: 0 });

/**
 * The launched transporter screen: the line, the application, invoices with
 * their offers, live requests, history, and what is not eligible and why. Every
 * figure comes from capital/status, capital/fast-pay/invoices and
 * capital/fast-pay/advances (lib/capital/api). Shown instead of the pre-launch
 * page once CAPITAL_LAUNCHED is on (lib/features.ts).
 */
export function FastPayLaunched() {
  const { nav } = useAppNavigation();
  const role = useRole();
  const status = useCapitalStatus();
  const app = useApplication();
  const invoices = useFastPayInvoices();
  const advances = useAdvances();
  const cancel = useCancelAdvance();

  const provider = status.data?.provider_label || PROVIDER;
  const demo = !!status.data?.demo;
  const line = status.data?.line ?? null;
  const application = app.data ?? status.data?.application;
  const offers = invoices.data?.offers ?? [];
  const ineligible = invoices.data?.ineligible ?? [];
  const totals = invoices.data?.totals;
  const rows = advances.data ?? [];
  const live = rows.filter((a) => LIVE_STATUSES.includes(a.status));
  const history = rows.filter((a) => !LIVE_STATUSES.includes(a.status));

  // The Fast Pay service is not on for this account (or not deployed yet).
  if (status.isError && invoices.isError && isUnavailable(status.error)) {
    return (
      <Banner
        tone="warning"
        message="Fast Pay isn't available on this account yet. Your invoices are unaffected. Offers show here once Fast Pay is switched on for you."
      />
    );
  }
  if (status.isError && invoices.isError) {
    return (
      <ErrorState
        message="Couldn't load Fast Pay."
        onRetry={() => {
          void status.refetch();
          void invoices.refetch();
          void advances.refetch();
        }}
      />
    );
  }

  const onCancel = (a: AdvanceRow) =>
    Alert.alert('Cancel this request?', `${a.reference} for ${money(a.net_amount)} will be cancelled.`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel request',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            try {
              await cancel.mutateAsync(a.id);
              toast.success(`${a.reference} cancelled`);
            } catch (e) {
              toast.error(serverMessage(e, 'The request could not be cancelled. Try again.'));
            }
          })(),
      },
    ]);

  const openRequest = (o: Offer) =>
    nav.navigate('RequestFastPay', { invoiceId: o.invoice_id, invoiceNumber: o.invoice_number });
  const openAdvance = (id: number) => nav.navigate('AdvanceDetail', { id });

  const showApplicationFirst = !!application && application.status !== 'APPROVED';
  const canEditApp = canEditFastPayApplication(role);

  return (
    <View className="gap-5">
      {demo && (
        <Banner
          tone="warning"
          message="Demo company. Offers are shown as an example. No money moves in the demo, so requests are turned off."
        />
      )}

      {/* The line: what is available now. Tiles only when a line exists. */}
      {status.isLoading ? (
        <ListSkeleton rows={2} />
      ) : line ? (
        <KpiRow>
          <StatCard label="Available now" value={whole(line.available)} note={`of ${whole(line.limit)}`} emphasis />
          <StatCard label="In use" value={whole(line.used)} note={`${live.length} open`} />
          {totals && (
            <StatCard
              label="Ready for Fast Pay"
              value={whole(totals.net_total)}
              note={`${totals.eligible_count} ${totals.eligible_count === 1 ? 'invoice' : 'invoices'}, after fees`}
            />
          )}
        </KpiRow>
      ) : null}

      {showApplicationFirst && (
        <ApplicationCard app={application!} provider={provider} demo={demo} canEdit={canEditApp} />
      )}

      {/* Offers */}
      <View>
        <View className="mb-2.5 flex-row items-center gap-1.5">
          <Label>Invoices you can get paid on</Label>
          <InfoTip
            text="Each offer shows what is paid to you now, the fee, and the holdback paid when your customer pays. The finance provider approves every request. Figures are confirmed when you request."
            label="About offers"
          />
        </View>
        {invoices.isLoading ? (
          <ListSkeleton rows={3} />
        ) : invoices.isError ? (
          <ErrorState message="Couldn't load offers." onRetry={() => void invoices.refetch()} />
        ) : offers.length === 0 ? (
          <EmptyState
            icon="banknote"
            title="Nothing ready yet"
            body="Delivered loads with proof of delivery show here once they are invoiced."
          />
        ) : (
          <View className="gap-2.5">
            {offers.map((o) => (
              <OfferCard key={o.invoice_id} offer={o} onRequest={() => openRequest(o)} onOpenAdvance={openAdvance} />
            ))}
          </View>
        )}
      </View>

      {/* Open requests */}
      {(advances.isLoading || live.length > 0 || advances.isError) && (
        <View>
          <Label className="mb-2.5">Open requests</Label>
          {advances.isLoading ? (
            <ListSkeleton rows={2} />
          ) : advances.isError ? (
            <ErrorState message="Couldn't load your requests." onRetry={() => void advances.refetch()} />
          ) : (
            <View className="gap-2.5">
              {live.map((a) => (
                <AdvanceCard
                  key={a.id}
                  advance={a}
                  onOpen={() => openAdvance(a.id)}
                  onCancel={() => onCancel(a)}
                  cancelling={cancel.isPending && cancel.variables === a.id}
                />
              ))}
            </View>
          )}
        </View>
      )}

      {/* Not eligible */}
      {ineligible.length > 0 && (
        <View>
          <Label className="mb-1">Not eligible yet</Label>
          <Txt className="mb-2.5 text-caption text-muted">What holds each invoice back</Txt>
          <View className="gap-2.5">
            {ineligible.map((o) => (
              <Card key={o.invoice_id} className="gap-2 p-3.5">
                <TouchableOpacity
                  onPress={() => nav.navigate('InvoiceDetail', { id: o.invoice_id })}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  className="flex-row items-center justify-between gap-3"
                >
                  <View className="flex-1">
                    <Txt className="text-body text-fg" numberOfLines={1}>
                      {o.customer_name || '—'}
                    </Txt>
                    <Mono className="mt-0.5 text-caption text-muted">{o.invoice_number}</Mono>
                  </View>
                  <Mono className="text-callout text-fg">{money(o.invoice_balance)}</Mono>
                </TouchableOpacity>
                {o.reasons?.length ? (
                  <ReasonList reasons={o.reasons} compact />
                ) : (
                  <Txt className="text-caption text-muted">{o.explanation || '—'}</Txt>
                )}
              </Card>
            ))}
          </View>
        </View>
      )}

      {/* History */}
      {history.length > 0 && (
        <View>
          <Label className="mb-1">History</Label>
          <Txt className="mb-2.5 text-caption text-muted">Repaid, cancelled and declined requests</Txt>
          <Group>
            {history.map((a, i) => (
              <TouchableOpacity
                key={a.id}
                onPress={() => openAdvance(a.id)}
                activeOpacity={0.7}
                accessibilityRole="button"
                className={`min-h-[56px] flex-row items-center gap-3 px-4 py-3 ${
                  i === history.length - 1 ? '' : 'border-b border-line-row'
                }`}
              >
                <View className="flex-1">
                  <Txt className="text-body text-fg" numberOfLines={1}>
                    {a.customer_name || '—'}
                  </Txt>
                  <Mono className="mt-0.5 text-caption text-muted" numberOfLines={1}>
                    {`${a.reference} · ${a.invoice_number} · ${day(a.requested_at ?? a.queued_at)}`}
                  </Mono>
                </View>
                <View className="items-end gap-1">
                  <Mono className="text-callout font-semibold text-fg">{money(a.net_amount)}</Mono>
                  <AdvanceChip status={a.status} label={a.status_label} />
                </View>
              </TouchableOpacity>
            ))}
          </Group>
        </View>
      )}

      {application && !showApplicationFirst && (
        <ApplicationCard app={application} provider={provider} demo={demo} canEdit={canEditApp} />
      )}

      <ProviderNote provider={provider} />
    </View>
  );
}

function OfferCard({
  offer: o,
  onRequest,
  onOpenAdvance,
}: {
  offer: Offer;
  onRequest: () => void;
  onOpenAdvance: (id: number) => void;
}) {
  const fee = `${money(o.fee_amount)}${o.fee_vat_amount > 0 ? ` + ${money(o.fee_vat_amount)} VAT` : ''}`;
  return (
    <Card className="gap-3 p-3.5">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Txt className="text-body text-fg" numberOfLines={1}>
            {o.customer_name || '—'}
          </Txt>
          <Mono className="mt-0.5 text-caption text-muted">{o.invoice_number}</Mono>
        </View>
        {o.advance ? (
          <AdvanceChip status={o.advance.status} label={o.advance.status_label} />
        ) : (
          <DecisionChip decision={o.decision} />
        )}
      </View>
      <View className="flex-row items-end justify-between gap-3">
        <View>
          <Txt className="text-caption text-muted">You receive</Txt>
          <Mono className="text-heading font-semibold text-fg">{money(o.net_payout)}</Mono>
        </View>
        {o.advance ? (
          <Button label="View" variant="secondary" size="sm" onPress={() => onOpenAdvance(o.advance!.id)} />
        ) : (
          <Button
            label={o.decision === 'DECLINE' ? 'Not eligible' : 'Request'}
            size="sm"
            disabled={o.decision === 'DECLINE'}
            onPress={onRequest}
          />
        )}
      </View>
      <Txt className="text-caption text-faint">
        {`Advance ${money(o.fundable_amount)} · fee ${fee} · holdback ${money(o.holdback_amount)} · customer pays ${day(o.expected_payment_date)}`}
      </Txt>
    </Card>
  );
}

function AdvanceCard({
  advance: a,
  onOpen,
  onCancel,
  cancelling,
}: {
  advance: AdvanceRow;
  onOpen: () => void;
  onCancel: () => void;
  cancelling: boolean;
}) {
  return (
    <Card className="gap-3 p-3.5">
      <TouchableOpacity
        onPress={onOpen}
        activeOpacity={0.7}
        accessibilityRole="button"
        className="flex-row items-start justify-between gap-3"
      >
        <View className="flex-1">
          <Txt className="text-body text-fg" numberOfLines={1}>
            {a.customer_name || '—'}
          </Txt>
          <Mono className="mt-0.5 text-caption text-muted" numberOfLines={1}>
            {`${a.reference} · ${a.invoice_number}`}
          </Mono>
        </View>
        <View className="items-end gap-1">
          <Mono className="text-callout font-semibold text-fg">{money(a.net_amount)}</Mono>
          <AdvanceChip status={a.status} label={a.status_label} />
        </View>
      </TouchableOpacity>
      {a.status === 'QUEUED' && a.queue_position != null && (
        <Txt className="text-caption text-muted">Position {a.queue_position} in the queue</Txt>
      )}
      {a.can_cancel && (
        <Button
          label={cancelling ? 'Cancelling…' : 'Cancel request'}
          variant="secondary"
          size="sm"
          loading={cancelling}
          onPress={onCancel}
        />
      )}
    </Card>
  );
}
