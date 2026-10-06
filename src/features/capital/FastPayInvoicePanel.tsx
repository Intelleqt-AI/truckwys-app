import { View } from 'react-native';
import { Button, DetailRow, Group, Label, Txt } from '@/components/ui';
import { useCapitalStatus, useFastPayInvoices } from '@/lib/capital/api';
import { canRequestFastPay, useRole } from '@/lib/access';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { AdvanceChip, DecisionChip, ReasonList, day, money } from './capitalUi';

/**
 * Invoice screen: this invoice's Fast Pay offer or live request. Reads the list
 * preview (nothing is saved by viewing an invoice); the request screen loads the
 * saved offer. Renders nothing when the invoice isn't in Fast Pay at all (paid,
 * draft) or the data is unavailable, so it is safe to mount whenever Fast Pay is
 * launched.
 */
export function FastPayInvoicePanel({ invoiceId }: { invoiceId: number | string }) {
  const { nav } = useAppNavigation();
  const role = useRole();
  const q = useFastPayInvoices();
  const status = useCapitalStatus();
  const id = Number(invoiceId);
  const offer =
    q.data?.offers.find((o) => o.invoice_id === id) ?? q.data?.ineligible.find((o) => o.invoice_id === id);
  if (!offer) return null;
  const demo = !!(offer.demo || status.data?.demo);
  const ineligible = offer.decision === 'DECLINE' || !offer.eligible;

  return (
    <View>
      <View className="mb-2.5 flex-row items-center justify-between">
        <View>
          <Label>Fast Pay</Label>
          {demo && <Txt className="text-caption text-faint">Demo: no money moves</Txt>}
        </View>
        {offer.advance ? (
          <AdvanceChip status={offer.advance.status} label={offer.advance.status_label} />
        ) : (
          <DecisionChip decision={offer.decision} />
        )}
      </View>

      {offer.advance ? (
        <Button
          label="View request"
          variant="secondary"
          onPress={() => nav.navigate('AdvanceDetail', { id: offer.advance!.id })}
          fullWidth
        />
      ) : ineligible ? (
        <View className="mb-5 rounded-card border border-line bg-surface p-3.5">
          <ReasonList reasons={offer.reasons} compact />
        </View>
      ) : (
        <>
          <Group>
            <DetailRow label="You receive now" value={money(offer.net_payout)} boldValue />
            <DetailRow label="Fee, excl. VAT" value={money(offer.fee_amount)} />
            <DetailRow label="Holdback" value={money(offer.holdback_amount)} />
            <DetailRow label="Customer expected to pay" value={day(offer.expected_payment_date)} last />
          </Group>
          {offer.reasons?.length > 0 && (
            <View className="-mt-2 mb-4">
              <ReasonList reasons={offer.reasons} compact />
            </View>
          )}
          {canRequestFastPay(role) && (
            <View className="mb-5">
              <Button
                label="Request Fast Pay"
                onPress={() =>
                  nav.navigate('RequestFastPay', { invoiceId: offer.invoice_id, invoiceNumber: offer.invoice_number })
                }
                fullWidth
              />
            </View>
          )}
        </>
      )}
    </View>
  );
}
