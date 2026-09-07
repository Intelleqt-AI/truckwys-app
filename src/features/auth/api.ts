import { fetchData, postData } from '@/lib/api/client';
import type { AuthUser, LoginResponse } from '@/types/auth';

// Auth endpoints — paths are relative to EXPO_PUBLIC_API_URL (which ends /api/v1/).
// Two-step login: /auth/login/ returns {token,user} OR {otp_required,...}.

// Shared public demo account (core/services/demo_seed.py on the backend).
// Not a secret — the web app ships these same literals in its login bundle.
// Logs in exactly like a normal user; `is_demo`/`demo_quote_used` on the
// response are what tell the app to gate writes (see src/hooks/useDemo.ts).
export const DEMO_CREDENTIALS = {
  username: 'demo@truckwys.com',
  password: 'TruckDemo2026!',
} as const;

export const authApi = {
  login: (username: string, password: string) =>
    postData<LoginResponse>({ url: 'auth/login/', data: { username, password } }),

  verifyOtp: (pending_token: string, code: string) =>
    postData<{ token: string; user: AuthUser }>({
      url: 'auth/login/verify-otp/',
      data: { pending_token, code },
    }),

  resendOtp: (pending_token: string) =>
    postData({ url: 'auth/login/resend-otp/', data: { pending_token } }),

  me: () => fetchData<AuthUser>('auth/me/'),

  logout: () => postData({ url: 'auth/logout/' }),

  passwordReset: (email: string) =>
    postData({ url: 'auth/password-reset/', data: { email } }),

  passwordResetConfirm: (email: string, code: string, new_password: string) =>
    postData({ url: 'auth/password-reset/confirm/', data: { email, code, new_password } }),

  // Web -> app handoff: the web app (already signed in, e.g. right after a
  // register or a login) mints a single-use, short-TTL code and hands it to
  // the app via a truckwys://auth/callback?code=... link. This exchanges that
  // code for a normal session — see useAuthHandoff.
  exchangeHandoff: (code: string) =>
    postData<{ token: string; user: AuthUser }>({
      url: 'auth/handoff/exchange/',
      data: { code },
    }),
};
