// Pure tonnage builder rules shared with the web (src/lib/tonnage.ts there).
// No imports, so `node --test` runs them directly.

/**
 * Truck unknown: the builder routes and prices on the tonnage basis truck, and
 * the basis can depend on that route (toll class), so following it could flip
 * back and forth. One rule for web and app:
 *  - only a basis worked out on known costs (basis_reason "safest") is followed;
 *    one picked while costs were unknown is never held on to;
 *  - a new set of inputs (key: tonnes, lane, trip, cargo; not the truck) starts
 *    afresh;
 *  - A -> B -> A within one key holds the current truck (`held`): the builder
 *    then prices on that truck by id, so the Truck field, the price card and
 *    the "Priced on" line always name the same truck.
 */
export interface AutoBasis {
  key: string;
  name: string | null;
  flips: string[];
  held: boolean;
}
export const AUTO_BASIS_START: AutoBasis = { key: '', name: null, flips: [], held: false };
export function nextAutoBasis(
  state: AutoBasis,
  key: string,
  basisName: string | null | undefined,
  reason: string | null | undefined,
): AutoBasis {
  const s = key !== state.key ? { key, name: state.name, flips: [], held: false } : state;
  if (reason !== 'safest' || !basisName || basisName === s.name || s.held) return s;
  const flips = [...s.flips, basisName];
  if (flips.length >= 3 && flips[flips.length - 1] === flips[flips.length - 3]) return { ...s, flips, held: true };
  return { ...s, flips, name: basisName };
}

/** "30 t", "28,5 t" */
const tTxt = (n: number) => `${String(Math.round(n * 1000) / 1000).replace('.', ',')} t`;

/** The most the next call-off can carry: what is left, and no more than the
 *  largest eligible truck (the server's cap, same on web and app). */
export function callOffCap(c: { remaining_tonnes: number; max_tonnes_per_load?: number | null }): number {
  return c.max_tonnes_per_load != null ? Math.min(c.remaining_tonnes, c.max_tonnes_per_load) : c.remaining_tonnes;
}

/** Call-off tonnes as typed -> number, or the reason it can't be booked. */
export function checkCallOff(text: string, cap: number): { tonnes: number | null; error: string | null } {
  const t = text.replace(/\s/g, '').replace(',', '.');
  const n = Number(t);
  if (t === '' || !Number.isFinite(n) || !/^\d+(\.\d{1,3})?$/.test(t)) return { tonnes: null, error: 'Enter the tonnes, e.g. 28,5.' };
  if (n < 0.1) return { tonnes: null, error: 'A load is at least 0,1 t.' };
  if (n > cap + 1e-9) return { tonnes: null, error: `Up to ${tTxt(cap)} on this load.` };
  return { tonnes: n, error: null };
}
