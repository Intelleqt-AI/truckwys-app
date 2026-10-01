import { useCallback } from 'react';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import type { Target } from './findings';

// Turns a finding's navigation target (data, from findings.ts) into real app
// navigation. The web linked to routes such as /finance/invoices?status=DRAFT;
// the app has no filtered list screens, so a list target opens the matching
// tab of Finance or Bookings, the closest screen.
export function useOpenTarget() {
  const { nav, goTab, openInvoice, openLoad, openQuote, openCustomer } = useAppNavigation();

  return useCallback(
    (t: Target) => {
      switch (t.kind) {
        case 'invoice':
          return openInvoice(t.id);
        case 'invoices':
          return goTab('Finance', { tab: 'invoices' });
        case 'load':
          return openLoad(t.id);
        case 'orders':
          return goTab('Bookings', { tab: 'orders' });
        case 'quote':
          return openQuote(t.id);
        case 'quotes':
          return goTab('Bookings', { tab: 'quotes' });
        case 'customer':
          return openCustomer(t.id);
        case 'expenses':
          return goTab('Finance', { tab: 'expenses' });
        case 'reports':
          return goTab('Finance', { tab: 'reports' });
        case 'company-settings':
          return nav.navigate('Settings', { section: 'company' });
      }
    },
    // The helpers are re-created each render but only close over `nav`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nav],
  );
}
