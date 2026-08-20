import { useAuthStore } from '@/stores/authStore';
import {
  isSubscriptionBlocked,
  subscriptionBlockedNotice,
  subscriptionStatusDetail,
  subscriptionStatusLabel,
  subscriptionStatusTone,
} from '@/lib/subscriptionStatus';

/**
 * The company's subscription state, for gating quote and invoice actions.
 *
 * Read from the cached auth user rather than the billing endpoint: auth/me/
 * carries `subscription_status` as a computed field, the store already holds
 * it app-wide, and `billing/status/` is admin-only — an operator or dispatcher
 * gets a 403 there, which would leave the gate permanently open for exactly the
 * users it needs to apply to.
 *
 * refreshUser() re-reads it, so a recharge or suspension lands on the next
 * app-state resume or on a `subscription.*` live event.
 */
export function useSubscription() {
  const status = useAuthStore((s) => {
    const raw = s.user?.subscription_status;
    return typeof raw === 'string' ? raw : undefined;
  });

  const blocked = isSubscriptionBlocked(status);
  return {
    status,
    blocked,
    label: subscriptionStatusLabel(status),
    tone: subscriptionStatusTone(status),
    detail: subscriptionStatusDetail(status),
    /** Null unless something is actually blocked, so callers can render inline. */
    notice: blocked ? subscriptionBlockedNotice(status) : null,
  };
}
