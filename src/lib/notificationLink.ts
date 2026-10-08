import type { AppStackParamList } from '@/navigation/types';

// Same parsers as lib/followups.ts (fuelAlertParam / followUpParam), kept here
// so this module stays import-free and runs under `node --test`.
const fuelAlertParam = (search: string): number | null => {
  const m = /[?&]fuel_alert=([^&#]*)/.exec(search || '');
  const n = m ? Number(decodeURIComponent(m[1] ?? '')) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
};
const followUpParam = (search: string): boolean =>
  /[?&]follow_up=(1|true)(?:&|#|$)/.test(search || '');

// The backend stores notification `link` values as WEB paths ("/bookings/12",
// "/quotes/7", "/finance/invoices/3") because the browser client consumes them
// directly. Translate to a mobile route + params.
//
// The Copilot's navigation chips use the same web paths — they come from
// _ACTION_LIBRARY in core/services/agent.py — so this table serves both, and
// anything added for one fixes the other.
//
// Keep this table in step with AppStackParamList: an unmapped prefix silently
// falls back to the notification list, which is safe but loses the deep link.

type Target = { screen: keyof AppStackParamList; params?: Record<string, unknown> };

/**
 * Exact paths that are NOT a detail screen, checked before the id prefixes.
 *
 * "/quotes/new" is why this exists as its own step: it starts with "/quotes/",
 * so the prefix table below would have opened QuoteDetail with the id "new" and
 * the screen would mount and immediately fail its fetch.
 */
const EXACT_ROUTES: Record<string, Target> = {
  '/quotes/new': { screen: 'CreateQuote' },
  '/bookings/new': { screen: 'CreateQuote' },
  '/finance/invoices/new': { screen: 'CreateInvoice' },
  '/customers/new': { screen: 'AddCustomer' },
};

// Longest prefix first — "/finance/invoices/3" must not match a bare "/finance".
const ROUTES: { prefix: string; screen: keyof AppStackParamList }[] = [
  { prefix: '/finance/invoices/', screen: 'InvoiceDetail' },
  { prefix: '/finance/credit-notes/', screen: 'CreditNoteDetail' },
  { prefix: '/invoices/', screen: 'InvoiceDetail' },
  { prefix: '/bookings/quotes/', screen: 'QuoteDetail' },
  { prefix: '/bookings/', screen: 'LoadDetail' },
  { prefix: '/loads/', screen: 'LoadDetail' },
  { prefix: '/quotes/', screen: 'QuoteDetail' },
  { prefix: '/customers/', screen: 'CustomerDetail' },
  { prefix: '/capital/advances/', screen: 'AdvanceDetail' },
];

// Paths with no id — a plain destination. The tabbed ones land on the Tabs
// navigator with the right tab preselected, which is how the web app's
// "/finance/invoices" or "/fleet/vehicles" translate here.
const STATIC_ROUTES: Record<string, Target> = {
  '/': { screen: 'Tabs' },
  '/capital': { screen: 'Capital' },
  '/insights': { screen: 'Insights' },
  '/copilot': { screen: 'Copilot' },
  '/insurance': { screen: 'Insurance' },
  '/customers': { screen: 'Customers' },
  '/notifications': { screen: 'Notifications' },
  '/quotes': { screen: 'Tabs', params: { screen: 'Bookings', params: { tab: 'quotes' } } },
  '/bookings/quotes': { screen: 'Tabs', params: { screen: 'Bookings', params: { tab: 'quotes' } } },
  '/bookings': { screen: 'Tabs', params: { screen: 'Bookings', params: { tab: 'orders' } } },
  '/finance': { screen: 'Tabs', params: { screen: 'Finance', params: { tab: 'invoices' } } },
  '/finance/invoices': {
    screen: 'Tabs',
    params: { screen: 'Finance', params: { tab: 'invoices' } },
  },
  '/finance/credit-notes': {
    screen: 'Tabs',
    params: { screen: 'Finance', params: { tab: 'credits' } },
  },
  '/finance/suppliers': { screen: 'Suppliers' },
  '/finance/expenses': {
    screen: 'Tabs',
    params: { screen: 'Finance', params: { tab: 'expenses' } },
  },
  '/finance/reports': { screen: 'Tabs', params: { screen: 'Finance', params: { tab: 'reports' } } },
  '/fleet': { screen: 'Tabs', params: { screen: 'Fleet', params: { tab: 'vehicles' } } },
  '/fleet/vehicles': { screen: 'Tabs', params: { screen: 'Fleet', params: { tab: 'vehicles' } } },
  '/fleet/drivers': { screen: 'Tabs', params: { screen: 'Fleet', params: { tab: 'drivers' } } },
};

/**
 * Resolve a notification link to a navigation target.
 * Returns null when there is nothing sensible to open.
 */
export function resolveNotificationLink(link?: string | null): Target | null {
  if (!link) return null;
  // Tolerate absolute URLs and query strings/fragments.
  let path = link.trim();
  try {
    if (/^https?:\/\//i.test(path)) {
      const u = new URL(path);
      path = u.pathname + u.search;
    }
  } catch {
    return null;
  }
  // Quote follow-ups carry their intent in the query string:
  // "/bookings/quotes?fuel_alert=4" opens the fuel alert sheet and
  // "/bookings/quotes/9?follow_up=1" opens the quote at its follow-up card.
  const query = path.includes('?') ? path.slice(path.indexOf('?')) : '';
  path = path.split('?')[0]!.split('#')[0]!;
  if (!path.startsWith('/')) path = `/${path}`;
  const clean = path.replace(/\/+$/, '') || '/';

  // Exact matches first: "/quotes/new" must not be read as quote id "new".
  const alertId = fuelAlertParam(query);
  if (alertId !== null && (clean === '/bookings/quotes' || clean === '/quotes')) {
    return { screen: 'FuelAlert', params: { id: alertId } };
  }

  const exactHit = EXACT_ROUTES[clean];
  if (exactHit) return exactHit;

  const staticHit = STATIC_ROUTES[clean];
  if (staticHit) return staticHit;

  for (const { prefix, screen } of ROUTES) {
    if (!path.startsWith(prefix)) continue;
    const id = path.slice(prefix.length).split('/')[0];
    // Every detail screen in this table requires an id; without one the screen
    // would mount and immediately fail its fetch.
    if (!id) return null;
    if (screen === 'QuoteDetail' && followUpParam(query))
      return { screen, params: { id, followUp: true } };
    return { screen, params: { id } };
  }
  return null;
}

// Android channels (mirrors the backend's notify_copy.channel_for()). The
// server names the channel in the push data; this is the fallback when it
// doesn't, so the quote follow-up events (quote.fuel_alert, quote.expiring,
// quote.no_answer) land in the existing Bookings & Quotes channel.
const CHANNEL_PREFIXES: [string, 'bookings' | 'finance' | 'fleet'][] = [
  ['quote.', 'bookings'],
  ['booking.', 'bookings'],
  ['invoice.', 'finance'],
  ['payment.', 'finance'],
  ['delivery_fee.', 'finance'],
  ['advance.', 'finance'],
  ['maintenance.', 'fleet'],
  ['driver.', 'fleet'],
];

export function pushChannelFor(
  event?: string | null,
  channel?: string | null,
): 'bookings' | 'finance' | 'fleet' {
  if (channel === 'bookings' || channel === 'finance' || channel === 'fleet') return channel;
  const e = event ?? '';
  for (const [prefix, ch] of CHANNEL_PREFIXES) if (e.startsWith(prefix)) return ch;
  return 'bookings';
}
