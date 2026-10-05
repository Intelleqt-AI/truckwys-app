import type { PaymentSource } from './types';

const SOURCE_LABEL: Record<PaymentSource, string> = {
  MANUAL: 'TruckWys',
  XERO: 'Xero',
  QBO: 'QuickBooks',
  BANK: 'bank feed',
};

/** Only payments recorded in TruckWys can be changed here; synced ones belong to their source. */
export const isManualPayment = (p: { source?: string | null }) => !p.source || p.source === 'MANUAL';

/** "From Xero" for a synced payment, null for one recorded in TruckWys. */
export const paymentSourceTag = (p: { source?: string | null }) =>
  isManualPayment(p) ? null : `From ${SOURCE_LABEL[p.source as PaymentSource] ?? p.source}`;
