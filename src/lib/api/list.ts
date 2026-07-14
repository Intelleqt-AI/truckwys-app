// DRF list endpoints return either a bare array or a paginated {results:[...]}.
// Normalize to an array. Also a safe number/string reader for loosely-typed data.
export function asArray<T = Record<string, unknown>>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object' && Array.isArray((data as { results?: unknown }).results)) {
    return (data as { results: T[] }).results;
  }
  return [];
}

export const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return typeof n === 'number' && !isNaN(n) ? n : fallback;
};

export const str = (v: unknown, fallback = ''): string =>
  v == null ? fallback : String(v);

// First defined value among candidate keys (handles field-name drift).
export function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (obj[k] != null && obj[k] !== '') return obj[k];
  return undefined;
}
