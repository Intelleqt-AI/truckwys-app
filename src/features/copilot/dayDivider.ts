import { saDateISO, saDaysBetween } from '@/lib/dates';
import { formatDate } from '@/lib/formatters';

// The day a stretch of the conversation was written, said once as a divider
// when the conversation starts and whenever the day changes, so an old answer's
// figures never read as today's without repeating an age on every reply.
// Mirrors the web's dayDivider (src/pages/Copilot.tsx). Days are South African
// calendar days.

/** South African calendar day (YYYY-MM-DD) of a timestamp, or null. */
export const messageDay = (iso: string | undefined): string | null =>
  iso ? saDateISO(new Date(iso)) : null;

/** "Today", "Yesterday", else "15 Jun 2026 · 104 days ago". */
export function dayDividerLabel(day: string): string {
  const age = saDaysBetween(day) ?? 0;
  if (age <= 0) return 'Today';
  if (age === 1) return 'Yesterday';
  return `${formatDate(day)} · ${age} days ago`;
}
