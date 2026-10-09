// The settled chip on a copilot proposal card. Pure (node-testable).

export interface SettledInput {
  status: string;
  operation: string;
  sends?: boolean;
  fields: { label: string; value: string }[];
  /** The status chip's own text ("✓ Saved", "Dismissed", …). */
  chipText: string;
}

/** "✓ Sent to {customer}" / "✓ Quote sent" when an executed proposal sent the quote. */
export function settledText(p: SettledInput): string {
  if (p.status !== 'executed') return p.chipText;
  if (!p.sends && p.operation !== 'SEND') return p.chipText;
  const customer = p.fields.find((f) => /^(customer|client)\b/i.test(f.label.trim()))?.value.trim();
  return customer ? `✓ Sent to ${customer}` : '✓ Quote sent';
}
