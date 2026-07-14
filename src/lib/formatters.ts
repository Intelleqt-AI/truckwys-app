// UK-English / South-African formatting — ported verbatim from the web app's
// src/lib/formatters.ts. Money is ZAR (en-ZA), never abbreviated. Dates/numbers
// use en-GB. Relies on Hermes Intl (enabled in Expo SDK 57).

export const formatCurrency = (
  amount: number | null | undefined,
  options: Intl.NumberFormatOptions = {},
): string => {
  if (amount == null || isNaN(Number(amount))) return 'R0.00';
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    ...options,
  }).format(Number(amount));
};

export const formatNumber = (
  value: number | null | undefined,
  options: Intl.NumberFormatOptions = {},
): string => {
  if (value == null || isNaN(Number(value))) return '0';
  return new Intl.NumberFormat('en-GB', options).format(Number(value));
};

export const formatPercentage = (value: number | null | undefined, decimals = 1): string => {
  if (value == null || isNaN(Number(value))) return '0.0%';
  return new Intl.NumberFormat('en-GB', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(value));
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
  if (value >= 1_000_000) return `${formatNumber(value / 1_000_000, { maximumFractionDigits: 1 })}M`;
  if (value >= 1000) return `${formatNumber(value / 1000, { maximumFractionDigits: 1 })}K`;
  return formatNumber(value);
};

// Compact ZAR for KPI tiles: R 507k, R 1.1M — never long. Full amounts still use
// formatCurrency in detail views.
export const formatCurrencyCompact = (amount: number | null | undefined): string => {
  const n = Number(amount);
  if (amount == null || isNaN(n)) return 'R0';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}R ${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1000) return `${sign}R ${Math.round(abs / 1000)}k`;
  return `${sign}R ${Math.round(abs)}`;
};

export const formatPercent = (value: number | null | undefined, decimals = 1): string => {
  if (value == null || isNaN(Number(value))) return '0.0%';
  return `${Number(value).toFixed(decimals)}%`;
};
