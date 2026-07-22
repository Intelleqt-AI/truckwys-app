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
      const [eligible, advances] = await Promise.all([
        fetchData('capital/eligible/').catch(() => []),
        fetchData('advances/').catch(() => []),
      ]);
      return {
        eligible: asArray(eligible).map((e) => {
          const r = e as Record<string, unknown>;
          return {
            id: str(pick(r, ['id', 'invoice_id']), ''),
            customer: str(pick(r, ['customer_name', 'customer']), 'Customer'),
            amount: num(pick(r, ['amount', 'invoice_total', 'total'])),
            advance: num(pick(r, ['advance_amount', 'eligible_amount'])),
          };
        }),
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

export const requestAdvance = (invoiceId: string | number) =>
  postData({ url: 'advances/', data: { invoice: invoiceId } });

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
export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () =>
      asArray(await fetchData('notifications/')).map((n, i) => {
        const r = n as Record<string, unknown>;
        return {
          id: str(pick(r, ['id']), String(i)),
          title: str(pick(r, ['title']), 'Notification'),
          body: str(pick(r, ['body', 'message']), ''),
          read: Boolean(pick(r, ['read', 'is_read'])),
          time: str(pick(r, ['created_at', 'timestamp'])),
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

export const setTwoFactor = (enabled: boolean) =>
  patchData({ url: 'auth/me/', data: { two_factor_enabled: enabled } });

// Apple 5.1.1(v): in-app account deletion entry point.
export const deleteAccount = () => deleteData({ url: 'auth/me/' });

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

// ── Copilot ───────────────────────────────────────────────────────────────
export function useProposals() {
  return useQuery({
    queryKey: ['agent-proposals'],
    queryFn: async () =>
      asArray(await fetchData('agent/proposals/')).map((p) => {
        const o = p as Record<string, unknown>;
        return {
          id: str(pick(o, ['id']), ''),
          title: str(pick(o, ['title', 'summary']), 'Proposal'),
          body: str(pick(o, ['body', 'description', 'detail']), ''),
        };
      }),
    retry: false,
  });
}

export const executeProposal = (id: string | number) =>
  postData({ url: `agent/proposals/${id}/execute/`, data: {} });

export const dismissProposal = (id: string | number) =>
  postData({ url: `agent/proposals/${id}/dismiss/`, data: {} });

export const copilotChat = (message: string, conversationId?: string) =>
  postData<Record<string, unknown>>({
    url: conversationId ? `agent/conversations/${conversationId}/chat/` : 'agent/chat/',
    data: { message },
  });
