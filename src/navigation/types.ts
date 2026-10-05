import type { NavigatorScreenParams } from '@react-navigation/native';
import type { ReportId } from '@/features/finance/reports/types';
import type { PeriodId } from '@/lib/ledger';

// Detail screens map to the design's slide-over overlays. Where a preview object
// is available we pass a lightweight snapshot for instant render; the screen then
// fetches fresh data by id via React Query.
type Id = number | string;

export type BookingsTab = 'quotes' | 'orders' | 'history';
export type FleetTab = 'vehicles' | 'drivers';
export type FinanceTab = 'invoices' | 'credits' | 'expenses' | 'reports';
// 'cashflow' no longer has a tab (the web dropped it too); it stays in the type so
// old deep links and notifications still type-check and land on 'paid'.
export type InsightsTab = 'findings' | 'margin' | 'paid' | 'fleet' | 'lanes' | 'cashflow';

export type TabParamList = {
  Home: undefined;
  Bookings: { tab?: BookingsTab } | undefined;
  Fleet: { tab?: FleetTab } | undefined;
  Finance: { tab?: FinanceTab } | undefined;
};

export type AppStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  /** `title` is the load number when the caller knows it, shown while the load loads. */
  LoadDetail: { id: Id; preview?: Record<string, unknown>; title?: string };
  QuoteDetail: { id: Id; preview?: Record<string, unknown> };
  CreateQuote: { ai?: boolean; prefill?: Record<string, unknown>; quoteId?: Id } | undefined;
  VehicleDetail: { id: Id; preview?: Record<string, unknown> };
  DriverDetail: { id: Id; preview?: Record<string, unknown> };
  InvoiceDetail: { id: Id; preview?: Record<string, unknown> };
  AssignDriverVehicle: {
    mode: 'convert' | 'reassign';
    /** Reassign target. */
    loadId?: Id;
    /** Convert target. */
    quoteId?: Id;
    /** Quote number, shown in the convert prompt copy. */
    reference?: string;
    vehicleType?: string;
    initialDriverId?: string;
    initialVehicleId?: string;
    /** Reassign only: also PATCH status -> ASSIGNED after a real assignment. */
    activateOnAssign?: boolean;
    /** Convert only: also pop the screen beneath this one (e.g. QuoteDetail) before pushing LoadDetail. */
    popCallerOnSuccess?: boolean;
  };
  Customers: undefined;
  CustomerDetail: { id: Id; preview?: Record<string, unknown> };
  CustomerRisk: { id: Id };
  AddCustomer: { id?: Id; preview?: Record<string, unknown> } | undefined;
  Import: { entity: 'customers' | 'vehicles' };
  // First-run wizard for admins whose company hasn't finished onboarding —
  // gated by useOnboardingGate, opened from HomeScreen. Mirrors the web's
  // /onboarding (Onboarding.tsx).
  Onboarding: undefined;
  Settings: { section?: string } | undefined;
  BillingHistory: undefined;
  CreateInvoice: { id?: Id; preview?: Record<string, unknown> } | undefined;
  /** Issue a credit note against an invoice (the invoice is passed for instant render). */
  CreateCreditNote: { invoiceId: Id; preview?: Record<string, unknown> };
  CreditNoteDetail: { id: Id };
  /** One statement from Finance > Reports; `customer` preselects a customer statement. */
  FinanceReport: {
    report: ReportId;
    customer?: string;
    /** Open on this period instead of the report's default (Insights > Margin links here). */
    period?: { id: PeriodId; from?: string; to?: string };
  };
  /** Xero / QuickBooks: connect, map, contacts, start date, sync and reconciliation. */
  Accounting: { tab?: 'setup' | 'mapping' | 'contacts' | 'cutover' | 'sync' | 'reconciliation' } | undefined;
  Suppliers: undefined;
  SupplierForm: { id?: Id; preview?: Record<string, unknown> } | undefined;
  AddExpense: { id?: Id; preview?: Record<string, unknown> } | undefined;
  AddVehicle: { id?: Id; preview?: Record<string, unknown> } | undefined;
  AddVehicleType: { id?: Id; preview?: Record<string, unknown> } | undefined;
  AddDriver: { id?: Id; preview?: Record<string, unknown> } | undefined;
  AdvanceDetail: { id: Id };
  /** Request Fast Pay for one invoice; loads the saved offer and confirms its figures. */
  RequestFastPay: { invoiceId: Id; invoiceNumber?: string };
  RiskScores: undefined;
  More: undefined;
  Activity: undefined;
  Copilot: undefined;
  Insurance: undefined;
  Insights: { tab?: InsightsTab } | undefined;
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
