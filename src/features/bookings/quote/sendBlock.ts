// Reading a "can't send" answer from the backend (QUOTE-RULES §11). Send,
// status → Sent, create-as-Sent and the PDF can answer 400
// {code: 'quote_send_blocked' | 'check_failed', error, warnings, blocking}.
// Pure, no imports: runs under `node --test`.

export const SEND_BLOCK_CODES = ['quote_send_blocked', 'check_failed'];

/**
 * The one line to show for a refused send/PDF body: the first blocking
 * warning's title, else the server's own message. Null when the body isn't a
 * send block.
 */
export function sendBlockMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (!SEND_BLOCK_CODES.includes(String(b.code))) return null;
  const warnings = Array.isArray(b.warnings) ? (b.warnings as Record<string, unknown>[]) : [];
  const block = warnings.find((w) => w && w.severity === 'block' && typeof w.title === 'string' && w.title);
  if (block) return String(block.title);
  if (b.code === 'check_failed') return "Couldn't check this quote. Try again.";
  return typeof b.error === 'string' && b.error ? b.error : "This quote can't be sent yet.";
}

/** Parse a JSON error body that arrived as text (e.g. a Blob response). */
export function parseErrorBody(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
