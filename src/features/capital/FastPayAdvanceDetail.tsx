import { View, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Banner, Button, DetailRow, Group, Mono, SheetScreen, Timeline, Txt } from '@/components/ui';
import { DetailSkeleton, ErrorState, NotFoundState } from '@/components/feedback';
import { serverMessage, useAdvance, useCancelAdvance, useCapitalStatus } from '@/lib/capital/api';
import { canRequestFastPay, useRole } from '@/lib/access';
import { toast } from '@/lib/toast';
import type { AppStackParamList } from '@/navigation/types';
import {
  AdvanceChip,
  PROVIDER,
  ProviderNote,
  ReasonList,
  day,
  dayTime,
  money,
  sentenceCase,
} from './capitalUi';

type Props = NativeStackScreenProps<AppStackParamList, 'AdvanceDetail'>;

/** One Fast Pay request, exactly as the server reports it (capital/fast-pay/advances/{id}/). */
export function FastPayAdvanceDetail({ route, navigation }: Props) {
  const { id } = route.params;
  const role = useRole();
  const query = useAdvance(id);
  const status = useCapitalStatus();
  const cancel = useCancelAdvance();
  const a = query.data;
  const provider = status.data?.provider_label || PROVIDER;

  if (query.isError && !a) {
    return (query.error as { status?: number } | null)?.status === 404 ? (
      <SheetScreen title="Request not found" onBack={() => navigation.goBack()}>
        <NotFoundState what="Fast Pay request" onBack={() => navigation.goBack()} />
      </SheetScreen>
    ) : (
      <ErrorState onRetry={query.refetch} message="Couldn't load this request." />
    );
  }
  if (!a) {
    return (
      <SheetScreen title="Fast Pay request" onBack={() => navigation.goBack()}>
        <DetailSkeleton />
      </SheetScreen>
    );
  }

  const closed = ['DENIED', 'CANCELLED', 'WRITTEN_OFF'].includes(a.status);
  const canCancel = a.can_cancel && canRequestFastPay(role);

  const doCancel = () =>
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

  return (
    <SheetScreen
      title={a.reference}
      onBack={() => navigation.goBack()}
      footer={
        canCancel ? (
          <Button
            label={cancel.isPending ? 'Cancelling…' : 'Cancel request'}
            variant="secondary"
            loading={cancel.isPending}
            onPress={doCancel}
            fullWidth
          />
        ) : undefined
      }
    >
      <View className="mb-4 flex-row flex-wrap items-center gap-2.5">
        <AdvanceChip status={a.status} label={a.status_label} />
        <Txt className="flex-1 text-callout text-muted" numberOfLines={1}>
          {a.customer_name}
        </Txt>
      </View>

      {a.status === 'DENIED' && (
        <View className="mb-5">
          <Banner
            tone="danger"
            message={`Not approved. ${a.denial_reason || `${sentenceCase(provider)} did not approve this request.`}`}
          />
        </View>
      )}

      <View className="mb-5">
        <Txt className="text-caption text-muted">
          {a.disbursed_at ? `Paid to you on ${day(a.disbursed_at)}` : closed ? 'Requested, nothing was paid' : 'To be paid to you, once approved'}
        </Txt>
        <Mono className="mt-1 text-figure font-semibold text-fg">{money(a.net_amount)}</Mono>
      </View>

      <Group label="Breakdown">
        <DetailRow label="Advance" value={money(a.amount)} />
        <DetailRow label="Fee, excl. VAT" value={`−${money(a.fee_amount)}`} />
        {a.fee_vat_amount > 0 && <DetailRow label="VAT on the platform fee" value={`−${money(a.fee_vat_amount)}`} />}
        <DetailRow
          label="Holdback"
          hint="Paid to you when your customer pays, less any deductions"
          value={money(a.holdback_amount)}
          last={a.topup_pending <= 0}
        />
        {a.topup_pending > 0 && (
          <DetailRow
            label="Queued top-up"
            hint="Advanced when the line has room"
            value={money(a.topup_pending)}
            last
          />
        )}
      </Group>

      {a.reasons?.length > 0 && (
        <View className="mb-5">
          <Txt className="mb-2.5 text-sub font-medium text-fg">What the decision rests on</Txt>
          <ReasonList reasons={a.reasons} />
        </View>
      )}

      <Group label="Progress">
        <View className="p-4">
          {a.timeline?.length ? (
            <Timeline
              steps={a.timeline.map((t, i, all) => ({
                label: t.label,
                time: dayTime(t.at),
                done: true,
                current: i === all.length - 1 && !closed && a.status !== 'SETTLED',
              }))}
            />
          ) : (
            <Txt className="text-sub text-muted">No updates yet.</Txt>
          )}
        </View>
      </Group>

      <Group label="Details">
        <DetailRow label="Status" value={a.status_label} mono={false} />
        {a.status === 'QUEUED' && a.queue_position != null && (
          <DetailRow label="Queue position" value={String(a.queue_position)} />
        )}
        {!!a.queued_at && <DetailRow label="Queued" value={day(a.queued_at)} />}
        <DetailRow label="Requested" value={day(a.requested_at)} />
        {!!a.approved_at && <DetailRow label="Approved" value={day(a.approved_at)} />}
        {!!a.disbursed_at && <DetailRow label="Paid out" value={day(a.disbursed_at)} />}
        {!!a.settled_at && <DetailRow label="Repaid" value={day(a.settled_at)} />}
        <DetailRow label="Invoice" value={a.invoice_number} last />
      </Group>

      <ProviderNote provider={provider} />
    </SheetScreen>
  );
}
