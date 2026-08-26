import type { Loc, SectionId } from './types';

// Single source of truth for "can this quote be saved / sent, and why not."
// The rules here are exactly the guard clauses save() already enforces
// (CreateQuoteScreen.tsx) — this doesn't change what's allowed, only how it's
// communicated (inline errors + a footer strip instead of a toast after the
// fact). save() keeps its own guard clauses as a last line of defence; once
// this is wired they simply become unreachable.

export type IssueField =
  | 'subscription'
  | 'client'
  | 'vehicleType'
  | 'route'
  | 'pickup'
  | 'dropoff'
  | 'weight'
  | 'pickupDate'
  | 'deliveryDate';

export interface QuoteIssue {
  field: IssueField;
  /** Which QuoteSection owns this field — where the jump bar / footer sends
      the user when they tap Send with this issue outstanding. */
  section: SectionId;
  message: string;
  /** 'both' also blocks Save draft; 'send' only blocks Send to client. */
  blocks: 'both' | 'send';
  /** false for things the user cannot fix inside this form (a suspended
      subscription, a route refused by company policy). */
  fixable: boolean;
}

export interface CollectIssuesInput {
  subscriptionBlocked: boolean;
  subscriptionNotice: string | null | undefined;
  customerId: string;
  routeBlockedMessage: string;
  vehicleType: string;
  pickup: Loc | null;
  delivery: Loc | null;
  weightInvalid: boolean;
  weightKg: number;
  pickupDate: string;
  deliveryDate: string;
}

export function collectIssues({
  subscriptionBlocked,
  subscriptionNotice,
  customerId,
  routeBlockedMessage,
  vehicleType,
  pickup,
  delivery,
  weightInvalid,
  weightKg,
  pickupDate,
  deliveryDate,
}: CollectIssuesInput): QuoteIssue[] {
  const issues: QuoteIssue[] = [];

  // Same order save() checks in, so the first issue in this list is also the
  // first one save() itself would have refused on.
  if (subscriptionBlocked) {
    issues.push({
      field: 'subscription',
      section: 'client',
      message: subscriptionNotice || 'Subscription inactive',
      blocks: 'both',
      fixable: false,
    });
  }
  if (!customerId) {
    issues.push({
      field: 'client',
      section: 'client',
      message: 'Pick a client',
      blocks: 'both',
      fixable: true,
    });
  }
  if (routeBlockedMessage) {
    issues.push({
      field: 'route',
      section: 'route',
      message: routeBlockedMessage,
      blocks: 'both',
      fixable: false,
    });
  }

  // The rest only block Send — a draft can be saved with these missing.
  if (!vehicleType) {
    issues.push({
      field: 'vehicleType',
      section: 'client',
      message: 'Pick a vehicle type',
      blocks: 'send',
      fixable: true,
    });
  }
  if (!pickup?.lat) {
    issues.push({
      field: 'pickup',
      section: 'route',
      message: 'Set a collection point',
      blocks: 'send',
      fixable: true,
    });
  }
  if (!delivery?.lat) {
    issues.push({
      field: 'dropoff',
      section: 'route',
      message: 'Set a drop-off point',
      blocks: 'send',
      fixable: true,
    });
  }
  if (weightInvalid) {
    issues.push({
      field: 'weight',
      section: 'load',
      message: 'Enter a number, e.g. 1,5',
      blocks: 'send',
      fixable: true,
    });
  } else if (!(weightKg > 0)) {
    issues.push({
      field: 'weight',
      section: 'load',
      message: 'Add the load weight',
      blocks: 'send',
      fixable: true,
    });
  }
  if (!pickupDate) {
    issues.push({
      field: 'pickupDate',
      section: 'schedule',
      message: 'Pick a collection date',
      blocks: 'send',
      fixable: true,
    });
  }
  if (!deliveryDate) {
    issues.push({
      field: 'deliveryDate',
      section: 'schedule',
      message: 'Pick a delivery date',
      blocks: 'send',
      fixable: true,
    });
  }

  return issues;
}
