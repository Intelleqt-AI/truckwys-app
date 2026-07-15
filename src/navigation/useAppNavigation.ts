import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AppStackParamList, TabParamList } from './types';

// Single typed navigation surface for screens: open detail overlays (root stack)
// and switch bottom tabs. React Navigation resolves names across the tree, so a
// tab screen can navigate to a modal and vice-versa.
export function useAppNavigation() {
  const nav = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  return {
    nav,
    goTab: <T extends keyof TabParamList>(tab: T, params?: TabParamList[T]) =>
      nav.navigate('Tabs', { screen: tab, params } as never),
    openQuote: (id: string | number, preview?: Record<string, unknown>) =>
      nav.navigate('QuoteDetail', { id, preview }),
    openLoad: (id: string | number, preview?: Record<string, unknown>) =>
      nav.navigate('LoadDetail', { id, preview }),
    openVehicle: (id: string | number, preview?: Record<string, unknown>) =>
      nav.navigate('VehicleDetail', { id, preview }),
    openDriver: (id: string | number, preview?: Record<string, unknown>) =>
      nav.navigate('DriverDetail', { id, preview }),
    openInvoice: (id: string | number, preview?: Record<string, unknown>) =>
      nav.navigate('InvoiceDetail', { id, preview }),
    openCustomer: (id: string | number, preview?: Record<string, unknown>) =>
      nav.navigate('CustomerDetail', { id, preview }),
    createQuote: (ai?: boolean) => nav.navigate('CreateQuote', { ai }),
    aiQuote: () => nav.navigate('AIQuoteChat'),
  };
}
