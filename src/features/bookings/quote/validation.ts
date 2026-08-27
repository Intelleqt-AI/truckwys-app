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

// The five inputs `ready` gates pricing on, as a list rather than a boolean, so
// the footer strip and the Price section can say *which* of them is missing
// instead of both guessing "a route". Separate from collectIssues because these
// are pricing prerequisites, not save/send blockers — vehicleType, for one,
// only blocks Send but is needed before a price can be worked out at all.
export interface PriceGap {
  field: 'client' | 'vehicleType' | 'route' | 'weight';
  /** Where the footer hint jumps to when tapped. */
  section: SectionId;
  /** List item, joined by formatGapList: "Add a client and a route to see pricing." */
  noun: string;
}

export interface MissingPriceInputsArg {
  customerId: string;
  vehicleType: string;
  pickup: Loc | null;
  delivery: Loc | null;
  weightKg: number;
}

/**
 * Ordered to match the form's own top-down sections, so the footer hint advances
 * as the user fills the sheet rather than jumping around. Wording is deliberately
 * the same as collectIssues' ('Pick a client', 'Pick a vehicle type') so the strip
 * and the inline field errors read as one voice.
 */
export function missingPriceInputs({
  customerId,
  vehicleType,
  pickup,
  delivery,
  weightKg,
}: MissingPriceInputsArg): PriceGap[] {
  const gaps: PriceGap[] = [];

  if (!customerId) {
    gaps.push({ field: 'client', section: 'client', noun: 'a client' });
  }
  if (!vehicleType) {
    gaps.push({ field: 'vehicleType', section: 'client', noun: 'a vehicle type' });
  }
  // Collection and drop-off collapse into one gap: the strip is a single line,
  // and the inline LocationField errors already tell the two apart.
  if (!pickup?.lat || !delivery?.lat) {
    gaps.push({ field: 'route', section: 'route', noun: 'a route' });
  }
  // Weight changes the price itself (surcharge above threshold, plus the
  // toll/route estimate), so an unset weight isn't just a Send-blocker like
  // pickup/delivery dates — it's a genuine pricing prerequisite.
  if (!(weightKg > 0)) {
    gaps.push({ field: 'weight', section: 'load', noun: 'the load weight' });
  }

  return gaps;
}

/**
 * Joins gap nouns into one English list: "a client, a vehicle type and a
 * route". Shared by the footer hint and the Price section's empty state so
 * both name every outstanding requirement, not just the first.
 */
export function formatGapList(gaps: PriceGap[]): string {
  const nouns = gaps.map((g) => g.noun);
  return nouns.length > 1 ? `${nouns.slice(0, -1).join(', ')} and ${nouns.at(-1)}` : (nouns[0] ?? '');
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

  // pickup/dropoff are the exception: the backend has no draft-specific
  // relaxation for pickup_location/delivery_location (non-blank, required
  // unconditionally), so unlike the rest of this block they block both.
  if (!pickup?.lat) {
    issues.push({
      field: 'pickup',
      section: 'route',
      message: 'Set a collection point',
      blocks: 'both',
      fixable: true,
    });
  }
  if (!delivery?.lat) {
    issues.push({
      field: 'dropoff',
      section: 'route',
      message: 'Set a drop-off point',
      blocks: 'both',
      fixable: true,
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
