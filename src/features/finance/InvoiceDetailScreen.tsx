import { useState } from 'react';
import { View, Share, Modal, Pressable } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, StatCard, StatusPill, Group, DetailRow, Button, Txt, Mono, Banner } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { ErrorState } from '@/components/feedback';
import {
  useInvoice,
  useInvoicePayments,
  paymentMethodLabel,
  generateInvoicePdf,
  sendInvoice,
  sendInvoiceReminder,
  markInvoicePaid,
  recordPayment,
  updateInvoice,
} from './api';
import { RecordPaymentSheet, type PaymentDraft } from './RecordPaymentSheet';
import { DueDateSheet } from './DueDateSheet';
import { InvoiceSendPreview, type InvoiceMessageKind } from './InvoiceSendPreview';
import { num, str, pick } from '@/lib/api/list';
import { invoiceShareUrl } from '@/lib/legal';
import { openWhatsApp } from '@/lib/whatsapp';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { saDaysBetween } from '@/lib/dates';
import { canEditDueDate, canSendReminder, isInvoiceOverdue } from '@/lib/invoiceStatus';
import { toast } from '@/lib/toast';
import { CAPITAL_LAUNCHED, CAPITAL_COMING_SOON } from '@/lib/features';
import { invalidateFor } from '@/lib/queryInvalidation';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'InvoiceDetail'>;

// Which statuses each action is valid for. These mirror the web gates AND what
// the backend will actually accept — sending a reminder on a DRAFT invoice, for
// instance, is rejected with "Reminders can only be sent for outstanding
// invoices", so offering the button there just produces an error toast.
const CAN_SEND = ['DRAFT', 'SENT', 'VIEWED'];
const CAN_PAY = ['SENT', 'VIEWED', 'OVERDUE', 'PARTIALLY_PAID'];
// Editing is only offered pre-send: once an invoice is SENT/VIEWED/PAID/etc.
// the customer has already seen or paid it, so changing the customer/amount
// afterward would be misleading.
const CAN_EDIT = ['DRAFT'];

export function InvoiceDetailScreen({ route, navigation }: Props) {
  const { id, preview } = route.params;
  const { data, isError, refetch } = useInvoice(id, preview);
  const { data: payments } = useInvoicePayments(id);
  const qc = useQueryClient();
  const [pdfBusy, setPdfBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  // Which message is being previewed, and what happens after it is confirmed.
  // WhatsApp needs the public link, which only exists once the invoice has been
  // sent, and sending it emails the customer, so that path is previewed too.
  const [sendPreview, setSendPreview] = useState<{ kind: InvoiceMessageKind; then: 'email' | 'whatsapp' } | null>(null);
  const [dueOpen, setDueOpen] = useState(false);
  const [dueBusy, setDueBusy] = useState(false);
  const [dueError, setDueError] = useState<string | null>(null);
  const { colors } = useTheme();

  if (isError && !data) return <ErrorState onRetry={refetch} message="Couldn't load this invoice." />;
  const inv = (data ?? {}) as Record<string, unknown>;

  const total = num(pick(inv, ['total', 'total_amount']));
  const balance = num(pick(inv, ['balance', 'balance_due', 'amount_due']));
  const paid = num(pick(inv, ['paid', 'amount_paid'])) || total - balance;
  const token = str(pick(inv, ['view_token', 'token']));
  // 'DRAFT' is the model default; the old 'UNPAID' fallback isn't a real status.
  const status = str(pick(inv, ['status']), 'DRAFT').toUpperCase();
  // One overdue rule for the whole app (lib/invoiceStatus): the invoice has been
  // sent, still has a balance, and its due date has passed. The server only
  // flips SENT to OVERDUE on a schedule, so the status string alone lags.
  const overdue = isInvoiceOverdue(inv);
  const shownStatus = overdue && (status === 'SENT' || status === 'VIEWED') ? 'OVERDUE' : status;
  const dueDate = str(pick(inv, ['due_date']));
  const issueDate = str(pick(inv, ['issue_date', 'created_at'])).slice(0, 10);
  const daysPastDue = dueDate ? saDaysBetween(dueDate.slice(0, 10), new Date()) : null;
  const daysLate = overdue && daysPastDue != null && daysPastDue > 0 ? daysPastDue : null;
  const draftPastDue = status === 'DRAFT' && daysPastDue != null && daysPastDue > 0;
  const canRemind = canSendReminder(inv);

  // 'invoice' covers the detail + list + the Home dashboard and finance
  // reports; the shared map can't forget one the way hand-rolled lists did.
  const refresh = () => invalidateFor(qc, 'invoice');

  // Per-action flags so each button spins independently.
  const run = async (setFlag: (v: boolean) => void, fn: () => Promise<unknown>, okMsg: string) => {
    setFlag(true);
    try {
      await fn();
      refresh();
      toast.success(okMsg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setFlag(false);
    }
  };

  const openPdf = async () => {
    setPdfBusy(true);
    try {
      const res = await generateInvoicePdf(id);
      const url = str(pick(res, ['pdf_url', 'url', 'file']));
      if (!url) throw new Error('No PDF returned');
      await WebBrowser.openBrowserAsync(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not generate PDF');
    } finally {
      setPdfBusy(false);
    }
  };

  // Only reachable when `token` is set — the header hides Share otherwise.
  const share = async () => {
    await Share.share({
      message: `Invoice ${str(pick(inv, ['invoice_number']), '')}: ${invoiceShareUrl(id, token)}`,
    });
  };

  // Send offers Email (the backend's own send_invoice) or WhatsApp. WhatsApp
  // needs the public link, and view_token is only minted when the invoice is
  // first sent — so send it first if it hasn't been, then hand off.
  const sendViaEmail = () => {
    setSendOpen(false);
    setSendPreview({ kind: 'invoice', then: 'email' });
  };

  const sendViaWhatsApp = async () => {
    setSendOpen(false);
    // No link yet means sending first, which emails the customer: preview that.
    if (!token) {
      setSendPreview({ kind: 'invoice', then: 'whatsapp' });
      return;
    }
    await openWhatsAppForInvoice();
  };

  const openWhatsAppForInvoice = async () => {
    setSendBusy(true);
    try {
      let link = token;
      if (!link) {
        const res = (await sendInvoice(id)) as Record<string, unknown>;
        refresh();
        // send_email returns view_url; fall back to re-reading the invoice.
        link = str(pick(res, ['view_token', 'token']));
        if (!link) {
          const fresh = (await refetch()).data as Record<string, unknown> | undefined;
          link = str(pick(fresh ?? {}, ['view_token', 'token']));
        }
      }
      const number = str(pick(inv, ['invoice_number']), `#${id}`);
      const url = link ? invoiceShareUrl(id, link) : '';
      const name = str(pick(inv, ['customer_name', 'customer']));
      const message = [
        `Hi${name ? ` ${name}` : ''}, here's your invoice${number ? ` (${number})` : ''} from Truckwys`,
        formatCurrency(balance > 0 ? balance : total),
        url,
      ]
        .filter(Boolean)
        .join(' · ');
      await openWhatsApp(str(pick(inv, ['customer_phone'])), message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not open WhatsApp');
    } finally {
      setSendBusy(false);
    }
  };

  // Runs after the person confirms in the preview.
  const confirmPreview = async () => {
    const current = sendPreview;
    if (!current) return;
    if (current.kind === 'reminder') {
      await run(setSendBusy, () => sendInvoiceReminder(id), 'Reminder sent');
    } else if (current.then === 'whatsapp') {
      await openWhatsAppForInvoice();
    } else {
      await run(setSendBusy, () => sendInvoice(id), 'Invoice emailed');
    }
    setSendPreview(null);
  };

  const saveDueDate = async (next: string) => {
    setDueBusy(true);
    setDueError(null);
    try {
      await updateInvoice(id, { due_date: next });
      refresh();
      setDueOpen(false);
      toast.success('Due date changed');
    } catch (e) {
      // Kept inside the sheet: e.g. "can't be before the issue date", or the
      // invoice has been paid in the meantime.
      setDueError(e instanceof Error ? e.message : "Couldn't change the due date");
    } finally {
      setDueBusy(false);
    }
  };

  // payment_date and payment_method are required by the API and were never
  // sent by the old one-tap confirm, so every payment 400'd. The sheet collects
  // them (plus a partial amount and an optional reference).
  const submitPayment = async (draft: PaymentDraft) => {
    setPayOpen(false);
    await run(
      setPayBusy,
      () => recordPayment({ invoice: Number(id), ...draft }),
      draft.amount < balance ? 'Partial payment recorded' : 'Payment recorded',
    );
  };

  return (
    <SheetScreen
      eyebrow="Invoice"
      title={str(pick(inv, ['invoice_number', 'number']), 'Invoice')}
      onBack={() => navigation.goBack()}
      // A draft has no business being shared — it isn't finalised, and its
      // view_token isn't minted until it's first sent, so the link wouldn't
      // work anyway. The header action slot is otherwise idle exactly when
      // DRAFT, so Edit takes it over there instead (same actionLabel/
      // actionIcon/onAction pattern as VehicleDetailScreen/DriverDetailScreen/
      // CustomerDetailScreen's Edit button).
      // Beyond DRAFT, Share also needs a `token` — an invoice that was marked
      // paid without ever being emailed/reminded still has no view_token, and
      // there's no link to share. Hiding the button there (rather than
      // showing it and failing silently) matches the DRAFT case above.
      actionLabel={CAN_EDIT.includes(status) ? 'Edit' : token ? 'Share' : undefined}
      actionIcon={CAN_EDIT.includes(status) ? 'edit' : token ? 'share' : undefined}
      onAction={
        CAN_EDIT.includes(status)
          ? () => navigation.navigate('CreateInvoice', { id, preview: inv })
          : token
            ? share
            : undefined
      }
      footer={
        <View className="gap-2.5">
          <View className="flex-row gap-2.5">
            <View className="flex-1">
              <Button label="PDF" icon="download" variant="secondary" loading={pdfBusy} onPress={openPdf} fullWidth />
            </View>
            {CAN_SEND.includes(status) && (
              <View className="flex-1">
                <Button
                  label={status === 'VIEWED' ? 'Resend' : 'Send'}
                  icon="send"
                  loading={sendBusy}
                  onPress={() => setSendOpen(true)}
                  fullWidth
                />
              </View>
            )}
          </View>
          <View className="flex-row gap-2.5">
            {canRemind && (
              <View className="flex-1">
                <Button label="Reminder" icon="bell" variant="secondary" onPress={() => setSendPreview({ kind: 'reminder', then: 'email' })} fullWidth />
              </View>
            )}
            {CAN_PAY.includes(status) && (
              <View className="flex-1">
                <Button label="Record payment" icon="dollar" loading={payBusy} onPress={() => setPayOpen(true)} fullWidth />
              </View>
            )}
          </View>
          {CAN_PAY.includes(status) && (
            <Button label="Mark as paid" variant="secondary" onPress={() => run(setPayBusy, () => markInvoicePaid(id), 'Marked paid')} fullWidth />
          )}
          {/* Fast Pay has no funding partner yet: the action stays visible so
              people know it is coming, but it does nothing until
              CAPITAL_LAUNCHED is flipped (lib/features.ts). */}
          {!CAPITAL_LAUNCHED && CAN_PAY.includes(status) && (
            <View>
              <Button label="Request Fast Pay (coming soon)" icon="dollar" variant="secondary" disabled fullWidth />
              <Txt className="mt-1.5 text-micro text-faint">{CAPITAL_COMING_SOON}</Txt>
            </View>
          )}
        </View>
      }
    >
      <View className="mb-4 flex-row flex-wrap items-center gap-2.5">
        <StatusPill status={shownStatus} />
      </View>

      {/* A draft whose due date has passed goes out already overdue. */}
      {draftPastDue && (
        <View className="mb-5">
          <Banner
            tone="warning"
            message={`Draft · due date ${formatDate(dueDate)} has passed. Sent as it is, it arrives ${daysPastDue} ${
              daysPastDue === 1 ? 'day' : 'days'
            } overdue. Tap to change the due date.`}
            onPress={() => {
              setDueError(null);
              setDueOpen(true);
            }}
          />
        </View>
      )}

      <View className="mb-5 flex-row gap-3">
        <StatCard label="Total" value={formatCurrency(total, { maximumFractionDigits: 0 })} />
        <StatCard label="Balance" value={formatCurrency(balance, { maximumFractionDigits: 0 })} />
      </View>

      <Group label="Details">
        <DetailRow label="Customer" value={str(pick(inv, ['customer_name', 'customer']), '—')} mono={false} />
        <DetailRow label="Issued" value={formatDate(str(pick(inv, ['issue_date', 'created_at'])))} />
        <DetailRow
          label="Due"
          value={formatDate(dueDate)}
          hint={daysLate ? `${daysLate} ${daysLate === 1 ? 'day' : 'days'} late` : undefined}
          hintColor={daysLate ? colors.danger : undefined}
          onEdit={
            canEditDueDate(inv) && dueDate
              ? () => {
                  setDueError(null);
                  setDueOpen(true);
                }
              : undefined
          }
          editLabel="Change due date"
        />
        <DetailRow label="Paid" value={formatCurrency(paid)} last />
      </Group>

      <Group label="Amounts">
        <DetailRow label="Subtotal" value={formatCurrency(num(pick(inv, ['subtotal'])))} />
        <DetailRow label="VAT (15%)" value={formatCurrency(num(pick(inv, ['vat', 'tax', 'vat_amount'])))} />
        <View className="flex-row items-center justify-between bg-surface-hover px-3.5 py-3.5">
          <Txt className="text-callout font-semibold text-fg">Total</Txt>
          <Mono className="text-heading font-semibold text-accent">
            {formatCurrency(total)}
          </Mono>
        </View>
      </Group>

      {payments && payments.length > 0 && (
        <Group label="Payment history">
          {payments.map((p, i) => (
            <DetailRow
              key={p.id}
              label={`${formatDate(p.date)} · ${paymentMethodLabel(p.method)}${p.reference ? ` · ${p.reference}` : ''}`}
              value={formatCurrency(p.amount)}
              last={i === payments.length - 1}
            />
          ))}
        </Group>
      )}

      {payOpen && (
        <RecordPaymentSheet
          balance={balance}
          busy={payBusy}
          onConfirm={submitPayment}
          onCancel={() => setPayOpen(false)}
        />
      )}

      {sendPreview && (
        <InvoiceSendPreview
          kind={sendPreview.kind}
          invoice={inv}
          sending={sendBusy}
          onConfirm={confirmPreview}
          onCancel={() => !sendBusy && setSendPreview(null)}
        />
      )}

      {dueOpen && (
        <DueDateSheet
          invoiceNumber={str(pick(inv, ['invoice_number', 'number']), 'Invoice')}
          issueDate={issueDate}
          dueDate={dueDate}
          busy={dueBusy}
          error={dueError}
          onSave={saveDueDate}
          onCancel={() => setDueOpen(false)}
        />
      )}

      {sendOpen && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setSendOpen(false)}>
          <Pressable
            onPress={() => setSendOpen(false)}
            className="flex-1 items-center justify-center bg-backdrop px-6"
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              className="w-full max-w-[420px] rounded-panel border border-line bg-elevated p-5"
            >
              <Txt className="text-heading font-semibold text-fg">Send invoice</Txt>
              <Txt className="mb-4 mt-1.5 text-sub text-muted">
                {str(pick(inv, ['customer_name', 'customer']), 'the customer')}
              </Txt>
              <View className="gap-2.5">
                <Button label="Email" icon="send" onPress={sendViaEmail} fullWidth />
                <Button
                  label="WhatsApp"
                  icon="share"
                  variant="secondary"
                  onPress={sendViaWhatsApp}
                  fullWidth
                />
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => setSendOpen(false)}
                  fullWidth
                />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </SheetScreen>
  );
}
