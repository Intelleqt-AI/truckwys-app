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
  CreateQuote:
    | {
        ai?: boolean;
        prefill?: Record<string, unknown>;
        quoteId?: Id;
        /** Arm the map's crosshair for this end on open — "Set on map" from the picker. */
        pick?: 'pickup' | 'delivery';
        /** Locations already chosen and sitting in the location store; don't clear them. */
        fromPicker?: boolean;
        /**
         * A recording made on the picker, to transcribe and build from on arrival.
         * The recorder lives on the picker so "describe the job" opens the mic
         * rather than a form; the conversation that interprets it lives here.
         */
        voiceUri?: string;
      }
    | undefined;
  /** Collection and drop-off, asked for before the builder. */
  PickLocations: { focus?: 'pickup' | 'delivery'; keep?: boolean } | undefined;
  /** Place one end by moving the map under a fixed pin. Writes to the location store. */
  PinDrop: { end: 'pickup' | 'delivery' };
  VehicleDetail: { id: Id; preview?: Record<string, unknown> };
  DriverDetail: { id: Id; preview?: Record<string, unknown> };
  InvoiceDetail: { id: Id; preview?: Record<string, unknown> };
  Customers: undefined;
  CustomerDetail: { id: Id; preview?: Record<string, unknown> };
  CustomerRisk: { id: Id };
  AddCustomer: { id?: Id; preview?: Record<string, unknown> } | undefined;
  Settings: { section?: string } | undefined;
  BillingHistory: undefined;
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
  Support: undefined;
};

// No Signup screen: accounts are created on the web dashboard only (the web
// signup flow is payment-gated), so the app is sign-in only.
export type AuthStackParamList = {
  Login: undefined;
  VerifyOtp: { pendingToken: string; email: string };
  ForgotPassword: undefined;
  ResetPassword: { email: string };
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends AppStackParamList {}
  }
}
