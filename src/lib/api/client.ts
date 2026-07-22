import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

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

const baseURL = normalizeBase(RAW_BASE ?? 'https://web-production-143e2.up.railway.app');

export const api = axios.create({
  baseURL,
  timeout: 30000,
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

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    const reqUrl = error.config?.url ?? '';
    // A 401 on the auth endpoints means "bad credentials"/"already gone", not an
    // expired mid-session token — do not force a global sign-out for those.
    const isAuthEndpoint =
      reqUrl.includes('auth/login') ||
      reqUrl.includes('auth/register') ||
      reqUrl.includes('auth/logout');

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
      const first = obj.error ?? obj.detail ?? obj[Object.keys(obj)[0] ?? ''];
      serverMsg = Array.isArray(first) ? String(first[0]) : (first as string | undefined);
    }

    const err = new Error(
      serverMsg ||
        (error.response
          ? `Request failed (${error.response.status})`
          : 'Network error — check your connection'),
    );
    (err as Error & { status?: number }).status = error.response?.status;
    throw err;
  },
);

// ---- Thin helpers (mirror the web API surface) ----

export const fetchData = async <T = unknown>(url: string): Promise<T> => {
  if (!url) throw new Error('No URL provided');
  const res = await api.get<T>(url);
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
