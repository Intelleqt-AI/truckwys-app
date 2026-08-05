import type { QueryClient } from '@tanstack/react-query';

// One place that knows which cached queries a given change invalidates.
//
// Before this, every write site hand-rolled its own invalidateQueries list, and
// ['overview'] — the Home dashboard, which fans out to six endpoints and is
// therefore dirtied by almost every write in the app — appeared in none of them.
// So changing a booking's status and going Home still showed the old status
// until a manual pull-to-refresh. Several screens also missed their own detail
// key, and the derived/aggregate keys (reports, insights, activity, cashflow)
// were never invalidated by anything at all.
//
// Keys are matched by prefix, which is how invalidateQueries works: passing
// ['quote'] also invalidates ['quote', 17]. Entity-scoped keys are listed
// without their id for that reason, so a change to one quote refreshes any
// cached quote detail. Slightly broader than strictly necessary, and far safer
// than missing the one the user is looking at.

/** A domain change worth telling the cache about. */
export type DomainEvent =
  | 'quote'
  | 'load'
  | 'invoice'
  | 'payment'
  | 'expense'
  | 'vehicle'
  | 'driver'
  | 'customer'
  | 'advance'
  | 'notification'
  | 'user'
  | 'security'
  | 'company'
  | 'vehicle-type'
  | 'copilot';

// Home's dashboard plus the analytics that read the same underlying rows. Any
// write that changes money or job state moves at least one of these.
const DASHBOARD = ['overview', 'insights', 'activity', 'dashboard-cashflow'];
const FINANCE = ['finance-reports', 'capital', 'capital-eligible', 'reports-lanes'];
const RISK = ['risk-scores', 'customer-risk'];
// Assignment pickers filter on availability, so anything that frees up or takes
// a driver/vehicle changes them.
const ASSIGN = ['drivers-available-for-assign', 'vehicles-available-for-assign'];

const MAP: Record<DomainEvent, string[]> = {
  quote: ['quotes', 'quote', 'customer-quotes', 'quote-model-stats', ...DASHBOARD, ...FINANCE, ...RISK],
  // A load's status drives revenue recognition, fleet utilisation and the
  // Home heatmap; delivering one can also auto-raise an invoice.
  load: ['loads', 'load', 'invoices', 'vehicles', 'vehicle', 'vehicle-loads', 'drivers', ...ASSIGN, ...DASHBOARD, ...FINANCE],
  invoice: ['invoices', 'invoice', 'invoice-payments', 'customer', ...DASHBOARD, ...FINANCE, ...RISK],
  payment: ['invoices', 'invoice', 'invoice-payments', ...DASHBOARD, ...FINANCE, ...RISK],
  expense: ['expenses', 'vehicle-loads', ...DASHBOARD, ...FINANCE],
  vehicle: ['vehicles', 'vehicle', 'vehicle-loads', 'vehicle-types', 'drivers', ...ASSIGN, ...DASHBOARD],
  // Drivers are Users too — AddDriverScreen POSTs to users/ as well.
  driver: ['drivers', 'driver', 'vehicles', 'vehicle', 'users', ...ASSIGN, ...DASHBOARD],
  customer: ['customers', 'customer', 'customer-quotes', 'quotes', 'invoices', ...RISK, ...DASHBOARD],
  advance: ['capital', 'capital-eligible', 'advance', 'invoices', 'invoice', ...DASHBOARD, ...FINANCE],
  notification: ['notifications', 'notifications-unread'],
  user: ['users', 'me', 'drivers'],
  // The three security preferences, the device list and the activity feed all
  // move together — revoking a session shows up in all three.
  security: ['security-settings', 'sessions', 'login-activity'],
  company: ['company-profile', 'billing-status'],
  'vehicle-type': ['vehicle-types', ...ASSIGN],
  // The agent acts on real records on the server and doesn't report which, so
  // this one is deliberately broad.
  copilot: ['agent-proposals', 'quotes', 'quote', 'loads', 'load', 'invoices', 'invoice', ...DASHBOARD, ...FINANCE],
};

/**
 * Invalidate everything affected by `event`. Fire-and-forget: awaiting it makes
 * a screen wait on unrelated background refetches before it can navigate away.
 */
export function invalidateFor(qc: QueryClient, ...events: DomainEvent[]): void {
  const keys = new Set<string>();
  for (const e of events) for (const k of MAP[e] ?? []) keys.add(k);
  for (const k of keys) void qc.invalidateQueries({ queryKey: [k] });
}

// Server event name (booking.delivered, invoice.paid, …) -> domain events. Used
// by the WebSocket client and by push notifications, which both deliver the
// backend's event name and nothing else useful.
const EVENT_PREFIX: [string, DomainEvent[]][] = [
  ['quote.', ['quote']],
  ['booking.', ['load']],
  ['invoice.', ['invoice']],
  ['payment.', ['payment']],
  ['advance.', ['advance']],
  ['delivery_fee.', ['invoice']],
  ['subscription.', ['company']],
  ['customer.', ['customer']],
  ['driver.', ['driver']],
  ['maintenance.', ['vehicle']],
];

export function invalidateForServerEvent(qc: QueryClient, event: string): void {
  // Every server event also lands in the bell.
  const events: DomainEvent[] = ['notification'];
  for (const [prefix, mapped] of EVENT_PREFIX) {
    if ((event || '').startsWith(prefix)) {
      events.push(...mapped);
      break;
    }
  }
  invalidateFor(qc, ...events);
}
