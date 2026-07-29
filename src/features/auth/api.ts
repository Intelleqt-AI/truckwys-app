import { fetchData, postData } from '@/lib/api/client';
import type { AuthUser, LoginResponse } from '@/types/auth';

// Auth endpoints — paths are relative to EXPO_PUBLIC_API_URL (which ends /api/v1/).
// Two-step login: /auth/login/ returns {token,user} OR {otp_required,...}.

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
};
