import { useQuery } from '@tanstack/react-query';
import { SendPreviewSheet, type SendPreviewRow } from '@/components/ui';
import { fetchData } from '@/lib/api/client';
import { str } from '@/lib/api/list';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { quoteLapsed } from '@/lib/quoteStage';
import type { CustomerPrice } from '@/lib/vat';
import { useAuthStore } from '@/stores/authStore';

// Preview-and-confirm before a quote is emailed. Mirrors the server's quote
// email (same recipient, subject and summary) so what is shown is what the
// customer receives. `onConfirm` runs the caller's existing send call.

export interface QuotePreviewData {
  /** Saved quotes: lets an expired quote's preview lead to its edit form. */
  id?: number | string | null;
  quote_number?: string | null;
  customer_id?: number | string | null;
  customer_name?: string | null;
  /** `undefined` while unknown; ''/null when the customer has no email on file. */
  customer_email?: string | null;
  pickup_location?: string | null;
  delivery_location?: string | null;
  /** The price excl. VAT. */
  total_amount?: number | string | null;
  /** VAT and total incl. VAT the customer is sent (backend quote_vat, or the
   *  builder's own figure for an unsaved quote). Absent: only the excl. VAT price. */
  customer_price?: CustomerPrice | null;
  valid_until?: string | null;
  pickup_date?: string | null;
}

export function QuoteSendPreview({
  quote,
  sending,
  confirmLabel = 'Send quote',
  onEdit,
  onConfirm,
  onCancel,
}: {
  quote: QuotePreviewData;
  sending?: boolean;
  confirmLabel?: string;
  /** Opens the quote's edit form; offered first when the quote has expired. */
  onEdit?: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const company = useAuthStore((s) => str(s.user?.company_name)) || 'TruckWys';
  const customerId = quote.customer_id;
  const needsLookup = quote.customer_email === undefined && customerId != null && customerId !== '';
  // Same key as useCustomer, so the customer screen and this share one entry.
  const customerQ = useQuery<Record<string, unknown>>({
    queryKey: ['customer', customerId],
    queryFn: () => fetchData(`customers/${customerId}/`),
    enabled: needsLookup,
    retry: 1,
  });
  const email: string | null | undefined =
    quote.customer_email !== undefined
      ? quote.customer_email
        ? String(quote.customer_email)
        : null
      : customerQ.data
        ? str(customerQ.data.email) || null
        : needsLookup
          ? undefined
          : null;

  const amount = quote.total_amount == null || quote.total_amount === '' ? null : Number(quote.total_amount);
  const vat = quote.customer_price ?? null;
  const money = (v: unknown) => formatCurrency(Number(v) || 0);
  const from = quote.pickup_location;
  const to = quote.delivery_location;

  // Past its valid-until date (the one expiry rule): sending is still allowed,
  // but the customer's link would open on an expired offer, so say so right
  // above the Send button.
  const expired = quoteLapsed({ valid_until: quote.valid_until });
  const validUntil = quote.valid_until ? formatDate(quote.valid_until) : null;

  const rows: SendPreviewRow[] = [
    ...(quote.quote_number ? [{ label: 'Quote', value: String(quote.quote_number) }] : []),
    ...(from || to ? [{ label: 'Route', value: `${from || '—'} to ${to || '—'}` }] : []),
    ...(quote.pickup_date ? [{ label: 'Collection', value: formatDate(quote.pickup_date) }] : []),
    // As in the email: price excl. VAT, the VAT, then the total incl. VAT.
    ...(amount == null || Number.isNaN(amount)
      ? [{ label: 'Price', value: '—' }]
      : !vat
        ? [{ label: 'Price', value: `${formatCurrency(amount)} excl. VAT` }]
        : vat.vat_registered
          ? [
              { label: 'Price excl. VAT', value: formatCurrency(amount) },
              { label: vat.vat_label || 'VAT', value: money(vat.vat_amount) },
              { label: 'Total incl. VAT', value: money(vat.total_incl_vat) },
            ]
          : [{ label: 'Total', value: `${money(vat.total_incl_vat)} (no VAT charged)` }]),
    ...(validUntil
      ? [{ label: 'Valid until', value: expired ? `${validUntil} · expired` : validUntil, warn: expired }]
      : []),
  ];

  return (
    <SendPreviewSheet
      title="Send quote to customer"
      to={customerQ.isError ? undefined : email}
      toError={customerQ.isError}
      toName={quote.customer_name || undefined}
      subject={quote.quote_number ? `Your freight quote ${quote.quote_number} from ${company}` : undefined}
      rows={rows}
      warning={
        expired
          ? `This quote expired on ${validUntil}. Edit it to set a new valid-until date before sending.`
          : undefined
      }
      note="The email links to the quote so they can accept or decline it online."
      noEmailHint="No email will go out. The quote is marked as sent and you can share its link yourself."
      noEmailConfirmLabel={expired ? 'Mark sent anyway' : 'Mark as sent'}
      confirmLabel={expired ? 'Send anyway' : confirmLabel}
      preferredAction={expired && onEdit ? { label: 'Edit quote', onPress: onEdit } : undefined}
      sending={sending}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
