// Maps Company.subscription_status (delivered on auth/me/ as a computed field)
// to what the UI shows, and to whether quoting and invoicing are actually
// blocked. Mirrors the web app's src/lib/subscriptionStatus.ts and, more
// importantly, PlanLimitsMiddleware's own check on the backend: only
// 'suspended' and 'cancelled' block anything. Anything else — including
// 'grace_period' — keeps full access.
//
// The copy here deliberately differs from web's. Web tells the user to
// "Subscribe from Billing" and links them there; on iOS a call to action
// pointing at an external purchase flow for a digital subscription breaches
// App Store Review 3.1.1, so these strings state the situation and say who can
// resolve it without steering the user to a payment page.

export type SubscriptionTone = 'success' | 'warning' | 'danger';

/** Only these two states actually gate features, server-side and here. */
export function isSubscriptionBlocked(status?: string | null): boolean {
  return status === 'suspended' || status === 'cancelled';
}

export function subscriptionStatusLabel(status?: string | null): string {
  switch (status) {
    case 'trialing':
      return 'TRIAL';
    case 'grace_period':
      return 'OVERDUE';
    case 'suspended':
      return 'SUSPENDED';
    case 'cancelled':
      return 'CANCELLED';
    default:
      // 'active', 'none', or not loaded yet.
      return 'ACTIVE';
  }
}

export function subscriptionStatusTone(status?: string | null): SubscriptionTone {
  switch (status) {
    case 'grace_period':
    case 'trialing':
      return 'warning';
    case 'suspended':
    case 'cancelled':
      return 'danger';
    default:
      return 'success';
  }
}

/** Longer explanation, for the billing screen and the blocked-action notice. */
export function subscriptionStatusDetail(status?: string | null): string {
  switch (status) {
    case 'trialing':
      return 'This account is on a trial. Quoting and invoicing keep working until it ends.';
    case 'grace_period':
      return 'The last payment attempt failed. You still have full access for now — your administrator can settle it on the Truckwys dashboard.';
    case 'suspended':
      return 'This subscription is suspended, so new quotes and invoices are blocked. Existing data stays available, and your administrator can restore access from the Truckwys dashboard.';
    case 'cancelled':
      return 'This subscription has been cancelled, so new quotes and invoices are blocked. Existing data stays available, and your administrator can reactivate it from the Truckwys dashboard.';
    default:
      return 'This account is active and in good standing.';
  }
}

/** One-line notice shown in place of an action the subscription state blocks. */
export function subscriptionBlockedNotice(status?: string | null): string {
  return status === 'cancelled'
    ? 'Cancelled subscription — new quotes and invoices are blocked. Existing work is unaffected.'
    : 'Suspended subscription — new quotes and invoices are blocked. Existing work is unaffected.';
}
