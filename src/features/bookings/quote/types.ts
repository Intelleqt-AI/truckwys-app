// ── Quote builder shared types & pure helpers ───────────────────────────────
// Moved out of CreateQuoteScreen.tsx verbatim (Phase 0 extraction) — no
// behaviour change. Every comment below documents a real past bug; keep them.

export interface Loc {
  label: string;
  lat: number;
  lon: number;
  cc?: string;
}

// Native map projections and pasted links can carry 15-17 significant digits
// of floating-point noise. The backend's lat/lng columns are
// DecimalField(max_digits=12, decimal_places=7), so anything unrounded blows
// past max_digits and the save is rejected outright.
export const roundCoord = (n: number) => Number(n.toFixed(7));

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

export const FUEL_FALLBACK: Record<string, number> = {
  Flatbed: 32,
  Tautliner: 33,
  Refrigerated: 38,
  Tanker: 35,
  'Box Truck': 28,
  'Danger Load': 34,
};

// VehicleType.capacity is *documented* as tonnes but real rows are a mix —
// only the seeded defaults were unit-fixed (see the backend's migration
// history), so hand-added or imported rows can still be kilograms. Same
// >999 => kg heuristic the backend uses (core/services/vehicle_types.py
// capacity_tonnes), so a 20000 kg row doesn't get read as a 20,000-tonne
// truck by the overload guard, the fuel formula's reference tonnage, or the
// vehicle-type dropdown's "(20t)" label. Returns null when the value can't be
// believed as either unit — callers must then treat capacity as unknown
// rather than guess (mirrors web's QuoteBuilder.tsx capacityTons).
const KG_SCALE_THRESHOLD = 999;
const MIN_PLAUSIBLE_T = 0.3;
const MAX_PLAUSIBLE_T = 80;
export function capacityTons(raw: unknown): number | null {
  const v = Number(raw);
  if (!Number.isFinite(v) || v <= 0) return null;
  const t = v > KG_SCALE_THRESHOLD ? v / 1000 : v;
  return t >= MIN_PLAUSIBLE_T && t <= MAX_PLAUSIBLE_T ? t : null;
}

// Which company default price applies, keyed by the selected vehicle type's own
// fuel_type. Company stores one default per fuel type, and fuel_price_per_litre
// doubles as the Diesel one because it predates the other three.
//
// The mapping lives here rather than server-side because nothing in the backend
// reads these fields — it still costs everything as diesel — so both clients
// resolve it themselves and must agree.
export const FUEL_PRICE_FIELD_BY_TYPE: Record<string, string> = {
  Diesel: 'fuel_price_per_litre',
  Petrol: 'fuel_price_petrol',
  Electric: 'fuel_price_electric',
  Hybrid: 'fuel_price_hybrid',
};

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
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
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
