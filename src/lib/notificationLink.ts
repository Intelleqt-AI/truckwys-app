import type { AppStackParamList } from '@/navigation/types';

// The backend stores notification `link` values as WEB paths ("/bookings/12",
// "/quotes/7", "/finance/invoices/3") because the browser client consumes them
// directly. Translate to a mobile route + params.
//
// Keep this table in step with AppStackParamList: an unmapped prefix silently
// falls back to the notification list, which is safe but loses the deep link.

type Target = { screen: keyof AppStackParamList; params?: Record<string, unknown> };

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

// Paths with no id — a plain destination.
const STATIC_ROUTES: Record<string, keyof AppStackParamList> = {
  '/': 'Tabs',
  '/capital': 'Capital',
  '/insights': 'Insights',
  '/copilot': 'Copilot',
  '/customers': 'Customers',
  '/notifications': 'Notifications',
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

  const staticHit = STATIC_ROUTES[path.replace(/\/+$/, '') || '/'];
  if (staticHit) return { screen: staticHit };

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
