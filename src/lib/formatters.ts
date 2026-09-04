// South-African formatting. Money is ZAR, never abbreviated outside KPI tiles.
//
// ONE locale for every number: en-ZA. That means a comma decimal mark and a
// non-breaking space for thousands — `R 1 234,56`, `50 000`, `60,6%`. This file
// used to format money as en-ZA and everything else as en-GB, which put
// `R 1 234,56` and `123,456 km` on the same screen with the comma meaning two
// different things. Dates stay en-GB because `d MMM yyyy` is right for SA; only
// the numeric locale was wrong.
//
// Relies on Hermes Intl, enabled in this project's RN 0.81 build (Expo SDK 54).
// Hermes' ICU is partial, though: `notation: 'compact'` is unreliable, which is
// why formatCurrencyCompact below is hand-rolled.

export const formatCurrency = (
  amount: number | null | undefined,
  options: Intl.NumberFormatOptions = {},
): string => {
  const n = Number(amount);
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    ...options,
  }).format(amount == null || isNaN(n) ? 0 : n);
};

export const formatNumber = (
  value: number | null | undefined,
  options: Intl.NumberFormatOptions = {},
): string => {
  if (value == null || isNaN(Number(value))) return '0';
  return new Intl.NumberFormat('en-ZA', options).format(Number(value));
};

/** Takes a fraction (0..1). For a 0..100 value use formatPercent instead. */
export const formatPercentage = (value: number | null | undefined, decimals = 1): string => {
  if (value == null || isNaN(Number(value))) return formatPercent(0, decimals);
  return new Intl.NumberFormat('en-ZA', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(value));
};

/**
 * A number as bare editable text: comma decimal, no grouping — `23,4`, `1500`.
 *
 * Deliberately not Intl with `useGrouping: false`. This is what goes into a text
 * field the moment it gains focus, so it's the one conversion that must not
 * depend on how complete Hermes' ICU happens to be; a stray grouping space would
 * land in the middle of what someone is typing.
 */
export const formatPlain = (value: number, decimals?: number): string =>
  (decimals == null ? String(value) : value.toFixed(decimals)).replace('.', ',');

/**
 * Read a number a human typed.
 *
 * Returns `null` — not NaN, not 0 — when the input isn't a number, so callers
 * have to decide what to do about it. That's the point: `Number("23,40")` is
 * NaN and `parseFloat("23,40")` is 23, and both of those silently became a
 * wrong price. A null forces a validation error instead.
 *
 * Accepts what the app itself renders (`R 1 234,56`) as well as what a South
 * African keyboard produces (`23,40`) and a dot-decimal habit (`23.40`).
 */
export const parseNum = (input: string | number | null | undefined): number | null => {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  if (input == null) return null;

  // Drop every space-like grouping char Intl may have emitted, plus the rand
  // symbol / currency code if the value was round-tripped from a display string.
  let s = input.replace(/\s/g, '').replace(/ZAR|R/gi, '');
  if (!s) return null;

  const negative = s.startsWith('-');
  if (negative || s.startsWith('+')) s = s.slice(1);

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    // Both marks present, so the rightmost is the decimal one and the other is
    // grouping — handles `1.234,56` and `1,234.56` without guessing a locale.
    const groupChar = lastComma > lastDot ? '.' : ',';
    s = s.split(groupChar).join('').replace(',', '.');
  } else if (lastComma !== -1) {
    // A single comma is a decimal mark (en-ZA). Several can only be grouping.
    s = s.split(',').length - 1 > 1 ? s.split(',').join('') : s.replace(',', '.');
  } else if (s.split('.').length - 1 > 1) {
    s = s.split('.').join('');
  }

  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
};

export const formatDistance = (kilometres: number): string => `${formatNumber(kilometres)} km`;

export const formatDuration = (hours: number): string => {
  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);
  if (wholeHours === 0) return `${minutes}m`;
  if (minutes === 0) return `${wholeHours}h`;
  return `${wholeHours}h ${minutes}m`;
};

export const formatDate = (
  date: string | Date,
  options: Intl.DateTimeFormatOptions = {},
): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(dateObj.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...options,
  }).format(dateObj);
};

export const formatDateTime = (date: string | Date): string =>
  formatDate(date, { hour: '2-digit', minute: '2-digit', hour12: false });

// Truckwys operates in South Africa — currency is always ZAR regardless of
// device region, and web's live clock (Overview.tsx's formatDate/formatTime)
// always computes with an explicit Africa/Johannesburg timezone regardless of
// what timezone the browser itself is in. These match that exactly, for the
// same reason: "what time is it for the business" must never depend on which
// timezone the viewing device happens to be set to (a phone in Bangladesh
// showing its own local time here would just be showing the wrong time).
const SAST = 'Africa/Johannesburg';

export const formatOperationalDate = (date: Date): string =>
  date.toLocaleDateString('en-ZA', {
    timeZone: SAST,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

// Seconds + a trailing "SAST" label, matching web's clock exactly. The
// "SAST" is hardcoded rather than derived — this app is always South Africa
// time, same reasoning as currency always being ZAR regardless of device
// region, so it isn't worth threading through as a parameter.
export const formatOperationalTime = (date: Date): string =>
  `${date.toLocaleTimeString('en-ZA', {
    timeZone: SAST,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })} SAST`;

export const formatRelativeTime = (date: string | Date): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(dateObj.getTime())) return '—';
  const diff = Math.floor((Date.now() - dateObj.getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(dateObj);
};

export const formatConfidence = (confidence: number): string => `${Math.round(confidence * 100)}%`;

export const getConfidenceLevel = (confidence: number): 'high' | 'medium' | 'low' => {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.6) return 'medium';
  return 'low';
};

export const formatCompactNumber = (value: number): string => {
  if (value >= 1_000_000)
    return `${formatNumber(value / 1_000_000, { maximumFractionDigits: 1 })}M`;
  if (value >= 1000) return `${formatNumber(value / 1000, { maximumFractionDigits: 1 })}K`;
  return formatNumber(value);
};

// Compact ZAR for KPI tiles: R 507k, R 1,1M — never long. Full amounts still use
// formatCurrency in detail views.
//
// Hand-rolled rather than Intl `notation: 'compact'`, which Hermes' partial ICU
// does not implement reliably. formatNumber does the fraction digit so the
// decimal mark is a comma like everywhere else — toFixed() always emits a dot.
export const formatCurrencyCompact = (amount: number | null | undefined): string => {
  const n = Number(amount);
  if (amount == null || isNaN(n)) return 'R 0';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const m = formatNumber(abs / 1_000_000, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return `${sign}R ${m}M`;
  }
  if (abs >= 1000) return `${sign}R ${formatNumber(Math.round(abs / 1000))}k`;
  return `${sign}R ${formatNumber(Math.round(abs))}`;
};

/** Takes a 0..100 value. For a 0..1 fraction use formatPercentage instead. */
export const formatPercent = (value: number | null | undefined, decimals = 1): string => {
  const n = Number(value);
  return `${formatNumber(value == null || isNaN(n) ? 0 : n, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
};
