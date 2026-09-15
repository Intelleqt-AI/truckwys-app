import type { Loc, SectionId } from './types';
import type { WinModelTier } from '../api';

// Single source of truth for "can this quote be saved / sent, and why not."
// The rules here are exactly the guard clauses save() already enforces
// (CreateQuoteScreen.tsx) — this doesn't change what's allowed, only how it's
// communicated (inline errors + a footer strip instead of a toast after the
// fact). save() keeps its own guard clauses as a last line of defence; once
// this is wired they simply become unreachable.

export type IssueField =
  | 'subscription'
  | 'client'
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
  pickup: Loc | null;
  delivery: Loc | null;
  weightInvalid: boolean;
  weightKg: number;
  pickupDate: string;
  deliveryDate: string;
}

// The four inputs `ready` gates pricing on, as a list rather than a boolean, so
// the footer strip and the Price section can say *which* of them is missing
// instead of both guessing "a route". Separate from collectIssues because these
// are pricing prerequisites, not save/send blockers.
//
// Vehicle type is deliberately NOT one of these gaps (mirrors web's
// QuoteBuilder.tsx) — a fleet quoting a load a month out often doesn't know
// yet which truck will be free. Without one the quote prices on company
// defaults and an inferred reference truck (quote/costs.ts inferFuelBasis);
// it's no longer required to save or send a quote at all.
export interface PriceGap {
  field: 'client' | 'route' | 'weight';
  /** Where the footer hint jumps to when tapped. */
  section: SectionId;
  /** List item, joined by formatGapList: "Add a client and a route to see pricing." */
  noun: string;
}

export interface MissingPriceInputsArg {
  customerId: string;
  pickup: Loc | null;
  delivery: Loc | null;
  weightKg: number;
}

/**
 * Ordered to match the form's own top-down sections, so the footer hint advances
 * as the user fills the sheet rather than jumping around. Wording is deliberately
 * the same as collectIssues' ('Pick a client') so the strip and the inline field
 * errors read as one voice.
 */
export function missingPriceInputs({
  customerId,
  pickup,
  delivery,
  weightKg,
}: MissingPriceInputsArg): PriceGap[] {
  const gaps: PriceGap[] = [];

  if (!customerId) {
    gaps.push({ field: 'client', section: 'client', noun: 'a client' });
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

// ── AI pricing "not ready" banner copy ──────────────────────────────────────
// Mirrors web's QuoteBuilder.tsx awaitingCopy (commit 79c1eda). ai_prediction
// is a real model that couldn't price THIS point — a different situation from
// no model existing at all — so its `reason` is checked first; `blocker` (the
// two-tier training-progress gate) is the fallback for "no model yet".

export interface AwaitingAiCopy {
  title: string;
  /** '' (matches web exactly, not null) when there's nothing more useful to
      say than the title. */
  detail: string;
}

export function awaitingAiCopy(
  /** ai_prediction.reason when available === false; null/undefined otherwise
      (including when a model IS available — see selectWinBlocker below for
      why that case never reaches here in practice). */
  reason: string | null | undefined,
  winBlocker: WinModelTier['blocker'] | null | undefined,
): AwaitingAiCopy {
  if (reason === 'optimizer_error') {
    return { title: 'AI pricing hit a snag.', detail: '' };
  }
  if (reason === 'model_curve_unusable') {
    return {
      title: 'AI pricing needs a bit more data at this price point.',
      detail: 'Priced on your company rate for now — try a nearby price and the AI should pick back up.',
    };
  }
  if (winBlocker === 'needs_lost_quotes') {
    return {
      title: 'AI pricing needs some lost quotes too.',
      detail: "A model can't learn what loses a deal until some quotes are marked lost — or left to expire.",
    };
  }
  if (winBlocker === 'needs_won_quotes') {
    return {
      title: 'AI pricing needs some won quotes too.',
      detail: "A model needs deals that landed as well as ones that didn't.",
    };
  }
  if (winBlocker === 'awaiting_retrain') {
    return {
      title: 'AI pricing is training tonight.',
      detail: 'Enough quotes have closed — the model builds on the next nightly run.',
    };
  }
  if (winBlocker === 'ml_unavailable') {
    return {
      title: 'AI pricing is unavailable.',
      detail: "The prediction libraries aren't installed on this server.",
    };
  }
  // Default covers 'insufficient_data' and no blocker at all (stats not yet loaded).
  return { title: "AI pricing isn't ready yet.", detail: 'Every quote you close sharpens it.' };
}

/**
 * Which tier's blocker actually explains the "not ready" state — mirrors
 * web's QuoteBuilder.tsx winTier selection. The user tier is preferred once it
 * either has no blocker or has passed the count gate (qualifies); otherwise
 * the global tier's blocker is the more informative one to show, since a
 * blocked user tier under its own count floor is just "insufficient_data"
 * again and the global tier may know something more specific (e.g. the whole
 * platform is awaiting_retrain).
 */
export function selectWinBlocker(
  user: WinModelTier | null | undefined,
  global: WinModelTier | null | undefined,
): WinModelTier['blocker'] | null {
  const tier = user?.blocker == null || user?.qualifies ? user : global;
  return tier?.blocker ?? global?.blocker ?? null;
}
