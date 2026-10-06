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
  | 'credit-note'
  | 'supplier'
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
const FINANCE = ['finance-reports', 'invoice-aging', 'capital', 'capital-eligible', 'reports-lanes'];
const RISK = ['risk-scores', 'customer-risk'];
// Assignment pickers filter on availability, so anything that frees up or takes
// a driver/vehicle changes them.
const ASSIGN = ['drivers-available-for-assign', 'vehicles-available-for-assign'];

const MAP: Record<DomainEvent, string[]> = {
  quote: ['quotes', 'quote', 'customer-quotes', 'quote-fuel-alert', 'ledger-quotes', ...DASHBOARD, ...FINANCE, ...RISK],
  // A load's status drives revenue recognition, fleet utilisation and the
  // Home heatmap; delivering one can also auto-raise an invoice. A quote reports
  // the load it was booked as (booked_load), so quotes move with loads too.
  load: ['loads', 'load', 'ledger-loads', 'ledger-quotes', 'quotes', 'quote', 'customer-quotes', 'invoices', 'vehicles', 'vehicle', 'vehicle-loads', 'driver-loads', 'drivers', ...ASSIGN, ...DASHBOARD, ...FINANCE],
  // Credit notes move an invoice's balance and status, so they ride along with
  // invoice and payment changes (the backend pushes no credit-note topic of its
  // own; issuing one saves the invoice, which does push).
  invoice: ['invoices', 'invoice', 'ledger-invoices', 'invoice-payments', 'credit-notes', 'credit-note', 'ledger-creditNotes', 'customer', 'customers', ...DASHBOARD, ...FINANCE, ...RISK],
  payment: ['invoices', 'invoice', 'ledger-payments', 'ledger-invoices', 'invoice-payments', 'credit-notes', 'credit-note', 'ledger-creditNotes', 'customers', ...DASHBOARD, ...FINANCE, ...RISK],
  'credit-note': ['credit-notes', 'credit-note', 'ledger-creditNotes', 'invoices', 'invoice', 'ledger-invoices', 'invoice-payments', 'customers', ...DASHBOARD, ...FINANCE, ...RISK],
  supplier: ['suppliers', 'supplier', 'expenses', 'expense', 'ledger-expenses'],
  expense: ['expenses', 'expense', 'ledger-expenses', 'suppliers', 'vehicle-loads', ...DASHBOARD, ...FINANCE],
  vehicle: ['vehicles', 'vehicle', 'ledger-vehicles', 'vehicle-loads', 'vehicle-types', 'drivers', ...ASSIGN, ...DASHBOARD],
  // Drivers are Users too — AddDriverScreen POSTs to users/ as well.
  driver: ['drivers', 'driver', 'driver-loads', 'vehicles', 'vehicle', 'users', ...ASSIGN, ...DASHBOARD],
  customer: ['customers', 'customer', 'ledger-customers', 'customer-quotes', 'quotes', 'invoices', ...RISK, ...DASHBOARD],
  advance: ['capital', 'capital-eligible', 'advance', 'invoices', 'invoice', 'ledger-invoices', ...DASHBOARD, ...FINANCE],
  notification: ['notifications', 'notifications-unread'],
  user: ['users', 'me', 'drivers'],
  // The three security preferences, the device list and the activity feed all
  // move together — revoking a session shows up in all three.
  security: ['security-settings', 'sessions', 'login-activity'],
  company: ['company-profile', 'billing-status', 'finance-settings', 'tax-codes'],
  'vehicle-type': ['vehicle-types', ...ASSIGN],
  // The agent acts on real records on the server and doesn't report which, so
  // this one is deliberately broad.
  copilot: ['agent-proposals', 'quotes', 'quote', 'loads', 'load', 'invoices', 'invoice', ...DASHBOARD, ...FINANCE],
};

function invalidateEvents(qc: QueryClient, events: readonly DomainEvent[], cancelRefetch: boolean): void {
  const keys = new Set<string>();
  for (const e of events) for (const k of MAP[e] ?? []) keys.add(k);
  for (const k of keys) void qc.invalidateQueries({ queryKey: [k] }, { cancelRefetch });
}

/**
 * Invalidate everything affected by `event`. Fire-and-forget: awaiting it makes
 * a screen wait on unrelated background refetches before it can navigate away.
 *
 * Restarts any fetch already in flight for an affected key (TanStack's
 * default), which is what a local write wants: a request that began before the
 * save may carry pre-save data.
 */
export function invalidateFor(qc: QueryClient, ...events: DomainEvent[]): void {
  invalidateEvents(qc, events, true);
}

// Server-pushed variant. One save reaches this device several times over — the
// mutation's own invalidation, a data.changed push, a named event, an FCM push —
// and with cancelRefetch the later waves aborted the detail fetch the user was
// waiting on and restarted it (the aborted HTTP request keeps its connection
// slot, since fetchData doesn't forward the signal). The mutation's own
// invalidation already restarted anything stale, so a push that lands mid-fetch
// just joins the request that is already running.
function invalidateFromServer(qc: QueryClient, events: readonly DomainEvent[]): void {
  invalidateEvents(qc, events, false);
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

// `data.changed` topics (backend core/ws/data_changes.py) -> domain events. A
// trip is a leg of a load and carries its expenses, so it refreshes both.
const TOPIC_EVENTS: Record<string, DomainEvent[]> = {
  invoice: ['invoice'],
  payment: ['payment'],
  expense: ['expense'],
  quote: ['quote'],
  load: ['load'],
  trip: ['load', 'expense'],
  vehicle: ['vehicle'],
  driver: ['driver'],
  customer: ['customer'],
  advance: ['advance'],
};

/** Every topic the backend can push, for the refetch-everything-after-reconnect case. */
export const ALL_DATA_TOPICS = Object.keys(TOPIC_EVENTS);

/**
 * Invalidate what a `data.changed` push touched. Unlike a named server event it
 * does not touch the notification bell: nothing was added to it.
 */
export function invalidateForTopics(qc: QueryClient, topics: readonly string[]): void {
  const events = new Set<DomainEvent>();
  for (const t of topics) for (const e of TOPIC_EVENTS[t] ?? []) events.add(e);
  if (events.size) invalidateFromServer(qc, [...events]);
}

export function invalidateForServerEvent(qc: QueryClient, event: string): void {
  // Every server event also lands in the bell.
  const events: DomainEvent[] = ['notification'];
  for (const [prefix, mapped] of EVENT_PREFIX) {
    if ((event || '').startsWith(prefix)) {
      events.push(...mapped);
      break;
    }
  }
  invalidateFromServer(qc, events);
}
