// Shape returned by the Django /auth/me/ and login endpoints. The backend types
// most fields loosely, so we keep a permissive index signature.
export interface AuthUser {
  id: number;
  email: string;
  name?: string;
  username?: string;
  role: string;
  status?: string;
  phone?: string;
  avatar?: string | null;
  company?: number | { id: number; name?: string } | null;
  [key: string]: unknown;
}

export interface LoginSuccess {
  token: string;
  user: AuthUser;
}

export interface LoginOtpRequired {
  otp_required: true;
  pending_token: string;
  email: string;
}

export type LoginResponse = LoginSuccess | LoginOtpRequired;

export const isOtpRequired = (r: LoginResponse): r is LoginOtpRequired =>
  (r as LoginOtpRequired).otp_required === true;
