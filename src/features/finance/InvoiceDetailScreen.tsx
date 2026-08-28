import { useEffect, useState } from 'react';
import { View, Share, Linking, Modal, Pressable } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, StatCard, StatusPill, Group, DetailRow, Button, Badge, Txt, Mono } from '@/components/ui';
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
} from './api';
import {
  useCapitalEligible,
  findEligible,
  findIneligible,
  loadAppliedIds,
  saveAppliedId,
  MERCHANT_CAPITAL_URL,
} from './fastpay';
import { RecordPaymentSheet, type PaymentDraft } from './RecordPaymentSheet';
import { num, str, pick } from '@/lib/api/list';
import { invoiceShareUrl } from '@/lib/legal';
import { openWhatsApp } from '@/lib/whatsapp';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'InvoiceDetail'>;

// Which statuses each action is valid for. These mirror the web gates AND what
// the backend will actually accept — sending a reminder on a DRAFT invoice, for
// instance, is rejected with "Reminders can only be sent for outstanding
// invoices", so offering the button there just produces an error toast.
const CAN_SEND = ['DRAFT', 'SENT', 'VIEWED'];
const CAN_REMIND = ['SENT', 'VIEWED', 'OVERDUE'];
const CAN_PAY = ['SENT', 'VIEWED', 'OVERDUE', 'PARTIALLY_PAID'];
// Editing is only offered pre-send: once an invoice is SENT/VIEWED/PAID/etc.
// the customer has already seen or paid it, so changing the customer/amount
// afterward would be misleading.
const CAN_EDIT = ['DRAFT'];

export function InvoiceDetailScreen({ route, navigation }: Props) {
  const { id, preview } = route.params;
  const { data, isError, refetch } = useInvoice(id, preview);
  const { data: capital } = useCapitalEligible();
  const { data: payments } = useInvoicePayments(id);
  const qc = useQueryClient();
  const [pdfBusy, setPdfBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [applied, setApplied] = useState<Set<string>>(new Set());

  useEffect(() => {
    void loadAppliedIds().then(setApplied);
  }, []);

  if (isError && !data) return <ErrorState onRetry={refetch} message="Couldn't load this invoice." />;
  const inv = (data ?? {}) as Record<string, unknown>;

  const total = num(pick(inv, ['total', 'total_amount']));
  const balance = num(pick(inv, ['balance', 'balance_due', 'amount_due']));
  const paid = num(pick(inv, ['paid', 'amount_paid'])) || total - balance;
  const token = str(pick(inv, ['view_token', 'token']));
  // 'DRAFT' is the model default; the old 'UNPAID' fallback isn't a real status.
  const status = str(pick(inv, ['status']), 'DRAFT').toUpperCase();

  // Eligibility is set membership against the backend's list — never computed
  // here. See fastpay.ts for why `early_pay_eligible` must not be used.
  const eligibleEntry = findEligible(capital?.invoices ?? [], id);
  const ineligibleEntry = eligibleEntry ? undefined : findIneligible(capital?.ineligible_invoices ?? [], id);
  // The Capital page honours this and the invoice pages historically didn't;
  // the stricter behaviour is the correct one.
  const riskBlocked = !!eligibleEntry?.risk_blocked;
  const tier = str(eligibleEntry?.risk_tier ?? eligibleEntry?.tier);
  const hasApplied = applied.has(String(id));

  const applyForCapital = async () => {
    setApplied(await saveAppliedId(id));
    await Linking.openURL(MERCHANT_CAPITAL_URL);
  };

  // 'invoice' covers the detail + list + Fast Pay eligibility + the Home
  // dashboard and finance reports. The web app forgets capital-eligible after
  // a payment and goes stale; the shared map can't.
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

  const share = async () => {
    if (!token) return toast.info('No public link available');
    await Share.share({
      message: `Invoice ${str(pick(inv, ['invoice_number']), '')}: ${invoiceShareUrl(id, token)}`,
    });
  };

  // Send offers Email (the backend's own send_invoice) or WhatsApp. WhatsApp
  // needs the public link, and view_token is only minted when the invoice is
  // first sent — so send it first if it hasn't been, then hand off.
  const sendViaEmail = () => {
    setSendOpen(false);
    void run(setSendBusy, () => sendInvoice(id), 'Invoice emailed');
  };

  const sendViaWhatsApp = async () => {
    setSendOpen(false);
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
      actionLabel={CAN_EDIT.includes(status) ? 'Edit' : 'Share'}
      actionIcon={CAN_EDIT.includes(status) ? 'edit' : 'share'}
      onAction={
        CAN_EDIT.includes(status)
          ? () => navigation.navigate('CreateInvoice', { id, preview: inv })
          : share
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
            {CAN_REMIND.includes(status) && (
              <View className="flex-1">
                <Button label="Reminder" icon="bell" variant="secondary" onPress={() => run(setSendBusy, () => sendInvoiceReminder(id), 'Reminder sent')} fullWidth />
              </View>
            )}
            {CAN_PAY.includes(status) && (
              <View className="flex-1">
                <Button label="Record payment" icon="dollar" loading={payBusy} onPress={() => setPayOpen(true)} fullWidth />
              </View>
            )}
          </View>
          {status !== 'PAID' && (
            <Button label="Mark as paid" variant="secondary" onPress={() => run(setPayBusy, () => markInvoicePaid(id), 'Marked paid')} fullWidth />
          )}
          {/* Applications are completed on Merchant Capital's own site — there's
              no in-app advance request behind this, same as the web app. */}
          {eligibleEntry && !riskBlocked && (
            <Button
              label={hasApplied ? 'Applied ✓' : 'Apply for capital →'}
              icon="dollar"
              variant={hasApplied ? 'secondary' : 'primary'}
              onPress={applyForCapital}
              fullWidth
            />
          )}
        </View>
      }
    >
      <View className="mb-4 flex-row flex-wrap items-center gap-2.5">
        <StatusPill status={status} />
        {eligibleEntry && !riskBlocked && tier && <Badge label={tier.toUpperCase()} tone="info" />}
        {riskBlocked && <Badge label="High risk" tone="danger" />}
      </View>

      {/* The backend writes these reasons (no POD, invoice too old, no facility,
          …) — show them verbatim rather than a generic "not eligible". */}
      {ineligibleEntry?.reason && (
        <View className="mb-5 rounded-xs border border-line bg-surface p-3">
          <Mono className="mb-1 text-micro tracking-wide uppercase text-faint">Fast Pay</Mono>
          <Txt className="text-caption text-muted">{ineligibleEntry.reason}</Txt>
        </View>
      )}
      {riskBlocked && (
        <View className="mb-5 rounded-xs border border-warning bg-warning-bg p-3">
          <Txt className="text-caption text-fg">
            {`Customer risk ${eligibleEntry?.customer_risk_pct ?? '—'}% is above the 70% Fast Pay limit.`}
          </Txt>
        </View>
      )}

      <View className="mb-5 flex-row gap-3">
        <StatCard label="Total" value={formatCurrency(total, { maximumFractionDigits: 0 })} />
        <StatCard label="Balance" value={formatCurrency(balance, { maximumFractionDigits: 0 })} />
      </View>

      <Group label="Details">
        <DetailRow label="Customer" value={str(pick(inv, ['customer_name', 'customer']), '—')} mono={false} />
        <DetailRow label="Issued" value={formatDate(str(pick(inv, ['issue_date', 'created_at'])) || new Date().toISOString())} />
        <DetailRow label="Due" value={formatDate(str(pick(inv, ['due_date'])) || new Date().toISOString())} />
        <DetailRow label="Paid" value={formatCurrency(paid)} last />
      </Group>

      <Group label="Amounts">
        <DetailRow label="Subtotal" value={formatCurrency(num(pick(inv, ['subtotal'])))} />
        <DetailRow label="VAT (15%)" value={formatCurrency(num(pick(inv, ['vat', 'tax', 'vat_amount'])))} />
        <View className="flex-row items-center justify-between bg-surface-hover px-3.5 py-3.5">
          <Txt className="text-callout font-semibold text-fg">Total</Txt>
          <Txt className="text-heading font-semibold text-accent" style={{ fontFamily: 'Menlo' }}>
            {formatCurrency(total)}
          </Txt>
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

      {sendOpen && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setSendOpen(false)}>
          <Pressable
            onPress={() => setSendOpen(false)}
            className="flex-1 items-center justify-center bg-black/65 px-6"
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              className="w-full max-w-[420px] rounded-sm border border-line bg-surface p-5"
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
