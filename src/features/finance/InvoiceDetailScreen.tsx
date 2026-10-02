import { useState } from 'react';
import { View, Share, Modal, StyleSheet, TouchableOpacity } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  SheetScreen,
  StatCard,
  StatusPill,
  Group,
  DetailRow,
  Button,
  Txt,
  Mono,
  Banner,
  OverflowMenu,
  type OverflowAction,
} from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { ErrorState, DetailSkeleton, NotFoundState } from '@/components/feedback';
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
import { formatCurrency, formatDate, formatPercent } from '@/lib/formatters';
import { saDaysBetween } from '@/lib/dates';
import { canEditDueDate, canSendReminder, isInvoiceOverdue } from '@/lib/invoiceStatus';
import { toast } from '@/lib/toast';
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
  const { data, isError, isPending, error, refetch } = useInvoice(id, preview);
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

  // A deleted or moved invoice is a 404, which is not worth retrying.
  if (isError && !data) {
    return (error as { status?: number } | null)?.status === 404 ? (
      <SheetScreen title="Invoice" onBack={() => navigation.goBack()}>
        <NotFoundState what="Invoice" onBack={() => navigation.goBack()} />
      </SheetScreen>
    ) : (
      <ErrorState onRetry={refetch} message="Couldn't load this invoice." />
    );
  }
  // Opened cold (a push deep link) there is no preview to show yet; a skeleton
  // beats a "DRAFT / R0" frame that then snaps to the real values.
  if (!data && isPending) {
    return (
      <SheetScreen title="Invoice" onBack={() => navigation.goBack()}>
        <DetailSkeleton />
      </SheetScreen>
    );
  }
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

  // The VAT rate comes from the invoice (stored as 0.15 or 15). Without one it is
  // worked out from the VAT and subtotal, and with neither the label stays plain.
  const subtotal = num(pick(inv, ['subtotal']));
  const vatAmount = num(pick(inv, ['vat_amount', 'vat', 'tax_amount', 'tax']));
  const rawRate = pick(inv, ['tax_rate', 'vat_rate']);
  const ratePct =
    rawRate != null && rawRate !== ''
      ? num(rawRate) > 0 && num(rawRate) <= 1
        ? num(rawRate) * 100
        : num(rawRate)
      : subtotal > 0 && vatAmount > 0
        ? (vatAmount / subtotal) * 100
        : null;
  const vatLabel =
    ratePct != null && ratePct > 0
      ? `VAT (${formatPercent(ratePct, Math.abs(ratePct - Math.round(ratePct)) < 0.05 ? 0 : 1)})`
      : 'VAT';
  // Itemised charges, when the payload carries them.
  const lineItems = (Array.isArray(inv.line_items) ? inv.line_items : []) as Record<string, unknown>[];

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

  // One primary action for the state the invoice is in; everything else sits in
  // the overflow menu. Overdue first (chase it), then send/resend, then record a
  // payment, and a PDF when nothing else applies (paid, cancelled).
  type Primary = 'remind' | 'send' | 'pay' | 'pdf';
  const primary: Primary = canRemind
    ? 'remind'
    : CAN_SEND.includes(status)
      ? 'send'
      : CAN_PAY.includes(status)
        ? 'pay'
        : 'pdf';
  const doRemind = () => setSendPreview({ kind: 'reminder', then: 'email' });
  const doSend = () => setSendOpen(true);
  const doPay = () => setPayOpen(true);
  const doMarkPaid = () => run(setPayBusy, () => markInvoicePaid(id), 'Marked paid');
  const sendLabel = status === 'DRAFT' ? 'Send invoice' : 'Resend';

  const primaryButton = {
    remind: { label: 'Send reminder', icon: 'bell', busy: sendBusy, onPress: doRemind },
    send: { label: sendLabel, icon: 'send', busy: sendBusy, onPress: doSend },
    pay: { label: 'Record payment', icon: 'banknote', busy: payBusy, onPress: doPay },
    pdf: { label: 'Download PDF', icon: 'download', busy: pdfBusy, onPress: openPdf },
  }[primary] as { label: string; icon: 'bell' | 'send' | 'banknote' | 'download'; busy: boolean; onPress: () => void };

  const moreActions: OverflowAction[] = [
    ...(primary !== 'send' && CAN_SEND.includes(status)
      ? [{ label: sendLabel, icon: 'send' as const, onPress: doSend }]
      : []),
    ...(primary !== 'remind' && canRemind
      ? [{ label: 'Send reminder', icon: 'bell' as const, onPress: doRemind }]
      : []),
    ...(primary !== 'pay' && CAN_PAY.includes(status)
      ? [{ label: 'Record payment', icon: 'banknote' as const, onPress: doPay }]
      : []),
    ...(CAN_PAY.includes(status)
      ? [{ label: 'Mark as paid', icon: 'check' as const, onPress: doMarkPaid }]
      : []),
    ...(primary !== 'pdf'
      ? [{ label: 'Download PDF', icon: 'download' as const, onPress: openPdf }]
      : []),
  ];

  return (
    <SheetScreen
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
        <View className="flex-row items-center gap-2.5">
          <View className="flex-1">
            <Button
              label={primaryButton.label}
              icon={primaryButton.icon}
              loading={primaryButton.busy}
              onPress={primaryButton.onPress}
              fullWidth
            />
          </View>
          <OverflowMenu actions={moreActions} />
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
        <StatCard
          label="Balance"
          value={formatCurrency(balance, { maximumFractionDigits: 0 })}
          note={daysLate ? `${daysLate} ${daysLate === 1 ? 'day' : 'days'} late` : undefined}
          tone={daysLate ? 'danger' : undefined}
        />
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

      {lineItems.length > 0 && (
        <Group label="Charges">
          {lineItems.map((item, i) => {
            const qty = num(pick(item, ['quantity'])) || 1;
            const unit = num(pick(item, ['unit_price', 'price']));
            return (
              <DetailRow
                key={String(pick(item, ['id']) ?? i)}
                label={str(pick(item, ['description', 'item_description']), 'Charge')}
                hint={`${qty} x ${formatCurrency(unit)}`}
                value={formatCurrency(qty * unit)}
                last={i === lineItems.length - 1}
              />
            );
          })}
        </Group>
      )}

      <Group label="Amounts">
        <DetailRow label="Subtotal" value={formatCurrency(subtotal)} />
        <DetailRow label={vatLabel} value={formatCurrency(vatAmount)} />
        <View className="flex-row items-center justify-between bg-surface-hover px-3.5 py-3.5">
          <Txt className="text-callout font-semibold text-fg">Total</Txt>
          <Mono className="text-heading font-semibold text-fg">
            {formatCurrency(total)}
          </Mono>
        </View>
      </Group>

      {payments && payments.length > 0 && (
        <Group label="Payments">
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
          <View className="flex-1 items-center justify-center bg-backdrop px-6">
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => setSendOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={StyleSheet.absoluteFill}
            />
            <View className="w-full max-w-[420px] rounded-panel border border-line bg-elevated p-5">
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
            </View>
          </View>
        </Modal>
      )}
    </SheetScreen>
  );
}
