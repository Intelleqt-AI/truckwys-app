import type { AppStackParamList } from '@/navigation/types';

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
  // Same entry point as the + button: a quote starts by asking where it's going.
  '/quotes/new': { screen: 'PickLocations' },
  '/bookings/new': { screen: 'PickLocations' },
  '/finance/invoices/new': { screen: 'CreateInvoice' },
  '/customers/new': { screen: 'AddCustomer' },
};

// Longest prefix first — "/finance/invoices/3" must not match a bare "/finance".
const ROUTES: { prefix: string; screen: keyof AppStackParamList }[] = [
  { prefix: '/finance/invoices/', screen: 'InvoiceDetail' },
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
  '/customers': { screen: 'Customers' },
  '/notifications': { screen: 'Notifications' },
  '/quotes': { screen: 'Tabs', params: { screen: 'Bookings', params: { tab: 'quotes' } } },
  '/bookings': { screen: 'Tabs', params: { screen: 'Bookings', params: { tab: 'orders' } } },
  '/finance': { screen: 'Tabs', params: { screen: 'Finance', params: { tab: 'invoices' } } },
  '/finance/invoices': {
    screen: 'Tabs',
    params: { screen: 'Finance', params: { tab: 'invoices' } },
  },
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
    if (/^https?:\/\//i.test(path)) path = new URL(path).pathname;
  } catch {
    return null;
  }
  path = path.split('?')[0]!.split('#')[0]!;
  if (!path.startsWith('/')) path = `/${path}`;
  const clean = path.replace(/\/+$/, '') || '/';

  // Exact matches first: "/quotes/new" must not be read as quote id "new".
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
    return { screen, params: { id } };
  }
  return null;
}
