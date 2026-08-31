import { useAuthStore } from '@/stores/authStore';
import { useRole } from '@/lib/access';
import { useBillingStatus } from '@/features/more/api';
import { pick, num, str } from '@/lib/api/list';
import {
  BILLING_AWARE_ROLES,
  isSubscriptionBlocked,
  subscriptionAudience,
  subscriptionBlockedNotice,
  subscriptionStatusDetail,
  subscriptionStatusLabel,
  subscriptionStatusTone,
} from '@/lib/subscriptionStatus';

/**
 * The company's subscription state, for gating quote and invoice actions and
 * for the header pill / Home banner.
 *
 * Read from the cached auth user rather than the billing endpoint: auth/me/
 * carries `subscription_status` (and `cancel_at_period_end`) as computed
 * fields, and the store already holds them app-wide with no extra request —
 * they're correct even before the first network call, straight off persisted
 * storage. `billing/status/` is `IsAuthenticated`-only, no role check, so it
 * isn't blocked for any role, but reading it here would still mean an extra
 * round trip this hook doesn't need for the status/blocked/notice fields.
 *
 * refreshUser() re-reads it, so a recharge or suspension lands on the next
 * app-state resume or on a `subscription.*` live event.
 */
export function useSubscription() {
  const status = useAuthStore((s) => {
    const raw = s.user?.subscription_status;
    return typeof raw === 'string' ? raw : undefined;
  });
  const cancelling = useAuthStore((s) => Boolean(s.user?.cancel_at_period_end));
  const role = useRole();

  const blocked = isSubscriptionBlocked(status);
  const audience = subscriptionAudience(status, cancelling);
  const visible =
    audience === 'all' ||
    (audience === 'billing' && (BILLING_AWARE_ROLES as readonly string[]).includes(role));

  return {
    status,
    blocked,
    cancelling,
    audience,
    /** Whether this role should be shown the state outside the Billing screen. */
    visible,
    label: subscriptionStatusLabel(status, cancelling),
    tone: subscriptionStatusTone(status, cancelling),
    detail: subscriptionStatusDetail(status, cancelling),
    /** Null unless something is actually blocked, so callers can render inline. */
    notice: blocked ? subscriptionBlockedNotice(status) : null,
  };
}

/**
 * The grace-period countdown (days remaining, expiry date), for the header
 * pill's detail modal and the Home banner. Only `billing/status/` carries
 * this — it's not on auth/me/ — so this fires a request, but only while
 * there's actually a countdown to show for a role that would see it.
 */
export function useGracePeriod(status?: string, visible?: boolean) {
  const { data } = useBillingStatus({ enabled: status === 'grace_period' && !!visible });
  const grace = (pick(data ?? {}, ['grace']) ?? {}) as Record<string, unknown>;
  const daysRemaining = num(pick(grace, ['days_remaining']), NaN);
  const expiresAt = str(pick(grace, ['grace_period_expires_at']));

  return {
    /** NaN when not in grace, or the data hasn't loaded yet — check before rendering. */
    daysRemaining: Number.isFinite(daysRemaining) ? daysRemaining : undefined,
    expiresAt: expiresAt || undefined,
  };
}
