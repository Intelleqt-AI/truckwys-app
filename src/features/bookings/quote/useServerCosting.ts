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
}

/**
 * The last server costing. Company-level inputs (diesel, driver rate,
 * settings) carry over between requests, so the figures don't flicker while
 * the next one is in flight; costs.ts only takes the per-truck operating cost
 * when the server priced the same truck.
 */
export function useServerCosting(payload: Record<string, unknown> | null): ServerCosting | null {
  const [result, setResult] = useState<{ key: string; value: ServerCosting } | null>(null);
  const reqRef = useRef(0);
  const key = payload ? JSON.stringify(payload) : '';

  useEffect(() => {
    if (!payload || unavailable) return;
    const id = ++reqRef.current;
    const t = setTimeout(async () => {
      try {
        const { _suggest_key: forKey, ...data } = payload as Record<string, unknown>;
        const res = await postData<Record<string, unknown>>({ url: ENDPOINT, data });
        if (id !== reqRef.current || !res || res.success !== true || typeof res.inputs !== 'object') return;
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
      }
    }, 600);
    return () => clearTimeout(t);
    // `key` captures every field of the payload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return result?.value ?? null;
}
