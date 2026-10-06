import { useQuery } from '@tanstack/react-query';
import { SendPreviewSheet, type SendPreviewRow } from '@/components/ui';
import { fetchData } from '@/lib/api/client';
import { num, pick, str } from '@/lib/api/list';
import { saDaysBetween } from '@/lib/dates';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { invoiceBalance, invoiceDisplayNumber } from '@/lib/invoiceStatus';
import { useAuthStore } from '@/stores/authStore';

// Preview-and-confirm before an invoice or a payment reminder is emailed. The
// recipient is the invoice's customer's email on file (the address the server
// sends to); `onConfirm` runs the screen's existing send call.

export type InvoiceMessageKind = 'invoice' | 'reminder';

/** Whole days past due on the South African calendar (the same count as the web). */
function daysLate(due: unknown): number {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(due ?? ''));
  if (!m?.[1]) return 0;
  return Math.max(0, saDaysBetween(m[1], new Date()) ?? 0);
}

/**
 * Mirrors the backend's collections._tone_for and the reminder email subject
 * (resend_email.send_payment_reminder_email), so the preview shows the tone and
 * subject the customer will actually receive.
 */
function reminderTone(days: number, count: number) {
  if (days > 30 || count >= 3) return { heading: 'Final notice: payment overdue', tone: 'Final notice' };
  if (days > 0 || count >= 1) return { heading: 'Payment overdue', tone: 'Firm' };
  return { heading: 'Payment reminder', tone: 'Friendly' };
}

export function InvoiceSendPreview({
  kind,
  invoice,
  sending,
  onConfirm,
  onCancel,
}: {
  kind: InvoiceMessageKind;
  invoice: Record<string, unknown>;
  sending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const companyName = useAuthStore((s) => str(s.user?.company_name));
  const rawCustomer = invoice.customer;
  const customerId =
    rawCustomer != null && typeof rawCustomer === 'object'
      ? (rawCustomer as { id?: number | string }).id
      : rawCustomer;
  const hasCustomer = customerId != null && customerId !== '' && typeof customerId !== 'object';
  // Same key as useCustomer, so the customer screen and this share one entry.
  const customerQ = useQuery<Record<string, unknown>>({
    queryKey: ['customer', customerId],
    queryFn: () => fetchData(`customers/${customerId}/`),
    enabled: hasCustomer,
    retry: 1,
  });
  const email: string | null | undefined = customerQ.data
    ? str(customerQ.data.email) || null
    : hasCustomer
      ? undefined
      : null;

  // A draft carries a placeholder; the real number is allocated when it is sent,
  // so the preview can't show it yet.
  const unnumbered = invoiceDisplayNumber(invoice) === 'Draft';
  const number = unnumbered ? 'Assigned when sent' : invoiceDisplayNumber(invoice, `#${str(invoice.id)}`);
  const customerName = str(pick(invoice, ['customer_name']), str(customerQ.data?.name)) || undefined;
  const total = num(pick(invoice, ['total_amount', 'total', 'amount']));
  const balance = invoiceBalance(invoice);
  const due = pick(invoice, ['due_date', 'dueDate']);
  const dueLabel = due ? formatDate(String(due)) : 'On receipt';

  let subject: string | undefined;
  let rows: SendPreviewRow[];
  let note: string;
  if (kind === 'reminder') {
    const days = daysLate(due);
    const count = num(invoice.reminder_count);
    const { heading, tone } = reminderTone(days, count);
    const subjectAmount = num(invoice.balance) ? num(invoice.balance) : total;
    subject = `${heading}: invoice ${number} — ${formatCurrency(subjectAmount)}`;
    const last = str(invoice.last_reminder_at);
    rows = [
      { label: 'Invoice', value: number },
      { label: 'Outstanding', value: formatCurrency(balance) },
      {
        label: 'Due',
        value: days > 0 ? `${dueLabel} · ${days} ${days === 1 ? 'day' : 'days'} late` : dueLabel,
        warn: days > 0,
      },
      { label: 'Tone', value: tone },
      {
        label: 'Reminders',
        value: count > 0 ? `${count} sent${last ? `, last on ${formatDate(last)}` : ''}` : 'This is the first',
      },
    ];
    note = 'The email links to the invoice so they can view and pay it.';
  } else {
    subject = companyName
      ? `Invoice ${unnumbered ? '' : `${number} `}from ${companyName} — ${formatCurrency(total)}`
      : undefined;
    const passed = daysLate(due) > 0;
    rows = [
      { label: 'Invoice', value: number },
      { label: 'Amount', value: `${formatCurrency(total)} incl. VAT` },
      // A draft whose due date has passed goes out already overdue: say so here too.
      { label: 'Due', value: passed ? `${dueLabel} · already passed` : dueLabel, warn: passed },
    ];
    note = 'The invoice PDF is attached and the email links to the online copy.';
  }

  return (
    <SendPreviewSheet
      title={kind === 'reminder' ? 'Send payment reminder' : 'Send invoice'}
      to={customerQ.isError ? undefined : email}
      toError={customerQ.isError}
      toName={customerName}
      subject={subject}
      rows={rows}
      note={note}
      noEmailHint="Add an email address on the customer's page, then send."
      confirmLabel={kind === 'reminder' ? 'Send reminder' : 'Send invoice'}
      sending={sending}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
