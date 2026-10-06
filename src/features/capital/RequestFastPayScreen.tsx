import { useState } from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, Banner, Button, Txt, Mono } from '@/components/ui';
import { DetailSkeleton, ErrorState } from '@/components/feedback';
import {
  capitalErrorCode,
  errorOffer,
  serverMessage,
  useCapitalStatus,
  useOffer,
  useRequestFastPay,
} from '@/lib/capital/api';
import type { AdvanceRow, Offer } from '@/lib/capital/types';
import { canRequestFastPay, useRole } from '@/lib/access';
import type { AppStackParamList } from '@/navigation/types';
import {
  AdvanceChip,
  DecisionChip,
  OfferBreakdown,
  PROVIDER,
  ProviderNote,
  ReasonList,
  dayTime,
  money,
  sentenceCase,
} from './capitalUi';

type Props = NativeStackScreenProps<AppStackParamList, 'RequestFastPay'>;

const confirmLabel = (o: Offer) => {
  switch (o.decision) {
    case 'FUND':
      return `Request ${money(o.net_payout)}`;
    case 'PART_FUND':
      return `Request ${money(o.net_payout)} now`;
    case 'QUEUE':
      return 'Join the queue';
    case 'REFER':
      return 'Send for review';
    default:
      return 'Not eligible';
  }
};

/** What happens next, in the words the decision and the server status allow. */
function nextSteps(adv: AdvanceRow, offer: Offer | undefined, mode: 'A' | 'B' | undefined, provider: string): string {
  if (adv.status === 'QUEUED') {
    return `Your request is waiting for room on the line${adv.queue_position ? ` (position ${adv.queue_position})` : ''}. When there is room it is sent to ${provider} for approval. If it is not funded within 5 business days it is cancelled.`;
  }
  if (adv.status === 'REQUESTED' || adv.status === 'SCORING') {
    const part =
      offer?.decision === 'PART_FUND' && adv.topup_pending > 0
        ? ` The remaining ${money(adv.topup_pending)} is queued and advanced when the line has room.`
        : '';
    const review = offer?.decision === 'REFER' ? ' It needs a manual review first, so it can take longer.' : '';
    return mode === 'B'
      ? `Your request is being checked against ${provider}'s policy.${review} Once approved, ${money(adv.net_amount)} is paid to your bank account.${part}`
      : `Sent to ${provider} for approval.${review} Once approved, ${money(adv.net_amount)} is paid to your bank account.${part}`;
  }
  if (adv.status === 'APPROVED') {
    return `Approved by ${provider}. ${money(adv.net_amount)} is being paid to your bank account.`;
  }
  return adv.status_label;
}

/**
 * Request Fast Pay for one invoice. Opens on the saved offer (GET .../offer/,
 * valid 48 hours), confirms exactly those figures, then shows what happens next.
 * Reached from the Fast Pay screen and the invoice screen.
 */
export function RequestFastPayScreen({ route, navigation }: Props) {
  const { invoiceId, invoiceNumber } = route.params;
  const role = useRole();
  const status = useCapitalStatus();
  const offerQ = useOffer(invoiceId);
  const request = useRequestFastPay();
  const [result, setResult] = useState<{ advance: AdvanceRow; offer?: Offer; existing: boolean } | null>(null);
  const [error, setError] = useState<{ text: string; offer?: Offer } | null>(null);

  const offer = offerQ.data;
  const provider = status.data?.provider_label || PROVIDER;
  const demo = !!(offer?.demo || status.data?.demo);
  const blocked = status.data ? !status.data.can_request : false;
  const roleBlocked = !canRequestFastPay(role);
  const busy = request.isPending;
  const number = offer?.invoice_number || invoiceNumber;

  const submit = async () => {
    if (!offer) return;
    setError(null);
    try {
      const res = await request.mutateAsync({ invoice_id: offer.invoice_id, offer_id: offer.offer_id });
      setResult({ advance: res.advance, offer: res.offer, existing: !!offer.advance });
    } catch (e) {
      const code = capitalErrorCode(e);
      setError({
        text: serverMessage(e, 'The request could not be sent. Try again.'),
        offer: code === 'not_fundable' ? errorOffer(e) : undefined,
      });
    }
  };

  if (result) {
    const adv = result.advance;
    return (
      <SheetScreen
        title={result.existing ? 'Already requested' : 'Request sent'}
        variant="modal"
        onBack={() => navigation.goBack()}
        footer={
          <View className="flex-row gap-2.5">
            <View className="flex-1">
              <Button
                label="View request"
                variant="secondary"
                onPress={() => navigation.replace('AdvanceDetail', { id: adv.id })}
                fullWidth
              />
            </View>
            <View className="flex-1">
              <Button label="Done" onPress={() => navigation.goBack()} fullWidth />
            </View>
          </View>
        }
      >
        <View className="gap-3">
          <View className="flex-row flex-wrap items-center gap-2">
            <Mono className="text-callout font-medium text-fg">{adv.reference}</Mono>
            <AdvanceChip status={adv.status} label={adv.status_label} />
          </View>
          {adv.status !== 'QUEUED' && (
            <Mono className="text-figure font-semibold text-fg">{money(adv.net_amount)}</Mono>
          )}
          <Txt className="text-body text-muted">{nextSteps(adv, result.offer, status.data?.mode, provider)}</Txt>
        </View>
      </SheetScreen>
    );
  }

  if (offerQ.isLoading) {
    return (
      <SheetScreen title="Request Fast Pay" variant="modal" onBack={() => navigation.goBack()}>
        <DetailSkeleton />
      </SheetScreen>
    );
  }
  if (!offer) {
    return (
      <ErrorState
        onRetry={offerQ.refetch}
        message={serverMessage(offerQ.error, "Couldn't load the offer. Check your connection, then try again.")}
      />
    );
  }

  const declined = offer.decision === 'DECLINE' || !offer.eligible;
  const canConfirm = !declined && !demo && !blocked && !roleBlocked && !offer.advance && !busy;

  return (
    <SheetScreen
      title="Request Fast Pay"
      variant="modal"
      onBack={() => navigation.goBack()}
      footer={
        <Button
          label={busy ? 'Sending…' : confirmLabel(offer)}
          loading={busy}
          disabled={!canConfirm}
          onPress={() => void submit()}
          fullWidth
        />
      }
    >
      <View className="gap-4">
        {number ? (
          <Txt className="text-sub text-muted">
            Invoice {number}
            {offer.customer_name ? `, ${offer.customer_name}` : ''}
          </Txt>
        ) : null}

        {offer.advance && (
          <Banner
            tone="warning"
            message={`Already requested. This invoice has a Fast Pay request: ${offer.advance.status_label}. Tap to view it.`}
            onPress={() => navigation.replace('AdvanceDetail', { id: offer.advance!.id })}
          />
        )}
        {demo && (
          <Banner
            tone="warning"
            message="Demo company. These figures are an example. No money moves in the demo, so requests are turned off."
          />
        )}
        {!demo && roleBlocked && !offer.advance && (
          <Banner tone="warning" message="Your role can't request Fast Pay. Ask an admin or manager." />
        )}
        {!demo && !roleBlocked && blocked && !offer.advance && (
          <Banner
            tone="warning"
            message={`Finish your application first. ${sentenceCase(provider)} needs your approved Fast Pay application before you can request. Tap to open Fast Pay.`}
            onPress={() => navigation.replace('Capital')}
          />
        )}

        <View className="gap-2">
          <DecisionChip decision={offer.decision} />
          {!!offer.explanation && <Txt className="text-body text-muted">{offer.explanation}</Txt>}
        </View>

        {!declined && <OfferBreakdown offer={offer} />}
        {offer.reasons?.length > 0 && <ReasonList reasons={offer.reasons} />}

        {error && (
          <View className="gap-2">
            <Banner tone="danger" message={error.text} />
            {error.offer?.reasons?.length ? <ReasonList reasons={error.offer.reasons} /> : null}
          </View>
        )}

        <ProviderNote provider={provider} />
        {!!offer.valid_until && (
          <Txt className="text-caption text-faint">These figures hold until {dayTime(offer.valid_until)}.</Txt>
        )}
      </View>
    </SheetScreen>
  );
}
