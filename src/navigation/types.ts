import type { NavigatorScreenParams } from '@react-navigation/native';

// Detail screens map to the design's slide-over overlays. Where a preview object
// is available we pass a lightweight snapshot for instant render; the screen then
// fetches fresh data by id via React Query.
type Id = number | string;

export type BookingsTab = 'quotes' | 'orders' | 'history';
export type FleetTab = 'vehicles' | 'drivers';
export type FinanceTab = 'invoices' | 'expenses' | 'reports';

export type TabParamList = {
  Home: undefined;
  Bookings: { tab?: BookingsTab } | undefined;
  Fleet: { tab?: FleetTab } | undefined;
  Finance: { tab?: FinanceTab } | undefined;
};

export type AppStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  LoadDetail: { id: Id; preview?: Record<string, unknown> };
  QuoteDetail: { id: Id; preview?: Record<string, unknown> };
  CreateQuote: { ai?: boolean; prefill?: Record<string, unknown>; quoteId?: Id } | undefined;
  AIQuoteChat: undefined;
  VehicleDetail: { id: Id; preview?: Record<string, unknown> };
  DriverDetail: { id: Id; preview?: Record<string, unknown> };
  InvoiceDetail: { id: Id; preview?: Record<string, unknown> };
  Customers: undefined;
  CustomerDetail: { id: Id; preview?: Record<string, unknown> };
  CustomerRisk: { id: Id };
  AddCustomer: { id?: Id; preview?: Record<string, unknown> } | undefined;
  Settings: { section?: string } | undefined;
  CreateInvoice: undefined;
  AddExpense: { id?: Id; preview?: Record<string, unknown> } | undefined;
  AddVehicle: { id?: Id; preview?: Record<string, unknown> } | undefined;
  AddVehicleType: { id?: Id; preview?: Record<string, unknown> } | undefined;
  AddDriver: { id?: Id; preview?: Record<string, unknown> } | undefined;
  AdvanceDetail: { id: Id };
  RiskScores: undefined;
  More: undefined;
  Activity: undefined;
  Copilot: undefined;
  Insights: undefined;
  Capital: undefined;
  Notifications: undefined;
  Stub: { title: string; body?: string };
};

export type AuthStackParamList = {
  Login: undefined;
  VerifyOtp: { pendingToken: string; email: string };
  Signup: undefined;
  ForgotPassword: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends AppStackParamList {}
  }
}
