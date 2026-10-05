import { useState } from 'react';
import { View, Share, Modal, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  SheetScreen,
  StatCard,
  StatusPill,
  Group,
  DetailRow,
  ListRow,
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
  paymentsManagedBy,
  type InvoicePayment,
} from './api';
import { deleteInvoice, deletePayment, updatePayment, voidInvoice } from '@/lib/finance/api';
import { RecordPaymentSheet, type PaymentDraft } from './RecordPaymentSheet';
import { DueDateSheet } from './DueDateSheet';
import { InvoiceSendPreview, type InvoiceMessageKind } from './InvoiceSendPreview';
import { ReasonDialog } from './components/ReasonDialog';
import { TotalsBreakdown } from './components/TotalsBreakdown';
import {
  AccountingSyncCard,
  AccountingSyncNotice,
  PaymentSourceBadge,
} from '@/features/accounting/components/DocumentSync';
import { usePaymentsManaged } from '@/features/accounting/api';
import { FastPayInvoicePanel } from '@/features/capital/FastPayInvoicePanel';
import { CAPITAL_LAUNCHED } from '@/lib/features';
import { isManualPayment } from '@/lib/finance/payments';
import { sumLines, taxCodeShort, toNumber } from '@/lib/finance/tax';
import {
  revenueTypeLabel,
  type AccountingSync,
  type CreditNoteSummary,
  type InvoiceLine,
} from '@/lib/finance/types';
import { num, str, pick } from '@/lib/api/list';
import { invoiceShareUrl } from '@/lib/legal';
import { openWhatsApp } from '@/lib/whatsapp';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { saDaysBetween } from '@/lib/dates';
import {
  canEditDueDate,
  canSendReminder,
  invoiceDisplayNumber,
  isInvoiceLocked,
  isInvoiceOverdue,
} from '@/lib/invoiceStatus';
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
// afterward would be misleading. The server enforces the same rule (400
// "invoice_locked"), and `is_locked` also covers a draft that is already
// financed (see isInvoiceLocked).

const money = (n: number) => formatCurrency(n);

export function InvoiceDetailScreen({ route, navigation }: Props) {
  const { id, preview } = route.params;
  const { data, isError, isPending, error, refetch } = useInvoice(id, preview);
  const { data: payments } = useInvoicePayments(id);
  // Whether Xero/QuickBooks owns this invoice's payments (a hook, so it sits
  // above the early returns below).
  const managedPayments = usePaymentsManaged(data);
  const qc = useQueryClient();
  const [pdfBusy, setPdfBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [editPayment, setEditPayment] = useState<InvoicePayment | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  // Which message is being previewed, and what happens after it is confirmed.
  // WhatsApp needs the public link, which only exists once the invoice has been
  // sent, and sending it emails the customer, so that path is previewed too.
  const [sendPreview, setSendPreview] = useState<{ kind: InvoiceMessageKind; then: 'email' | 'whatsapp' } | null>(null);
  const [dueOpen, setDueOpen] = useState(false);
  const [dueBusy, setDueBusy] = useState(false);
  const [dueError, setDueError] = useState<string | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidBusy, setVoidBusy] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteBusy, setNoteBusy] = useState(false);
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
  // total - paid - credited, worked out by the server.
  const balance = num(pick(inv, ['balance', 'balance_due', 'amount_due']));
  const credited = num(pick(inv, ['credited_amount']));
  const paid = pick(inv, ['paid_amount', 'paid', 'amount_paid']) != null
    ? num(pick(inv, ['paid_amount', 'paid', 'amount_paid']))
    : total - balance - credited;
  const token = str(pick(inv, ['view_token', 'token']));
  // 'DRAFT' is the model default; the old 'UNPAID' fallback isn't a real status.
  const status = str(pick(inv, ['status']), 'DRAFT').toUpperCase();
  // One overdue rule for the whole app (lib/invoiceStatus): the invoice has been
  // sent, still has a balance, and its due date has passed. The server only
  // flips SENT to OVERDUE on a schedule, so the status string alone lags.
  const overdue = isInvoiceOverdue(inv);
  // An invoice that has been cancelled is "Void" (loads and quotes keep "Cancelled").
  const shownStatus =
    overdue && (status === 'SENT' || status === 'VIEWED') ? 'OVERDUE' : status === 'CANCELLED' ? 'VOID' : status;
  const dueDate = str(pick(inv, ['due_date']));
  const issueDate = str(pick(inv, ['issue_date', 'created_at'])).slice(0, 10);
  const daysPastDue = dueDate ? saDaysBetween(dueDate.slice(0, 10), new Date()) : null;
  const daysLate = overdue && daysPastDue != null && daysPastDue > 0 ? daysPastDue : null;
  const draftPastDue = status === 'DRAFT' && daysPastDue != null && daysPastDue > 0;
  const canRemind = canSendReminder(inv);
  const canEdit = !isInvoiceLocked(inv);
  const lockReason = str(pick(inv, ['lock_reason']));
  const voidReason = str(pick(inv, ['void_reason']));
  const isVoid = status === 'CANCELLED' || !!str(pick(inv, ['voided_at']));
  const isFinanced = inv.is_financed === true;
  const notes = str(pick(inv, ['notes']));
  // A draft shows as "Draft"; the real INV- number is allocated when it is sent.
  const displayNumber = invoiceDisplayNumber(inv);

  // The invoice's own lines. An invoice raised before lines existed (totals_source
  // LEGACY) has none, and falls back to the old itemised mirror when it has one.
  const lines = (Array.isArray(inv.lines) ? inv.lines : []) as InvoiceLine[];
  const legacyItems = lines.length === 0 && Array.isArray(inv.line_items) ? (inv.line_items as Record<string, unknown>[]) : [];
  const lineTotals = lines.length
    ? sumLines(lines.map((l) => ({ net: l.net_amount, vat: l.vat_amount, discount: l.discount_amount, tax_code: l.tax_code })))
    : null;
  const subtotalStr = str(pick(inv, ['subtotal']), '0');
  const vatStr = str(pick(inv, ['vat_amount', 'vat', 'tax_amount', 'tax']), '0');
  const discountStr = str(pick(inv, ['discount']), lineTotals?.discount ?? '0');

  const creditNotes = (Array.isArray(inv.credit_notes) ? inv.credit_notes : []) as CreditNoteSummary[];
  const issuedCreditNotes = creditNotes.filter((c) => c.status === 'ISSUED');
  const sync = (inv.accounting_sync ?? null) as AccountingSync | null;

  // What can be done to an invoice that has gone out (web InvoiceDetail rules):
  // credit what's left; void only one nothing has happened to yet.
  const issued = status !== 'DRAFT' && !isVoid;
  const canCredit = issued && !isFinanced && status !== 'CREDITED' && total - credited > 0.005;
  const canVoid = issued && !isFinanced && paid === 0 && (payments?.length ?? 0) === 0 && issuedCreditNotes.length === 0;
  const canDeleteDraft = status === 'DRAFT' && canEdit;
  const canEditNote = issued && !isFinanced;

  // 'invoice' covers the detail + list + the Home dashboard and finance
  // reports; the shared map can't forget one the way hand-rolled lists did.
  const refresh = () => invalidateFor(qc, 'invoice', 'payment');

  // Where the payment has to be recorded while Xero/QuickBooks manages it.
  const { managed, providerName, connection } = managedPayments;
  const providerRecordUrl = sync?.url ?? connection?.web_url ?? null;

  // Once Xero/QuickBooks manages this invoice's payments TruckWys won't record
  // them: say so and offer the place that does.
  const offerProviderPayment = ({ providerName: name, recordUrl }: { providerName: string; recordUrl: string | null }) => {
    const message = `Payments on this invoice are recorded in ${name}. They appear here once ${name} syncs them.`;
    Alert.alert(
      'Record the payment in ' + name,
      message,
      recordUrl
        ? [
            { text: 'Not now', style: 'cancel' },
            { text: `Open ${name}`, onPress: () => void WebBrowser.openBrowserAsync(recordUrl) },
          ]
        : [{ text: 'OK', style: 'cancel' }],
    );
  };

  // Per-action flags so each button spins independently.
  const run = async (setFlag: (v: boolean) => void, fn: () => Promise<unknown>, okMsg: string) => {
    setFlag(true);
    try {
      await fn();
      refresh();
      toast.success(okMsg);
      return true;
    } catch (e) {
      const m = paymentsManagedBy(e);
      if (m) offerProviderPayment(m);
      else toast.error(e instanceof Error ? e.message : 'Action failed');
      return false;
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
      message: `Invoice ${displayNumber === 'Draft' ? '' : `${displayNumber}: `}${invoiceShareUrl(id, token)}`,
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
      // Sending a draft is what allocates its INV- number, so after it the
      // number has to be read fresh rather than from the draft on screen.
      let current: Record<string, unknown> = inv;
      if (!link) {
        const res = (await sendInvoice(id)) as Record<string, unknown>;
        refresh();
        // send_email returns view_url; fall back to re-reading the invoice.
        link = str(pick(res, ['view_token', 'token']));
        const fresh = (await refetch()).data as Record<string, unknown> | undefined;
        if (fresh) current = fresh;
        if (!link) link = str(pick(fresh ?? {}, ['view_token', 'token']));
      }
      const shownNumber = invoiceDisplayNumber(current, `#${id}`);
      const number = shownNumber === 'Draft' ? '' : shownNumber;
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
      // invoice has been sent in the meantime.
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

  // Edits a payment recorded in TruckWys; the server re-derives the invoice.
  const submitPaymentEdit = async (draft: PaymentDraft) => {
    const p = editPayment;
    if (!p) return;
    setEditPayment(null);
    await run(
      setPayBusy,
      () =>
        updatePayment(p.id, {
          amount: draft.amount.toFixed(2),
          payment_date: draft.payment_date,
          payment_method: draft.payment_method,
          reference_number: draft.reference,
        }),
      'Payment updated',
    );
  };

  const confirmDeletePayment = (p: InvoicePayment) =>
    Alert.alert(
      'Delete this payment?',
      `${money(p.amount)} on ${formatDate(p.date)} will be removed and the invoice balance goes back up.`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void run(setPayBusy, () => deletePayment(p.id), 'Payment deleted'),
        },
      ],
    );

  const confirmDeleteDraft = () =>
    Alert.alert('Delete this draft?', 'It has not been sent, so nothing else is affected.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            const ok = await run(setPayBusy, () => deleteInvoice(id), 'Draft deleted');
            if (ok) navigation.goBack();
          })(),
      },
    ]);

  const submitVoid = async (reason: string) => {
    const ok = await run(setVoidBusy, () => voidInvoice(id, reason), 'Invoice voided');
    if (ok) setVoidOpen(false);
  };

  const submitNote = async (text: string) => {
    const ok = await run(setNoteBusy, () => updateInvoice(id, { notes: text }), 'Note saved');
    if (ok) setNoteOpen(false);
  };

  // One primary action for the state the invoice is in; everything else sits in
  // the overflow menu. Overdue first (chase it), then send/resend, then record a
  // payment, and a PDF when nothing else applies (paid, void, credited).
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
  // While Xero/QuickBooks manages payments the button goes there instead.
  const doPay = () =>
    managed ? offerProviderPayment({ providerName, recordUrl: providerRecordUrl }) : setPayOpen(true);
  const doMarkPaid = () => run(setPayBusy, () => markInvoicePaid(id), 'Marked paid');
  const sendLabel = status === 'DRAFT' ? 'Send invoice' : 'Resend';
  const payLabel = managed ? `Record payment in ${providerName}` : 'Record payment';

  const primaryButton = {
    remind: { label: 'Send reminder', icon: 'bell', busy: sendBusy, onPress: doRemind },
    send: { label: sendLabel, icon: 'send', busy: sendBusy, onPress: doSend },
    pay: { label: payLabel, icon: 'banknote', busy: payBusy, onPress: doPay },
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
      ? [{ label: payLabel, icon: 'banknote' as const, onPress: doPay }]
      : []),
    // Marking paid records a payment, so it is the provider's job too.
    ...(CAN_PAY.includes(status) && !managed
      ? [{ label: 'Mark as paid', icon: 'check' as const, onPress: doMarkPaid }]
      : []),
    ...(primary !== 'pdf'
      ? [{ label: 'Download PDF', icon: 'download' as const, onPress: openPdf }]
      : []),
    ...(canEditNote
      ? [{ label: 'Edit note', icon: 'edit' as const, onPress: () => setNoteOpen(true) }]
      : []),
    ...(canCredit
      ? [
          {
            label: 'Issue credit note',
            icon: 'receipt' as const,
            onPress: () => navigation.navigate('CreateCreditNote', { invoiceId: id, preview: inv }),
          },
        ]
      : []),
    ...(sync?.url
      ? [
          {
            label: `Open in ${sync.provider_name}`,
            icon: 'externalLink' as const,
            onPress: () => void WebBrowser.openBrowserAsync(sync.url as string),
          },
        ]
      : []),
    ...(canVoid
      ? [{ label: 'Void invoice', icon: 'x' as const, destructive: true, onPress: () => setVoidOpen(true) }]
      : []),
    ...(canDeleteDraft
      ? [{ label: 'Delete draft', icon: 'trash' as const, destructive: true, onPress: confirmDeleteDraft }]
      : []),
  ];

  return (
    <SheetScreen
      title={displayNumber}
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
      actionLabel={canEdit ? 'Edit' : token ? 'Share' : undefined}
      actionIcon={canEdit ? 'edit' : token ? 'share' : undefined}
      onAction={
        canEdit
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

      {/* Why this invoice can't be changed: void, or financed through Fast Pay. */}
      {isVoid && (
        <View className="mb-5">
          <Banner tone="warning" message={`Void${voidReason ? ` · ${voidReason}` : ''}`} />
        </View>
      )}
      {!isVoid && status !== 'DRAFT' && !!lockReason && isFinanced && (
        <View className="mb-5">
          <Banner tone="warning" message={lockReason} />
        </View>
      )}
      {sync && (
        <View className="mb-5">
          <AccountingSyncNotice sync={sync} />
        </View>
      )}

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
          last={!notes}
        />
        {!!notes && <DetailRow label="Note" value={notes} mono={false} last />}
      </Group>

      {lines.length > 0 && (
        <Group label="Charges">
          {lines.map((l, i) => {
            const discount = toNumber(l.discount_amount);
            const hint = [
              `${num(l.quantity)} × ${money(num(l.unit_price))}`,
              discount > 0 ? `−${money(discount)}` : null,
              l.tax_code !== 'STANDARD' ? taxCodeShort(l.tax_code) : null,
              l.revenue_type && l.revenue_type !== 'FREIGHT' ? revenueTypeLabel(l.revenue_type) : null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <DetailRow
                key={String(l.id ?? i)}
                label={l.description || 'Charge'}
                hint={hint}
                value={money(num(l.net_amount))}
                last={i === lines.length - 1}
              />
            );
          })}
        </Group>
      )}

      {legacyItems.length > 0 && (
        <Group label="Charges">
          {legacyItems.map((item, i) => {
            const qty = num(pick(item, ['quantity'])) || 1;
            const unit = num(pick(item, ['unit_price', 'price']));
            return (
              <DetailRow
                key={String(pick(item, ['id']) ?? i)}
                label={str(pick(item, ['description', 'item_description']), 'Charge')}
                hint={`${qty} × ${money(unit)}`}
                value={money(qty * unit)}
                last={i === legacyItems.length - 1}
              />
            );
          })}
        </Group>
      )}

      {/* Subtotal, VAT and total are the server's; once issued, what has been
          paid and credited and the balance that is left follow. */}
      <TotalsBreakdown
        subtotal={subtotalStr}
        discount={discountStr}
        vat={vatStr}
        total={str(pick(inv, ['total_amount', 'total']), '0')}
        byCode={lineTotals?.byCode}
        {...(status !== 'DRAFT' ? { paid, credited, balance } : {})}
      />

      {creditNotes.length > 0 && (
        <Group label="Credit notes">
          {creditNotes.map((c, i) => (
            <ListRow
              key={c.id}
              title={c.credit_note_number}
              subtitle={formatDate(c.issue_date)}
              trailing={
                <View className="items-end gap-1">
                  <Mono
                    className={`text-callout font-semibold ${c.status === 'VOID' ? 'text-faint line-through' : 'text-fg'}`}
                  >
                    {money(num(c.total_amount))}
                  </Mono>
                  <StatusPill status={c.status} />
                </View>
              }
              onPress={() => navigation.navigate('CreditNoteDetail', { id: c.id })}
              last={i === creditNotes.length - 1}
            />
          ))}
        </Group>
      )}

      {payments && payments.length > 0 && (
        <Group label="Payments">
          {payments.map((p, i) => {
            // Payments that came from Xero/QuickBooks belong to them; and while
            // they manage payments TruckWys won't change any.
            const editable = isManualPayment(p) && !managed;
            const actions: OverflowAction[] = editable
              ? [
                  { label: 'Edit payment', icon: 'edit', onPress: () => setEditPayment(p) },
                  { label: 'Delete payment', icon: 'trash', destructive: true, onPress: () => confirmDeletePayment(p) },
                ]
              : [];
            return (
              <ListRow
                key={p.id}
                title={`${formatDate(p.date)} · ${paymentMethodLabel(p.method)}`}
                subtitle={p.reference || undefined}
                detail={<PaymentSourceBadge source={p.source} />}
                trailing={
                  <View className="flex-row items-center gap-2.5">
                    <Mono className="text-callout font-semibold text-fg">{money(p.amount)}</Mono>
                    <OverflowMenu actions={actions} accessibilityLabel="Payment actions" title={money(p.amount)} />
                  </View>
                }
                last={i === payments.length - 1}
              />
            );
          })}
        </Group>
      )}

      <AccountingSyncCard sync={sync} what="invoice" localNumber={displayNumber} />

      {/* Fast Pay: this invoice's offer or request, once Fast Pay is live. */}
      {CAPITAL_LAUNCHED && issued && <FastPayInvoicePanel invoiceId={id} />}

      {payOpen && (
        <RecordPaymentSheet
          balance={balance}
          busy={payBusy}
          onConfirm={submitPayment}
          onCancel={() => setPayOpen(false)}
        />
      )}

      {editPayment && (
        <RecordPaymentSheet
          // The most it can be raised to is what is still owed plus what it already covers.
          balance={balance + editPayment.amount}
          busy={payBusy}
          initial={{
            amount: editPayment.amount,
            payment_date: editPayment.date,
            payment_method: editPayment.method,
            reference: editPayment.reference,
          }}
          onConfirm={submitPaymentEdit}
          onCancel={() => setEditPayment(null)}
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
          invoiceNumber={displayNumber}
          issueDate={issueDate}
          dueDate={dueDate}
          busy={dueBusy}
          error={dueError}
          onSave={saveDueDate}
          onCancel={() => setDueOpen(false)}
        />
      )}

      {voidOpen && (
        <ReasonDialog
          title="Void this invoice?"
          message="The customer will no longer owe it. This can't be undone; to correct an invoice that has been paid, issue a credit note instead."
          confirmLabel="Void invoice"
          busy={voidBusy}
          onConfirm={submitVoid}
          onCancel={() => !voidBusy && setVoidOpen(false)}
        />
      )}

      {noteOpen && (
        <ReasonDialog
          title="Note on the invoice"
          confirmLabel="Save note"
          label="Note"
          placeholder="Shown on the invoice"
          initial={notes}
          required={false}
          destructive={false}
          busy={noteBusy}
          onConfirm={submitNote}
          onCancel={() => !noteBusy && setNoteOpen(false)}
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
