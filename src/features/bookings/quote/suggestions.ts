// ── Truck suggestions for the Load section ──────────────────────────────────
// Mirrors web's QuoteBuilder.tsx (commit "Suggest trucks for the load, ranked
// by cargo and capacity"). With no vehicle type picked, the quote already
// infers a truck class to estimate fuel (see costs.ts inferFuelBasis) but
// keeps it hidden. This offers it instead: up to three trucks the fleet OWNS
// that can carry the load, ranked by cargo suitability then tightest
// capacity, each one tap away.
//
// Deliberately a separate rule from inferFuelBasis's, same as on web:
// inferFuelBasis picks whichever type burns LEAST at this weight and never
// steps backwards as weight rises — right for a hidden fuel estimate, wrong
// for something the user taps to SET THE RATE. "Cheapest to run" would put an
// 8t load on a 28t semi at R30/km instead of a rigid at R18/km. Keep both.
//
// Pure — no React/RN imports — so it stays unit-testable on its own, same
// reasoning as inferFuelBasis's own comment (costs.ts).

import type { VehicleType } from '../api';
import { capacityTons } from './types';

export type CargoClassKey = 'tanker' | 'reefer' | 'livestock' | 'car' | 'hazmat' | 'general';

interface CargoClass {
  key: Exclude<CargoClassKey, 'general'>;
  label: string;
  typeRe: RegExp;
  cargoRe: RegExp;
}

// Regexes and labels copied verbatim from web — this is the parity surface.
export const CARGO_CLASSES: CargoClass[] = [
  {
    key: 'tanker',
    label: 'liquid and bulk',
    typeRe: /tanker|bowser|bulk/i,
    cargoRe: /fuel|diesel|petrol|oil|chemical|liquid|milk|water|acid|lpg|gas|slurry|molasses/i,
  },
  {
    key: 'reefer',
    label: 'temperature-controlled',
    typeRe: /reefer|refriger|chill|frozen|cold/i,
    cargoRe: /frozen|chilled|refrigerat|perishable|fresh|meat|dairy|produce|vaccine|ice ?cream/i,
  },
  {
    key: 'livestock',
    label: 'livestock',
    typeRe: /livestock|cattle|animal/i,
    cargoRe: /livestock|cattle|sheep|goat|pig|poultry|animal/i,
  },
  {
    key: 'car',
    label: 'vehicles',
    typeRe: /car ?carrier|vehicle ?carrier|transporter/i,
    cargoRe: /cars?|vehicles?|bakkies?|tractors?/i,
  },
  {
    key: 'hazmat',
    label: 'dangerous goods',
    typeRe: /danger|hazmat|explosive/i,
    cargoRe: /danger|hazard|explosive|flammable|toxic|corrosive/i,
  },
];

/** Which cargo class a vehicle type is built for; "general" = carries anything. */
export function typeCargoClass(name: string): CargoClassKey {
  return CARGO_CLASSES.find((c) => c.typeRe.test(name || ''))?.key ?? 'general';
}

/** What Cargo reads as, as a class; "general" when it says nothing specific. */
export function describedCargoClass(text: string): CargoClassKey {
  return CARGO_CLASSES.find((c) => c.cargoRe.test(text || ''))?.key ?? 'general';
}

export function cargoClassLabel(key: CargoClassKey): string {
  return CARGO_CLASSES.find((c) => c.key === key)?.label ?? 'general freight';
}

// available_vehicle_count answers "can we run this right now"; owned_vehicle_count
// answers "does this fleet run this type at all" — the question a suggestion
// needs, since a load quoted today can run weeks out. Degrades in two steps
// rather than defaulting to 1: that would invent ownership for a shared
// platform-default row the company owns none of and make "you own 1 of
// these" a lie. available_vehicle_count is a safe fallback because
// available ⊆ owned — it can only under-report, never suggest a truck that
// doesn't exist. Both absent (pre-availability backend) => 0, and the whole
// block silently doesn't render.
export function ownedCount(v: VehicleType): number {
  if (v.owned_vehicle_count != null) return v.owned_vehicle_count;
  if (v.available_vehicle_count != null) return v.available_vehicle_count;
  return 0;
}

export interface TruckSuggestion {
  vt: VehicleType;
  name: string;
  /** Rated capacity in tonnes — never null (filtered candidates only). */
  cap: number;
  cls: CargoClassKey;
  rank: number;
  owned: number;
  /** How much spare capacity this load leaves, rounded to 1dp. <= 0 reads as an exact fit. */
  spare: number;
  /** "R38.00/km" style, or "—" when the type has no rate configured. */
  rate: string;
  /** Estimated L/100km for this weight on this truck. */
  burn: number;
  /** Short card tag: "Best fit" / "General freight" / "Check cargo fit". */
  fitLabel: string;
}

function formatRate(baseRate: number | undefined): string {
  const r = Number(baseRate);
  return Number.isFinite(r) && r > 0 ? `R${r.toFixed(2)}/km` : '—';
}

function fitLabelFor(cls: CargoClassKey, wanted: CargoClassKey): string {
  if (wanted !== 'general') {
    if (cls === wanted) return 'Best fit';
    if (cls === 'general') return 'General freight';
    return 'Check cargo fit';
  }
  return cls === 'general' ? 'General freight' : 'Check cargo fit';
}

export interface SuggestTrucksInput {
  types: VehicleType[] | undefined;
  /** parseNum(weight) result — null when the field is empty/unparseable. */
  tonnes: number | null;
  cargo: string;
  /** A picked type suppresses suggestions entirely — never second-guess a choice. */
  vehicleType: string;
}

/**
 * Up to three trucks worth offering for this load, best first. Empty when a
 * type is already selected, the weight is empty/invalid, or nothing owned
 * can carry it.
 */
export function suggestTrucks({
  types,
  tonnes,
  cargo,
  vehicleType,
}: SuggestTrucksInput): TruckSuggestion[] {
  if (vehicleType) return [];
  if (!(tonnes && tonnes > 0)) return [];

  // De-duplicated by name, first occurrence wins — mirrors inferFuelBasis
  // (costs.ts), which ranks over web's pre-deduped allVehicleTypes. Without
  // this, two identical rows could eat two of the three slots.
  const seen = new Set<string>();
  const deduped = (types ?? []).filter((v) => (seen.has(v.name) ? false : (seen.add(v.name), true)));

  const wanted = describedCargoClass(cargo);

  const candidates = deduped
    .filter((v) => ownedCount(v) > 0)
    .map((v) => ({ vt: v, cap: capacityTons(v.capacity) }))
    .filter((x): x is { vt: VehicleType; cap: number } => x.cap != null && x.cap >= tonnes);

  return candidates
    .map((x) => {
      const cls = typeCargoClass(x.vt.name);
      // 0 best. A truck built for the named cargo wins outright; otherwise
      // general freight; a truck built for some OTHER cargo ranks last.
      const rank =
        wanted !== 'general'
          ? cls === wanted
            ? 0
            : cls === 'general'
              ? 1
              : 2
          : cls === 'general'
            ? 0
            : 1;
      const owned = ownedCount(x.vt);
      const spare = Math.round((x.cap - tonnes) * 10) / 10;
      const burn =
        (Number(x.vt.fuel_consumption_l_per_100km) || 32) *
        Math.pow(1 + (Number(x.vt.fuel_consumption_sensitivity_pct) || 2) / 100, tonnes - x.cap);
      const suggestion: TruckSuggestion = {
        vt: x.vt,
        name: x.vt.name,
        cap: x.cap,
        cls,
        rank,
        owned,
        spare,
        rate: formatRate(x.vt.base_rate),
        burn,
        fitLabel: fitLabelFor(cls, wanted),
      };
      return suggestion;
    })
    .sort((a, b) => a.rank - b.rank || a.cap - b.cap)
    .slice(0, 3);
}
