import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { sendBlockMessage } from '@/features/bookings/quote/sendBlock';

// Centralized API client — RN port of the web app's src/lib/Api.ts.
// Auth is DRF per-device Token auth: header is `Authorization: Token <key>`
// (NOT Bearer). There is no refresh token; a 401 mid-session clears auth and
// bounces to Login via the registered handler.

const RAW_BASE = process.env.EXPO_PUBLIC_API_URL;

if (!RAW_BASE && !__DEV__) {
  // In production a missing base URL is a build misconfiguration.
  throw new Error('EXPO_PUBLIC_API_URL is not set');
}

// Normalize so the base always ends at the versioned API root (…/api/v1/),
// regardless of whether the env var points at the host root or already includes
// the prefix. All endpoint paths are relative to this (e.g. `auth/login/`).
function normalizeBase(raw: string): string {
  let b = raw.replace(/\/+$/, '');
  if (!/\/api(\/v\d+)?$/.test(b)) b += '/api/v1';
  else if (/\/api$/.test(b)) b += '/v1';
  return b + '/';
}

const baseURL = normalizeBase(RAW_BASE ?? 'https://api.truckwys.com');

// Host origin (baseURL minus the /api/vN/ suffix) — media files (avatars,
// logos) are served from the host root, not under /api/v1. The WebSocket
// endpoint (/ws/events/) is off the same root, so it reuses this.
const mediaOrigin = baseURL.replace(/\/api\/v\d+\/?$/, '');

export const apiOrigin = mediaOrigin.replace(/\/$/, '');

// Resolve a possibly-relative media path (e.g. "/media/avatars/x.jpg") to an
// absolute URL so RN's <Image> can load it. Absolute URLs pass through.
export const mediaUrl = (path?: string | null): string | undefined => {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  return mediaOrigin + (path.startsWith('/') ? path : `/${path}`);
};

export const api = axios.create({
  baseURL,
  timeout: 30000,
});

// Last-resort net under every screen's own rounding: plain JS float
// arithmetic (unit conversions, subtractions, sums — tons*1000,
// suggestedPrice-total, subtotal+vat, …) routinely lands on a value like
// 5678.9100000000035 that carries 15-17 significant digits of pure binary
// rounding noise. The backend's DecimalField columns have no server-side
// rounding, so that noise blows past max_digits and the whole request is
// rejected with "Ensure that there are no more than N digits in total" —
// even though every digit that actually matters is correct.
//
// toPrecision(15) strips exactly that noise and nothing else: the widest
// column on the backend (BillingTransaction/APICallLog) is 14 digits, so 15
// significant digits is more precision than any column could ever validate
// against — this can only remove binary-representation error, never a digit
// a screen's own rounding actually intended. Integers are left untouched
// (they have no fractional noise to strip, and toPrecision on a large
// integer can flip to exponential notation, which JSON.stringify would then
// serialize as a string). Screens should still round to the right number of
// decimal places themselves (see round2/roundTo in lib/formatters) — this
// only catches what they missed.
function stripFloatNoise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripFloatNoise);
  if (typeof value === 'number') {
    return Number.isFinite(value) && !Number.isInteger(value)
      ? Number(value.toPrecision(15))
      : value;
  }
  if (value && typeof value === 'object' && value.constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = stripFloatNoise(v);
    return out;
  }
  return value; // strings, Date, FormData, File/Blob, null, etc. — untouched
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (config.data && typeof config.data === 'object' && config.data.constructor !== FormData) {
    config.data = stripFloatNoise(config.data);
  }
  return config;
});

// Token is held in memory for synchronous injection; hydrated from SecureStore
// at boot and updated on login/logout.
let authToken: string | null = null;
export const setAuthToken = (token: string | null) => {
  authToken = token;
};

// Registered by the navigation/auth layer so the client can trigger a global
// sign-out without importing React or the store (avoids cycles).
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (authToken) config.headers.Authorization = `Token ${authToken}`;
  return config;
});

// "total_amount" -> "Total amount". Only used for DRF's per-field error keys
// above, never shown anywhere else.
function humanizeFieldName(key: string): string {
  const words = key.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    const reqUrl = error.config?.url ?? '';
    // A 401 on the auth endpoints means "bad credentials"/"already gone", not an
    // expired mid-session token — do not force a global sign-out for those.
    const isAuthEndpoint = reqUrl.includes('auth/login') || reqUrl.includes('auth/logout');

    if (error.response?.status === 401 && !isAuthEndpoint) {
      onUnauthorized?.();
    }

    // Surface a human-readable message from DRF error shapes:
    // {error}, {detail}, or per-field {field: [msg]}.
    const data = error.response?.data as unknown;
    let serverMsg: string | undefined;
    if (typeof data === 'string') {
      serverMsg = data.trim().startsWith('<') ? undefined : data;
    } else if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      // The newer endpoints answer {success: false, code, message}: the
      // message is written to be shown as it is.
      const ownMessage =
        obj.success === false && typeof obj.message === 'string' && obj.message.trim() ? obj.message : undefined;
      const key =
        obj.error != null ? 'error' : obj.detail != null ? 'detail' : (Object.keys(obj)[0] ?? '');
      const first = obj[key];
      const msg = Array.isArray(first) ? String(first[0]) : (first as string | undefined);
      // A per-field error (e.g. {total_amount: ["Ensure that there are no
      // more than 10 digits in total."]}) otherwise shows just the message
      // with no field name — the toast can't say which number was wrong.
      // Prefix it, e.g. "Total amount: Ensure that there are no more than
      // 10 digits in total." {error}/{detail}/{non_field_errors} are already
      // meant to stand alone, so those stay unprefixed.
      const isFieldError = key !== 'error' && key !== 'detail' && key !== 'non_field_errors' && key !== '';
      serverMsg = ownMessage ?? (isFieldError && msg ? `${humanizeFieldName(key)}: ${msg}` : msg);
    }

    // A refused send/PDF/status change (§11): the blocking warning's own title.
    const blockMsg = sendBlockMessage(data);
    if (blockMsg) serverMsg = blockMsg;

    const err = new Error(
      serverMsg ||
        (error.response
          ? `Request failed (${error.response.status})`
          : 'Network error — check your connection'),
    );
    (err as Error & { status?: number }).status = error.response?.status;
    // A 429 carries Retry-After (seconds). Callers that rate-limit themselves
    // (the market price check's cooldown) read it instead of guessing.
    const retryAfterHeader = error.response?.headers?.['retry-after'];
    const retryAfter = Number(retryAfterHeader);
    (err as Error & { retryAfter?: number }).retryAfter =
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined;
    // Keep the raw body too — some callers need the machine-readable code, not
    // just the message (e.g. `cross_border_not_allowed` from route/calculate/).
    (err as Error & { data?: unknown }).data = data;
    throw err;
  },
);

// ---- Thin helpers (mirror the web API surface) ----

export const fetchData = async <T = unknown>(url: string, signal?: AbortSignal): Promise<T> => {
  if (!url) throw new Error('No URL provided');
  const res = await api.get<T>(url, signal ? { signal } : undefined);
  return res.data;
};

export const postData = async <T = unknown>({
  url,
  data,
  config = {},
}: {
  url: string;
  data?: unknown;
  config?: object;
}): Promise<T> => {
  if (!url) throw new Error('No URL provided');
  const res = await api.post<T>(url, data, config);
  return res.data;
};

export const patchData = async <T = unknown>({
  url,
  data,
  config = {},
}: {
  url: string;
  data: unknown;
  config?: object;
}): Promise<T> => {
  const res = await api.patch<T>(url, data, config);
  return res.data;
};

export const putData = async <T = unknown>({
  url,
  data,
}: {
  url: string;
  data: unknown;
}): Promise<T> => {
  const res = await api.put<T>(url, data);
  return res.data;
};

export const deleteData = async <T = unknown>({
  url,
  data,
}: {
  url: string;
  data?: unknown;
}): Promise<T> => {
  const res = await api.delete<T>(url, data ? { data } : undefined);
  return res.data;
};
