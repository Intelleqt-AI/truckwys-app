// The shapes the Insights charts draw. Plain data, so the series code
// (features/more/insights/series.ts) and the charts agree without importing each other.

/** One paid invoice on a customer's payment-habit row. */
export interface PayMark {
  id: string;
  /** Invoice number. */
  ref: string;
  /** Days paid after the due date; negative when paid early, 0 on the day. */
  late: number;
  /** Invoice total. */
  amount: number;
}

export interface PayRow {
  id: string;
  label: string;
  /** Amount-weighted median of `late` over the marks. */
  median: number;
  /** Too few paid invoices to call a habit: drawn hollow, no median bar. */
  thin: boolean;
  marks: PayMark[];
}

/** One open, overdue invoice under a customer on the "owed now" list. */
export interface OwedInvoice {
  id: number;
  ref: string;
  balance: number;
  /** Whole days past the due date (always above 0). */
  daysLate: number;
  /** Days since the last reminder, or null when none is recorded. */
  remindedAgo: number | null;
}

export interface OwedRow {
  id: string;
  label: string;
  customerId: number | null;
  /** Total overdue balance. */
  overdue: number;
  /** Overdue balance per `AGE_BUCKETS` index (index 0, Current, is always 0). */
  buckets: number[];
  /** Days past due of the oldest invoice. */
  oldest: number;
  invoices: OwedInvoice[];
}

/** One lane: revenue per km against the length of a trip. */
export interface LanePoint {
  id: string;
  label: string;
  trips: number;
  revenue: number;
  kmPerTrip: number;
  perKm: number;
  /** Too few trips to judge: drawn hollow. */
  thin: boolean;
}

export interface WaterfallStep {
  /** Short, under the bar ("Mar"). */
  label: string;
  /** Spoken and readout label ("Mar 2026"); `label` when absent. */
  full?: string;
  value: number;
  /** `total` stands on zero; `delta` floats from the running level. */
  kind: 'total' | 'delta';
  /** `cost` draws hatched neutral (money out) instead of the accent. */
  tone?: 'cost';
  /** Shown in the readout when this step is selected. */
  detail?: string;
  /** Readout text when the value is zero ("Nothing received or approved"). */
  emptyText?: string;
}

export interface FunnelStage {
  key: string;
  label: string;
  /** Under the label, e.g. the stage's rand value. */
  sub?: string;
  count: number;
  /** What the drop from the stage before is called ("still drafts"). */
  dropNote?: string;
}

export interface RankedRow {
  id: string;
  label: string;
  /** Muted second line. */
  meta?: string;
  value: number;
  /** Opens the record behind the row. */
  onPress?: () => void;
}
