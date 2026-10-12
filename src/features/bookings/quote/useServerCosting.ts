import { useEffect, useRef, useState } from 'react';
import { postData } from '@/lib/api/client';
import type { CostingInputs, QuoteWarning } from './rules';
import type { RatedBurn } from './fleetFuel';

// POST quotes/cost-breakdown/ (QUOTE-RULES §10): the backend's own costing for
// the builder's inputs. The builder prices locally (instantly) with the same
// rules; what only the server knows (the approved driver allowance, the
// fleet's operating cost per class, the official diesel resolution) is taken
// from the server's resolved `inputs`, so both land on the same cent.
//
// Older backends don't have the endpoint: a 404 switches it off for the
// session and the builder keeps its local inputs. Never blocks the UI.

const ENDPOINT = 'quotes/cost-breakdown/';
let unavailable = false;

export interface ServerCosting {
  inputs: CostingInputs;
  floor: number | null;
  warnings: QuoteWarning[];
  /** The server's suggested truck for this load (resolution.suggested_vehicle_type_id). */
  suggestedVehicleTypeId: number | string | null;
  /** The payload's _suggest_key this answer was for. */
  forKey: string | null;
  /** The truck fuel figure priced on (resolution.rated_burn): measured by Cartrack, your figure or the standard estimate. */
  ratedBurn: RatedBurn | null;
  /** Where an approved allowance rate comes from, e.g. 'NBCRFLI minimum R 243,63/night (from 1 Mar 2026)'. */
  driverRateDetail: string | null;
}

/**
 * The last server costing. Company-level inputs (diesel, driver rate,
 * settings) carry over between requests, so the figures don't flicker while
 * the next one is in flight; costs.ts only takes the per-truck operating cost
 * when the server priced the same truck.
 */
export function useServerCosting(payload: Record<string, unknown> | null): ServerCosting | null {
  return useServerCostingState(payload).costing;
}

/**
 * Same, plus whether the answer for the CURRENT payload has come back (or the
 * request failed / the endpoint doesn't exist, so none is coming). `costing`
 * keeps showing the previous answer meanwhile; `settled` is for the few
 * decisions that must not be taken on stand-in company figures, such as the
 * reopen "costs changed" notice (web fbe0c68: a false "Costs up" on a quote
 * that hasn't changed).
 */
export function useServerCostingState(payload: Record<string, unknown> | null): {
  costing: ServerCosting | null;
  settled: boolean;
} {
  const [result, setResult] = useState<{ key: string; value: ServerCosting } | null>(null);
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const reqRef = useRef(0);
  const key = payload ? JSON.stringify(payload) : '';

  useEffect(() => {
    if (!payload || unavailable) return;
    const id = ++reqRef.current;
    const t = setTimeout(async () => {
      try {
        const { _suggest_key: forKey, ...data } = payload as Record<string, unknown>;
        const res = await postData<Record<string, unknown>>({ url: ENDPOINT, data });
        if (id !== reqRef.current) return;
        if (!res || res.success !== true || typeof res.inputs !== 'object') {
          setSettledKey(key); // an answer with no costing in it: none is coming
          return;
        }
        setSettledKey(key);
        setResult({
          key,
          value: {
            inputs: res.inputs as CostingInputs,
            floor: typeof res.floor === 'number' ? res.floor : null,
            warnings: Array.isArray(res.warnings) ? (res.warnings as QuoteWarning[]) : [],
            forKey: typeof forKey === 'string' ? forKey : null,
            ratedBurn:
              ((res.resolution as Record<string, unknown> | undefined)?.rated_burn as RatedBurn | null | undefined) ??
              null,
            driverRateDetail: (() => {
              const d = (res.resolution as Record<string, unknown> | undefined)?.driver_rate_detail;
              return typeof d === 'string' && d ? d : null;
            })(),
            suggestedVehicleTypeId:
              ((res.resolution as Record<string, unknown> | undefined)?.suggested_vehicle_type_id as
                | number
                | string
                | null
                | undefined) ?? null,
          },
        });
      } catch (e) {
        // No endpoint on this backend (or method not allowed / not built).
        if ([404, 405, 501].includes(Number((e as { status?: number })?.status))) unavailable = true;
        if (id === reqRef.current) setSettledKey(key);
      }
    }, 600);
    return () => clearTimeout(t);
    // `key` captures every field of the payload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const costing = result?.value ?? null;
  return { costing, settled: !payload || unavailable || settledKey === key };
}
