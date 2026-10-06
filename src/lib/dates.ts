// Calendar-date helpers. `toISOString().slice(0, 10)` converts to UTC first,
// which in South Africa (UTC+2) turns the first two hours of a day into the day
// before, so "today" and "this month started on" were wrong around midnight.
// Port of the web app's src/lib/dates.ts.

/** Calendar date (YYYY-MM-DD) in the device's local time zone. */
export function localDateISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Local calendar date `days` from today (negative for the past). */
export function localDatePlusDays(days: number, from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return localDateISO(d);
}

/** The business time zone: every "today" and day count is a South African calendar day. */
export const SA_TIME_ZONE = 'Africa/Johannesburg';

/**
 * Calendar date (YYYY-MM-DD) in South Africa. A date-only string is returned
 * as is; a timestamp or Date is read in Africa/Johannesburg, so a phone set to
 * another time zone still sees the same day as the web dashboard.
 */
export function saDateISO(v: Date | string | number = new Date()): string | null {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: SA_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    // Hermes builds without full Intl timezone data.
    return localDateISO(d);
  }
}

/** Whole calendar days from a to b in South Africa (b later is positive). Null if either is not a date. */
export function saDaysBetween(
  a: Date | string | number,
  b: Date | string | number = new Date(),
): number | null {
  const x = saDateISO(a);
  const y = saDateISO(b);
  if (!x || !y) return null;
  const utc = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((utc(y) - utc(x)) / 86_400_000);
}

/** YYYY-MM shifted by n months (n may be negative). */
export function addMonthsYM(ym: string, n: number): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7)) - 1 + n;
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
