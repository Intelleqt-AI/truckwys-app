// Pure quote display rules (no "@/" imports: node tests them). Port of the web
// app's lib/quoteStatus.ts (web 44a9954).

/**
 * A quote with no price yet (its costs aren't complete): never shown as "R 0"
 * and never counted in totals. The server sends customer_price null for these;
 * a zero total says the same on an older response.
 */
export function quoteIncomplete(
  q:
    | {
        total_amount?: unknown;
        customer_price?: unknown;
        costing_inputs?: unknown;
        pricing_complete?: unknown;
      }
    | null
    | undefined,
): boolean {
  if (!q) return false;
  const total = Number(q.total_amount);
  return (
    !(Number.isFinite(total) && total > 0) ||
    ('customer_price' in q && q.customer_price === null) ||
    // pricing_complete false: the server says a cost is unknown (tolls, border costs).
    q.pricing_complete === false ||
    quoteTollsUnknown(q)
  );
}

/**
 * Saved with tolls unknown (the lookup failed and nobody entered or confirmed
 * them): its floor leaves the tolls out, so the quote is incomplete.
 */
export function quoteTollsUnknown(q: { costing_inputs?: unknown } | null | undefined): boolean {
  const ci = (q?.costing_inputs ?? null) as { tolls_unknown?: unknown; tolls_confirmed_none?: unknown } | null;
  return !!ci && ci.tolls_unknown === true && ci.tolls_confirmed_none !== true;
}
