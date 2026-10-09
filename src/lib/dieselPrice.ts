// Which diesel price a quote is priced on. The rules live in
// features/bookings/quote/rules.ts (QUOTE-RULES.md §1); this is the shared entry
// point for screens outside the quote builder (insights, settings).
//
//  - OWN (fuel_price_mode, or on an older backend a fuel_price_per_litre that is
//    neither the 23.50 model default nor any official figure) → the own price.
//  - Otherwise the official price in force for the company's zone.
//  - No official price → missing. Never a substituted number.
//
// Petrol (petrol and hybrid trucks) follows the same rule with its own mode
// (fuel_price_petrol_mode / fuel_price_petrol) and the official ULP 95 or 93
// price; on an older backend it is the company's own price only. Electric is
// the company's own price per kWh only.

export {
  resolveDiesel,
  resolvePetrol,
  hasPetrolRule,
  petrolGrade,
  officialPetrolFromLive,
  fuelFamily,
  fuelInputFromApi,
  dieselWarnings,
  officialFromLive,
  currentPeriodStart,
  LEGACY_DIESEL_SENTINEL,
  type DieselResolution,
  type DieselSource,
} from '@/features/bookings/quote/rules';
