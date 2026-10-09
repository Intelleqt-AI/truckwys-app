// ── Quote builder shared types & pure helpers ───────────────────────────────
// Moved out of CreateQuoteScreen.tsx verbatim (Phase 0 extraction) — no
// behaviour change. Every comment below documents a real past bug; keep them.

import { localDatePlusDays } from '@/lib/dates';
import { capacityTonnes } from './rules';

export interface Loc {
  label: string;
  lat: number;
  lon: number;
  cc?: string;
}

// roundCoord/round2 now live in src/lib/formatters.ts (next to parseNum) so
// every screen shares one rounding helper instead of each quietly growing
// its own — re-exported here so existing `from './types'` imports keep
// working unchanged.
export { roundCoord, round2 } from '@/lib/formatters';

export interface StopEntry {
  /** Client-side only — never sent anywhere, just a stable React key. */
  id: string;
  loc: Loc | null;
}

/** A stop target carries which stop it is, so confirming writes back to the right row. */
export type PickTarget = 'pickup' | 'dropoff' | { stop: string };

export type LocSuggest = Loc & { foreign: boolean; country: string; isRecent?: boolean };

// The five visible groupings of the quote form (Phase 2 — jump bar + section
// headers). Shared between the screen, QuoteJumpBar and (from Phase 3 on)
// validation.ts, so a field's section assignment is declared in exactly one
// place.
export type SectionId = 'client' | 'route' | 'load' | 'schedule' | 'price';

// VehicleType.capacity is documented as tonnes but real rows are a mix: values
// above 100 are kilograms (QUOTE-RULES.md §3). Null when not a positive number.
// The one normaliser for the overload check, the fuel formula and the labels.
export function capacityTons(raw: unknown): number | null {
  return capacityTonnes(raw);
}

// Heuristic 3-letter lane code (mirrors web QuoteBuilder.tsx's extractCode).
//
// These codes are not cosmetic: analyzeQuote and benchmarkQuote key off them, and
// an unrecognised address falls through to the first three letters of whatever
// string arrives — which lands the quote in a junk lane, so the market rate
// resolves to nothing and AI pricing silently drops to a cost anchor.
//
// Durban is deliberately DUR here, matching QuoteBuilder.tsx's own extractCode
// — not DBN. Web's two quote screens disagree with each other on this
// (NewQuote.tsx's separate extractCode returns DBN, with a comment claiming
// that's the backend's canonical code); QuoteBuilder.tsx is the screen this
// file mirrors, so its answer is the one to match, unresolved inconsistency
// and all, rather than "fixing" it to a value neither client screen agrees on.
//
// The municipality names matter for the same reason. SA metros are named
// after their municipality and both the geocoder and TomTom's suggestions return
// that name, so a pin on Church Square used to arrive as "Tshwane" and score
// "TSH" rather than PTA.
export function extractCode(s: string): string {
  const t = s.toLowerCase();
  if (/johannesburg|joburg|jhb|ekurhuleni/.test(t)) return 'JHB';
  if (/cape town|cpt/.test(t)) return 'CPT';
  if (/durban|dbn|dur|ethekwini/.test(t)) return 'DUR';
  if (/port elizabeth|gqeberha|nelson mandela bay|pe/.test(t)) return 'PE';
  if (/pretoria|pta|tshwane/.test(t)) return 'PTA';
  if (/bloemfontein|bfn|mangaung/.test(t)) return 'BFN';
  return s.trim().slice(0, 3).toUpperCase();
}

export function plusDays(days: number): string {
  return localDatePlusDays(days);
}

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// A location is cross-border when its country code isn't South Africa.
export const isForeignCc = (cc?: string) => {
  if (!cc) return false;
  const c = cc.replace(/\s/g, '').toUpperCase();
  return c !== '' && !['ZA', 'ZAF', 'SOUTHAFRICA'].includes(c);
};
