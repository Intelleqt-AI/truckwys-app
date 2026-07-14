import { useQuery } from '@tanstack/react-query';
import { fetchData, postData, patchData } from '@/lib/api/client';
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

export const markNotificationRead = (id: string | number) =>
  postData({ url: `notifications/${id}/mark-read/`, data: {} }).catch(() =>
    patchData({ url: `notifications/${id}/`, data: { read: true } }),
  );

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

// ── Copilot ───────────────────────────────────────────────────────────────
export const copilotChat = (message: string, conversationId?: string) =>
  postData<Record<string, unknown>>({
    url: conversationId ? `agent/conversations/${conversationId}/chat/` : 'agent/chat/',
    data: { message },
  });
