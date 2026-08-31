import { useQuery } from '@tanstack/react-query';
import { fetchData, postData, patchData, deleteData } from '@/lib/api/client';
import { asArray, num, str, pick } from '@/lib/api/list';

// ── Insights / signals ──────────────────────────────────────────────────────
export interface Signal {
  id: string;
  category: string;
  title: string;
  body: string;
  severity: 'low' | 'medium' | 'high';
}

export function useInsights() {
  return useQuery<Signal[]>({
    queryKey: ['insights'],
    queryFn: async () => {
      const raw = await fetchData('dashboard/signals/').catch(() => fetchData('dashboard/insights/').catch(() => []));
      const list = Array.isArray(raw) ? raw : ((raw as { signals?: unknown[] })?.signals ?? []);
      return asArray(list).map((s, i) => {
        const r = s as Record<string, unknown>;
        return {
          id: str(pick(r, ['id']), String(i)),
          category: str(pick(r, ['category', 'type']), 'Update'),
          title: str(pick(r, ['title']), ''),
          body: str(pick(r, ['body', 'message', 'description']), ''),
          severity: (str(pick(r, ['severity']), 'low') as Signal['severity']) ?? 'low',
        };
      });
    },
  });
}

// ── Capital / advances ──────────────────────────────────────────────────────
export function useCapital() {
  return useQuery({
    queryKey: ['capital'],
    queryFn: async () => {
      const [eligibleRes, advances, facilities] = await Promise.all([
        fetchData('capital/eligible/').catch(() => null),
        fetchData('advances/').catch(() => []),
        // The facility drives the Available / In Use tiles the web app shows;
        // mobile never fetched it, which is why it only had two numbers.
        fetchData('facilities/').catch(() => []),
      ]);
      // capital/eligible/ returns an OBJECT ({invoices, ineligible_invoices,
      // counts, totals}), not a list. Passing it through asArray() — which only
      // unwraps arrays or {results} — silently produced [], so the screen said
      // "Nothing eligible" 100% of the time regardless of the real data.
      const payload = (eligibleRes ?? {}) as Record<string, unknown>;
      const facility = (asArray(facilities)[0] ?? null) as Record<string, unknown> | null;

      return {
        eligible: asArray(payload.invoices).map((e) => {
          const r = e as Record<string, unknown>;
          return {
            id: str(pick(r, ['id', 'invoice_id']), ''),
            invoiceNumber: str(pick(r, ['invoice_number']), ''),
            customer: str(pick(r, ['customer', 'customer_name']), 'Customer'),
            amount: num(pick(r, ['total_amount', 'amount', 'amount_zar'])),
            // The real keys. 'advance_amount'/'eligible_amount' matched nothing
            // on this endpoint, so every row used to read "Advance R0".
            advance: num(pick(r, ['net_payout_zar', 'fundable_amount_zar'])),
            tier: str(pick(r, ['risk_tier', 'tier']), ''),
            riskPct: pick(r, ['customer_risk_pct']) as number | null | undefined,
            riskBlocked: Boolean(pick(r, ['risk_blocked'])),
          };
        }),
        ineligible: asArray(payload.ineligible_invoices).map((e) => {
          const r = e as Record<string, unknown>;
          return {
            id: str(pick(r, ['id']), ''),
            invoiceNumber: str(pick(r, ['invoice_number']), ''),
            customer: str(pick(r, ['customer']), 'Customer'),
            amount: num(pick(r, ['amount'])),
            reason: str(pick(r, ['reason']), 'Not eligible'),
          };
        }),
        // Server-side aggregates — no need to re-sum on the device.
        eligibleCount: num(pick(payload, ['eligible_count'])),
        eligibleValue: num(pick(payload, ['total_face_value_zar'])),
        facility: facility && {
          limit: num(pick(facility, ['limit'])),
          outstanding: num(pick(facility, ['outstanding'])),
          available: num(pick(facility, ['available'])),
          utilization: num(pick(facility, ['utilization_percent'])),
        },
        advances: asArray(advances).map((a) => {
          const r = a as Record<string, unknown>;
          return {
            id: str(pick(r, ['id']), ''),
            amount: num(pick(r, ['amount', 'advance_amount'])),
            status: str(pick(r, ['status']), 'PENDING').toUpperCase(),
          };
        }),
      };
    },
  });
}

// The create serializer requires `invoice_id`; posting `invoice` returned
// 400 "invoice_id: This field is required." for every request.
export const requestAdvance = (invoiceId: string | number) =>
  postData({ url: 'advances/', data: { invoice_id: Number(invoiceId) } });

export function useAdvance(id: string | number) {
  return useQuery<Record<string, unknown>>({
    queryKey: ['advance', id],
    queryFn: () => fetchData(`advances/${id}/`),
    retry: false,
  });
}

export function useRiskScores() {
  return useQuery({
    queryKey: ['risk-scores'],
    queryFn: async () =>
      asArray(await fetchData('risk/score/')).map((r) => {
        const o = r as Record<string, unknown>;
        return {
          id: str(pick(o, ['id']), ''),
          customer: str(pick(o, ['customer_name', 'customer', 'entity']), '—'),
          tier: str(pick(o, ['tier', 'band', 'grade']), '—').toUpperCase(),
          score: num(pick(o, ['score', 'risk_score'])),
          fee: num(pick(o, ['fast_pay_fee', 'fee_pct', 'fee'])),
        };
      }),
    retry: false,
  });
}

// ── Activity ────────────────────────────────────────────────────────────────
export function useActivity() {
  return useQuery({
    queryKey: ['activity'],
    queryFn: async () =>
      asArray(await fetchData('activity/')).map((a, i) => {
        const r = a as Record<string, unknown>;
        return {
          id: str(pick(r, ['id']), String(i)),
          title: str(pick(r, ['title', 'action', 'event']), 'Activity'),
          detail: str(pick(r, ['description', 'detail', 'message']), ''),
          time: str(pick(r, ['created_at', 'timestamp', 'time'])),
        };
      }),
  });
}

// ── Notifications ────────────────────────────────────────────────────────────
export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  read: boolean;
  time: string;
  /** info | success | warning | alert — drives the row's dot colour. */
  type: string;
  /** Web path (e.g. "/bookings/12"); resolved by lib/notificationLink. */
  link: string;
}

export function useNotifications() {
  return useQuery<NotificationItem[]>({
    queryKey: ['notifications'],
    // NotificationSerializer sends `description` (not body/message) and
    // `unread` (the INVERSE of read). Reading the wrong names left every row
    // body-less and permanently unread. DRF paginates at 20 and nothing here
    // asks for page 2, so raise the window explicitly.
    queryFn: async () =>
      asArray(await fetchData('notifications/?limit=50')).map((n, i) => {
        const r = n as Record<string, unknown>;
        const unread = pick(r, ['unread']);
        return {
          id: str(pick(r, ['id']), String(i)),
          title: str(pick(r, ['title']), 'Notification'),
          body: str(pick(r, ['description', 'body', 'message']), ''),
          // Prefer the field the API actually sends; fall back to the legacy
          // shape so an older backend still renders correctly.
          read: unread != null ? !unread : Boolean(pick(r, ['read', 'is_read'])),
          time: str(pick(r, ['created_at', 'timestamp'])),
          type: str(pick(r, ['type']), 'info').toLowerCase(),
          link: str(pick(r, ['link'])),
        };
      }),
  });
}

// Correct: DRF @action mark_read (underscore) on the detail route.
export const markNotificationRead = (id: string | number) =>
  patchData({ url: `notifications/${id}/mark_read/`, data: {} });

export const markAllNotificationsRead = () =>
  postData({ url: 'notifications/mark_all_read/', data: {} });

export function useUnreadCount() {
  return useQuery<number>({
    queryKey: ['notifications-unread'],
    queryFn: async () => {
      const r = (await fetchData('notifications/unread_count/')) as Record<string, unknown>;
      return Number((r?.count ?? r?.unread ?? 0) as number) || 0;
    },
    retry: false,
    refetchInterval: 60_000,
  });
}

// ── Notification preferences ─────────────────────────────────────────────────
// Canonical schema — mirrors backend core/services/notification_prefs.py and the
// web NotificationSettings page.
export type NotificationChannel = 'email' | 'push' | 'sms';
export type NotificationPrefs = Record<NotificationChannel, Record<string, boolean>>;

// `product_news` is off by default and stays off until the user turns it on —
// App Store Review 4.5.4 forbids using push for marketing or promotion without
// an express opt-in.
export const NOTIFICATION_DEFAULTS: NotificationPrefs = {
  email: { quotes: true, invoices: true, payments: true, fleet_alerts: true, weekly_reports: false },
  push: {
    new_bookings: true,
    payment_received: true,
    maintenance_due: true,
    driver_updates: false,
    product_news: false,
  },
  sms: { critical_alerts: false, payment_confirmations: false },
};

// Merge per channel so a key the server omits still renders its default rather
// than an undefined toggle.
const mergePrefs = (raw: unknown): NotificationPrefs => {
  const src = (raw ?? {}) as Partial<Record<NotificationChannel, Record<string, unknown>>>;
  const out = {} as NotificationPrefs;
  for (const channel of Object.keys(NOTIFICATION_DEFAULTS) as NotificationChannel[]) {
    const defaults = NOTIFICATION_DEFAULTS[channel];
    const incoming = src[channel] ?? {};
    out[channel] = Object.fromEntries(
      Object.keys(defaults).map((k) => [k, Boolean(incoming[k] ?? defaults[k])]),
    );
  }
  return out;
};

export function useNotificationPrefs() {
  return useQuery<NotificationPrefs>({
    queryKey: ['notification-settings'],
    queryFn: async () => mergePrefs(await fetchData('notifications/settings/')),
    retry: false,
  });
}

export const updateNotificationPrefs = (prefs: NotificationPrefs) =>
  patchData({ url: 'notifications/settings/', data: prefs });

// ── Billing (read-only on mobile) ────────────────────────────────────────────
/** One card charge — either the monthly plan or a per-delivery platform fee. */
export interface BillingCharge {
  id: string;
  kind: 'subscription' | 'delivery_fee';
  label: string;
  amount: number;
  status: string;
  reference: string;
  createdAt: string;
}

export function useBillingHistory() {
  return useQuery<BillingCharge[]>({
    queryKey: ['billing-history'],
    queryFn: async () => {
      const res = (await fetchData('billing/history/')) as Record<string, unknown>;
      return asArray(pick(res, ['results']) ?? res).map((r) => {
        const c = r as Record<string, unknown>;
        return {
          id: String(c.id ?? ''),
          kind: (str(pick(c, ['kind'])) as BillingCharge['kind']) || 'subscription',
          label: str(pick(c, ['label']), 'Charge'),
          amount: num(pick(c, ['amount'])),
          status: str(pick(c, ['status']), 'pending').toLowerCase(),
          reference: str(pick(c, ['reference'])),
          createdAt: str(pick(c, ['created_at'])),
        };
      });
    },
  });
}

export function useBillingStatus(options?: { enabled?: boolean }) {
  return useQuery<Record<string, unknown>>({
    queryKey: ['billing-status'],
    queryFn: () => fetchData('billing/status/'),
    retry: false,
    enabled: options?.enabled ?? true,
  });
}

// ── Personal profile (auth/me) ───────────────────────────────────────────────
export function useMe() {
  return useQuery<Record<string, unknown>>({
    queryKey: ['me'],
    queryFn: () => fetchData('auth/me/'),
    retry: false,
  });
}

export const updateProfile = (data: Record<string, unknown>) =>
  patchData<Record<string, unknown>>({ url: 'auth/me/', data });

// Avatar upload = PATCH auth/me/ multipart, field `avatar` (web parity).
export const uploadAvatar = (file: { uri: string; name: string; type: string }) => {
  const form = new FormData();
  form.append('avatar', file as unknown as Blob);
  return patchData<Record<string, unknown>>({
    url: 'auth/me/',
    data: form,
    config: { headers: { 'Content-Type': 'multipart/form-data' } },
  });
};

// ── Vehicle types (settings CRUD) ────────────────────────────────────────────
export const createVehicleType = (data: Record<string, unknown>) =>
  postData<Record<string, unknown>>({ url: 'vehicle-types/', data });

export const updateVehicleType = (id: string | number, data: Record<string, unknown>) =>
  patchData<Record<string, unknown>>({ url: `vehicle-types/${id}/`, data });

export const deleteVehicleType = (id: string | number) =>
  deleteData({ url: `vehicle-types/${id}/` });

// ── Company profile (settings) ───────────────────────────────────────────────
export function useCompanyProfile() {
  return useQuery<Record<string, unknown>>({
    queryKey: ['company-profile'],
    queryFn: () => fetchData('company/profile/'),
    retry: false,
  });
}

export const updateCompanyProfile = (data: Record<string, unknown>) =>
  patchData({ url: 'company/profile/', data });

/**
 * Live national fuel prices, for the "fetch live prices" action on the company
 * page. `force` bypasses the server's once-per-hour live-retry gate.
 *
 * Returns `inland_price` (diesel) and `petrol_95`, plus `is_stale`,
 * `stale_warning` and `last_updated`. There is no electric or hybrid feed.
 * Note it 500s on failure rather than returning `success: false`, so callers
 * need a catch as well as the flag check.
 */
export const fetchFuelPrices = (force = false) =>
  fetchData<Record<string, unknown>>(`fuel-prices/current/${force ? '?force=true' : ''}`);

export const changePassword = (current_password: string, new_password: string) =>
  postData({ url: 'auth/change-password/', data: { current_password, new_password } });

export const updateCompanyLogo = (file: { uri: string; name: string; type: string }) => {
  const form = new FormData();
  form.append('logo', file as unknown as Blob);
  return postData({
    url: 'company/logo/',
    data: form,
    config: { headers: { 'Content-Type': 'multipart/form-data' } },
  });
};

// ── Security: sessions + 2FA ─────────────────────────────────────────────────
export function useSessions() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: async () =>
      asArray(await fetchData('auth/sessions/')).map((s) => {
        const o = s as Record<string, unknown>;
        return {
          id: str(pick(o, ['id']), ''),
          device: str(pick(o, ['device', 'user_agent', 'name']), 'Device'),
          current: Boolean(pick(o, ['current', 'is_current'])),
          lastSeen: str(pick(o, ['last_seen', 'last_active', 'created_at'])),
        };
      }),
    retry: false,
  });
}

export const revokeSession = (id: string | number) => deleteData({ url: `auth/sessions/${id}/` });

// Security preferences live in User.security_settings behind their own
// endpoint. This used to PATCH auth/me/ with `two_factor_enabled`, which is
// not a field on the User serializer — DRF drops unknown keys silently, so the
// toggle reported success and saved nothing.
export interface SecuritySettings {
  two_factor: boolean;
  session_timeout: boolean;
  login_alerts: boolean;
}

export function useSecuritySettings() {
  return useQuery<SecuritySettings>({
    queryKey: ['security-settings'],
    queryFn: () => fetchData<SecuritySettings>('auth/security-settings/'),
  });
}

export const updateSecuritySettings = (patch: Partial<SecuritySettings>) =>
  patchData<SecuritySettings>({ url: 'auth/security-settings/', data: patch });

/** Last 10 sign-in/sign-out/revoke events for this account. */
export interface LoginActivityItem {
  id: string;
  action: string;
  event: string;
  device: string;
  ip: string;
  time: string;
}

export function useLoginActivity() {
  return useQuery<LoginActivityItem[]>({
    queryKey: ['login-activity'],
    queryFn: async () =>
      asArray(await fetchData('auth/sessions/activity/')).map((r) => {
        const a = r as Record<string, unknown>;
        return {
          id: String(a.id ?? ''),
          action: str(pick(a, ['action'])),
          event: str(pick(a, ['event'])),
          device: str(pick(a, ['device']), 'Unknown device'),
          ip: str(pick(a, ['ip'])),
          time: str(pick(a, ['time'])),
        };
      }),
  });
}

/** Revoke every other device, or every device including this one. */
export const revokeSessions = (scope: 'others' | 'all') =>
  deleteData<{ revoked: number }>({ url: `auth/sessions/?scope=${scope}` });

// Apple 5.1.1(v): in-app account deletion. The endpoint is auth/delete-account/
// — auth/me/ implements only GET and PATCH and returns 405, which used to leave
// the UI silently falling back to "email support".
// The current password is required: deletion revokes every session and cannot
// be undone from the app, so it must not be reachable from an unlocked handset
// alone.
export const deleteAccount = (password: string) =>
  deleteData({ url: 'auth/delete-account/', data: { password } });

// ── Users & permissions ──────────────────────────────────────────────────────
export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () =>
      asArray(await fetchData('users/')).map((u) => {
        const o = u as Record<string, unknown>;
        return {
          id: str(pick(o, ['id']), ''),
          name: str(pick(o, ['name', 'email']), 'User'),
          email: str(pick(o, ['email'])),
          role: str(pick(o, ['role']), '—'),
        };
      }),
    retry: false,
  });
}

export const inviteUser = (email: string, role: string) =>
  postData({ url: 'auth/invite/', data: { email, role } });

export const updateUserRole = (id: string | number, role: string) =>
  patchData({ url: `users/${id}/`, data: { role } });

export const removeUser = (id: string | number) => deleteData({ url: `users/${id}/` });

// Copilot lives in src/features/copilot/api.ts — it needs the conversation
// endpoints, a longer timeout and the full reply envelope, none of which
// belonged in this grab-bag module.
