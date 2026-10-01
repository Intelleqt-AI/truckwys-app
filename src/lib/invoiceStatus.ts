// One definition of "overdue" for invoices, used by the list chips, the tiles,
// row actions and the detail screen so they cannot disagree. Port of the web
// app's src/lib/invoiceStatus.ts.
//
// Overdue = the invoice has gone to the customer (not a draft, not cancelled,
// not paid), still has an unpaid balance, and its due date has passed. The
// status string (SENT, VIEWED, OVERDUE, PARTIALLY_PAID) does not matter: the
// backend only flips SENT to OVERDUE on a schedule, and part-paid invoices keep
// their own status however late they are.

type InvoiceLike = Record<string, unknown>;

const NOT_SENT = new Set(['DRAFT', 'CANCELLED', 'VOID']);

/** Statuses the backend's send_reminder endpoint accepts. */
export const REMINDER_STATUSES = new Set(['SENT', 'VIEWED', 'OVERDUE', 'PARTIALLY_PAID']);

const toNumber = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

/** Unpaid balance incl. VAT: the API's `balance`, else total minus paid. */
export function invoiceBalance(inv: InvoiceLike): number {
  const status = String(inv.status ?? '').toUpperCase();
  if (status === 'PAID') return 0;
  const balance = toNumber(inv.balance);
  if (balance !== null) return balance;
  const total = toNumber(inv.total_amount ?? inv.amount) ?? 0;
  const paid = toNumber(inv.paid_amount) ?? 0;
  return total - paid;
}

function parseDue(d: unknown): number | null {
  if (!d) return null;
  const s = String(d);
  // "YYYY-MM-DD" parses as UTC midnight; read it as a local calendar date.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const t = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : new Date(s).getTime();
  return Number.isNaN(t) ? null : t;
}

/** A due date of today is not yet late. */
export function isInvoiceOverdue(inv: InvoiceLike, now: Date = new Date()): boolean {
  const status = String(inv.status ?? '').toUpperCase();
  if (!status || NOT_SENT.has(status) || status === 'PAID') return false;
  if (!(invoiceBalance(inv) > 0)) return false;
  const due = parseDue(inv.due_date ?? inv.dueDate);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return due !== null && due < startOfToday;
}

/** Overdue by the definition above and a status the backend will send a reminder for. */
export function canSendReminder(inv: InvoiceLike, now: Date = new Date()): boolean {
  return isInvoiceOverdue(inv, now) && REMINDER_STATUSES.has(String(inv.status ?? '').toUpperCase());
}

/** The due date can still be changed (not paid, not cancelled). */
export function canEditDueDate(inv: InvoiceLike): boolean {
  const status = String(inv.status ?? '').toUpperCase();
  return status !== 'PAID' && status !== 'CANCELLED' && status !== 'VOID';
}
