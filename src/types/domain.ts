import { num, str, pick } from '@/lib/api/list';

// Normalized, UI-facing shapes. The Django API types most numeric fields as
// strings and field names drift a little between endpoints, so each normalizer
// reads defensively via pick()/num() and always keeps the raw record.

type Raw = Record<string, unknown>;

export interface QuoteLite {
  id: string | number;
  code: string;
  customer: string;
  origin: string;
  destination: string;
  amount: number;
  status: string;
  marginPct?: number;
  confidence?: number;
  validUntil?: string;
  raw: Raw;
}

export const normalizeQuote = (q: Raw): QuoteLite => ({
  id: (pick(q, ['id', 'pk']) as string | number) ?? '',
  code: str(pick(q, ['quote_number', 'reference', 'code', 'id']), 'Q-—'),
  customer: str(pick(q, ['customer_name', 'customer', 'client_name']), 'Customer'),
  origin: str(pick(q, ['origin_city', 'origin', 'pickup_city', 'pickup_state']), '—'),
  destination: str(pick(q, ['destination_city', 'destination', 'delivery_city', 'delivery_state']), '—'),
  amount: num(pick(q, ['total_amount', 'price', 'amount', 'total'])),
  status: str(pick(q, ['status']), 'DRAFT').toUpperCase(),
  marginPct: pick(q, ['margin_percent', 'marginPct', 'margin']) != null
    ? num(pick(q, ['margin_percent', 'marginPct', 'margin']))
    : undefined,
  confidence: pick(q, ['confidence']) != null ? num(pick(q, ['confidence'])) : undefined,
  validUntil: pick(q, ['valid_until', 'expiresAt', 'expires_at']) as string | undefined,
  raw: q,
});

export interface LoadLite {
  id: string | number;
  loadNumber: string;
  customer: string;
  pickupState: string;
  deliveryState: string;
  status: string;
  amount: number;
  createdAt?: string;
  raw: Raw;
}

export const normalizeLoad = (l: Raw): LoadLite => ({
  id: (pick(l, ['id', 'pk']) as string | number) ?? '',
  loadNumber: str(pick(l, ['load_number', 'reference', 'id']), 'LD-—'),
  customer: str(pick(l, ['customer_name', 'customer']), 'Customer'),
  pickupState: str(pick(l, ['pickup_state', 'pickup_city', 'origin_city']), '—'),
  deliveryState: str(pick(l, ['delivery_state', 'delivery_city', 'destination_city']), '—'),
  status: str(pick(l, ['status']), 'PENDING').toUpperCase(),
  amount: num(pick(l, ['total_amount', 'rate', 'amount'])),
  createdAt: pick(l, ['created_at', 'pickup_date']) as string | undefined,
  raw: l,
});

export interface FinanceSummary {
  totalRevenue: number;
  revenueChangePct: number;
  netMarginPct: number;
  marginChangePts: number;
  outstanding: number;
  dso: number;
}

export const normalizeFinance = (f: Raw | null | undefined): FinanceSummary => ({
  totalRevenue: num(pick(f ?? {}, ['total_revenue'])),
  revenueChangePct: num(pick(f ?? {}, ['revenue_change_pct'])),
  netMarginPct: num(pick(f ?? {}, ['net_margin_percent'])),
  marginChangePts: num(pick(f ?? {}, ['margin_change_pts'])),
  outstanding: num(pick(f ?? {}, ['outstanding_invoices_total'])),
  dso: num(pick(f ?? {}, ['dso'])),
});

export interface VehicleLite {
  id: string | number;
  name: string;
  plate: string;
  status: string;
  aiHealthScore?: number;
  fuelEfficiency?: number;
  uptime?: number;
  mileage?: number;
  raw: Raw;
}

export const normalizeVehicle = (v: Raw): VehicleLite => {
  const makeModel = [str(pick(v, ['make'])), str(pick(v, ['model']))].filter(Boolean).join(' ');
  const plate = str(pick(v, ['registration', 'plate', 'license_plate', 'reg_number']), '—');
  return {
    id: (pick(v, ['id', 'pk']) as string | number) ?? '',
    name: makeModel || str(pick(v, ['make_model', 'name']), '') || plate || 'Vehicle',
    plate,
    status: str(pick(v, ['status']), 'AVAILABLE').toUpperCase(),
    aiHealthScore: pick(v, ['ai_health_score', 'health_score']) != null
      ? num(pick(v, ['ai_health_score', 'health_score']))
      : undefined,
    fuelEfficiency: pick(v, ['fuel_efficiency_score']) != null ? num(pick(v, ['fuel_efficiency_score'])) : undefined,
    uptime: pick(v, ['uptime_percentage']) != null ? num(pick(v, ['uptime_percentage'])) : undefined,
    mileage: pick(v, ['mileage']) != null ? num(pick(v, ['mileage'])) : undefined,
    raw: v,
  };
};

export interface DriverLite {
  id: string | number;
  name: string;
  status: string;
  safetyScore?: number;
  raw: Raw;
}

export const normalizeDriver = (d: Raw): DriverLite => ({
  id: (pick(d, ['id', 'pk']) as string | number) ?? '',
  name: str(pick(d, ['name', 'full_name', 'driver_name']), 'Driver'),
  status: str(pick(d, ['status']), 'ACTIVE').toUpperCase(),
  safetyScore: pick(d, ['safety_score']) != null ? num(pick(d, ['safety_score'])) : undefined,
  raw: d,
});

export interface InvoiceLite {
  id: string | number;
  number: string;
  customer: string;
  total: number;
  balance: number;
  status: string;
  earlyPayEligible?: boolean;
  dueDate?: string;
  raw: Raw;
}

export const normalizeInvoice = (inv: Raw): InvoiceLite => ({
  id: (pick(inv, ['id', 'pk']) as string | number) ?? '',
  number: str(pick(inv, ['invoice_number', 'number', 'id']), 'INV-—'),
  customer: str(pick(inv, ['customer_name', 'customer']), 'Customer'),
  total: num(pick(inv, ['total', 'total_amount', 'amount'])),
  balance: num(pick(inv, ['balance', 'balance_due', 'amount_due'])),
  status: str(pick(inv, ['status']), 'UNPAID').toUpperCase(),
  earlyPayEligible: Boolean(pick(inv, ['early_pay_eligible'])),
  dueDate: pick(inv, ['due_date', 'dueDate']) as string | undefined,
  raw: inv,
});

export interface CustomerLite {
  id: string | number;
  name: string;
  contact: string;
  creditScore?: number;
  raw: Raw;
}

export const normalizeCustomer = (c: Raw): CustomerLite => ({
  id: (pick(c, ['id', 'pk']) as string | number) ?? '',
  name: str(pick(c, ['name', 'company_name', 'customer_name']), 'Customer'),
  contact: str(pick(c, ['contact_name', 'email', 'phone', 'contact']), ''),
  creditScore: pick(c, ['credit_score']) != null ? num(pick(c, ['credit_score'])) : undefined,
  raw: c,
});

export interface ExpenseLite {
  id: string | number;
  category: string;
  description: string;
  amount: number;
  date?: string;
  status: string;
  vendor: string;
  expenseNumber: string;
  raw: Raw;
}

export const normalizeExpense = (e: Raw): ExpenseLite => ({
  id: (pick(e, ['id', 'pk']) as string | number) ?? '',
  category: str(pick(e, ['category', 'type']), 'OTHER').toUpperCase(),
  description: str(pick(e, ['description', 'note', 'memo']), ''),
  amount: num(pick(e, ['amount', 'total'])),
  date: pick(e, ['expense_date', 'date', 'created_at']) as string | undefined,
  status: str(pick(e, ['status']), 'PENDING').toUpperCase(),
  vendor: str(pick(e, ['vendor'])),
  expenseNumber: str(pick(e, ['expense_number'])),
  raw: e,
});
