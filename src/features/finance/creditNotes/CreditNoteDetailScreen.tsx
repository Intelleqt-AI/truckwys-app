import { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  SheetScreen,
  StatCard,
  StatusPill,
  Group,
  DetailRow,
  Banner,
  Button,
  OverflowMenu,
  type OverflowAction,
} from '@/components/ui';
import { ErrorState, DetailSkeleton, NotFoundState } from '@/components/feedback';
import { useCreditNote, voidCreditNote } from '@/lib/finance/api';
import { formatQuantity, sumLines, taxCodeShort, toNumber } from '@/lib/finance/tax';
import { revenueTypeLabel } from '@/lib/finance/types';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { ReasonDialog } from '../components/ReasonDialog';
import { TotalsBreakdown } from '../components/TotalsBreakdown';
import { AccountingSyncCard, AccountingSyncNotice } from '@/features/accounting/components/DocumentSync';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'CreditNoteDetail'>;

const money = (v: string | number) => formatCurrency(toNumber(v));

export function CreditNoteDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const { data: note, isError, isPending, error, refetch } = useCreditNote(id);
  const qc = useQueryClient();
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidBusy, setVoidBusy] = useState(false);

  if (isError && !note) {
    return (error as { status?: number } | null)?.status === 404 ? (
      <SheetScreen title="Credit note" onBack={() => navigation.goBack()}>
        <NotFoundState what="Credit note" onBack={() => navigation.goBack()} />
      </SheetScreen>
    ) : (
      <ErrorState onRetry={refetch} message="Couldn't load this credit note." />
    );
  }
  if (!note && isPending) {
    return (
      <SheetScreen title="Credit note" onBack={() => navigation.goBack()}>
        <DetailSkeleton />
      </SheetScreen>
    );
  }
  if (!note) return null;

  const isVoid = note.status === 'VOID';
  const totals = sumLines(note.lines.map((l) => ({ net: l.net_amount, vat: l.vat_amount, tax_code: l.tax_code })));

  // Only a credit note raised in TruckWys can be voided here; one that came from
  // the accounting system belongs to it.
  const manual = (note.source ?? 'MANUAL') === 'MANUAL';
  const actions: OverflowAction[] =
    !isVoid && manual
      ? [{ label: 'Void credit note', icon: 'x', destructive: true, onPress: () => setVoidOpen(true) }]
      : [];

  const submitVoid = async (reason: string) => {
    setVoidBusy(true);
    try {
      await voidCreditNote(note.id, reason);
      invalidateFor(qc, 'credit-note');
      toast.success('Credit note voided');
      setVoidOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't void the credit note");
    } finally {
      setVoidBusy(false);
    }
  };

  return (
    <SheetScreen
      title={note.credit_note_number}
      onBack={() => navigation.goBack()}
      footer={
        <View className="flex-row items-center gap-2.5">
          <View className="flex-1">
            <Button
              label={`Open invoice ${note.invoice_number}`}
              variant="secondary"
              onPress={() => navigation.navigate('InvoiceDetail', { id: note.invoice })}
              fullWidth
            />
          </View>
          <OverflowMenu actions={actions} />
        </View>
      }
    >
      <View className="mb-4 flex-row flex-wrap items-center gap-2.5">
        <StatusPill status={note.status} />
      </View>

      {isVoid && (
        <View className="mb-5">
          <Banner
            tone="warning"
            message={`Void${note.voided_at ? ` on ${formatDate(note.voided_at)}` : ''}. The invoice balance went back up.`}
          />
        </View>
      )}
      {note.accounting_sync && (
        <View className="mb-5">
          <AccountingSyncNotice sync={note.accounting_sync} />
        </View>
      )}

      <View className="mb-5 flex-row gap-3">
        <StatCard label="Credit" value={formatCurrency(toNumber(note.total_amount), { maximumFractionDigits: 0 })} />
        <StatCard label="Excl. VAT" value={formatCurrency(toNumber(note.subtotal), { maximumFractionDigits: 0 })} />
      </View>

      <Group label="Details">
        <DetailRow label="Customer" value={note.customer_name || '—'} mono={false} />
        <DetailRow label="Against invoice" value={note.invoice_number || '—'} />
        <DetailRow label="Issued" value={formatDate(note.issue_date)} />
        <DetailRow label="Reason" value={note.reason || '—'} mono={false} last />
      </Group>

      <Group label="Credited">
        {note.lines.map((l, i) => {
          const hint = [
            `${formatQuantity(l.quantity)} × ${money(l.unit_price)}`,
            l.tax_code !== 'STANDARD' ? taxCodeShort(l.tax_code) : null,
            l.revenue_type && l.revenue_type !== 'FREIGHT' ? revenueTypeLabel(l.revenue_type) : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <DetailRow
              key={l.id}
              label={l.description}
              hint={hint}
              value={money(l.net_amount)}
              last={i === note.lines.length - 1}
            />
          );
        })}
      </Group>

      <TotalsBreakdown
        subtotal={totals.subtotal}
        vat={note.vat_amount}
        total={note.total_amount}
        byCode={totals.byCode}
      />

      <AccountingSyncCard sync={note.accounting_sync} what="credit note" localNumber={note.credit_note_number} />

      {voidOpen && (
        <ReasonDialog
          title="Void this credit note?"
          message="The customer owes the amount again: the invoice balance goes back up."
          confirmLabel="Void credit note"
          busy={voidBusy}
          onConfirm={submitVoid}
          onCancel={() => !voidBusy && setVoidOpen(false)}
        />
      )}
    </SheetScreen>
  );
}
