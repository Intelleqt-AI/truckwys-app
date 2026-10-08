import { useEffect, useRef, useState } from 'react';
import { postData } from '@/lib/api/client';
import type { TonnageCosting } from './rules';

// POST quotes/pricing-analysis/ with pricing_basis "per_tonne": the server's
// tonnage costing (every eligible truck, priced on the safest unless one is
// chosen), the market per tonne and three rates. The builder shows its own
// computeTonnage() until this lands. Never blocks the UI.

export interface TonnageMarket {
  available: boolean;
  p25: number | null;
  median: number | null;
  p75: number | null;
  n: number;
  tier_label: string;
}
export interface TonnageChoice {
  key: string;
  label: string;
  rate_per_tonne: number;
  margin_pct: number | null;
}
export interface TonnageAnalysis {
  costing: TonnageCosting;
  market: TonnageMarket | null;
  choices: TonnageChoice[];
  /** The payload this answer was for (JSON). */
  forKey: string;
}

export function useTonnageAnalysis(payload: Record<string, unknown> | null): TonnageAnalysis | null {
  const [result, setResult] = useState<TonnageAnalysis | null>(null);
  const reqRef = useRef(0);
  const key = payload ? JSON.stringify(payload) : '';
  useEffect(() => {
    if (!payload) return;
    const id = ++reqRef.current;
    const t = setTimeout(async () => {
      try {
        const res = await postData<Record<string, unknown>>({ url: 'quotes/pricing-analysis/', data: payload });
        if (id !== reqRef.current || !res || res.pricing_basis !== 'per_tonne' || !res.costing) return;
        setResult({
          costing: res.costing as TonnageCosting,
          market: (res.market_per_tonne as TonnageMarket | undefined) ?? null,
          choices: Array.isArray(res.choices) ? (res.choices as TonnageChoice[]) : [],
          forKey: key,
        });
      } catch {
        // Older backend or offline: the local figures stay.
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return payload ? result : null;
}
