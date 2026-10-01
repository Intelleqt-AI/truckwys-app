import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchData, postData } from '@/lib/api/client';
import { pick } from '@/lib/api/list';
import { loadCache, saveCache, readAvail, writeAvail, type Entry } from './cache';
import {
  TOPICS,
  choiceKey,
  classify,
  failureText,
  type ApiError,
  type Choice,
  type Combination,
  type Failure,
  type ItemKey,
  type Review,
  type ReviewItem,
  WIN_REASON_COPY,
  joinWords,
  ITEM_WORDS,
  kindOf,
} from './types';
import { formatNumber, formatPercent } from '@/lib/formatters';

const ENDPOINT = 'quotes/ai-price-analysis/';
/** A cooldown that comes back without a Retry-After falls back to this. */
const COOLDOWN_DEFAULT_S = 20;

export interface PriceCheckInputs {
  /** False while the form isn't ready: the hook keeps its result but offers nothing. */
  active: boolean;
  /** True only when the route was calculated for the current inputs. */
  routeReady: boolean;
  /** The last route calculation failed (nothing to check against). */
  routeError?: boolean;
  routeData: Record<string, unknown> | null;
  /** The selected route (road type, terrain, toll plazas...). */
  route: Record<string, unknown>;
  total: number;
  chargeDistance: number;
  oneWayDistance: number;
  legs: number;
  tripType: string;
  durationMinutes: number | null;
  origin: string;
  destination: string;
  vehicleType: string;
  weightKg: number;
  customerId?: string | null;
  fuelCost: number;
  fuelLitres: number;
  fuelConsumption: number;
  fuelPricePerL: number;
  fuelType: string;
  fuelZone: string | null;
  tollCost: number;
  driverAllowance: number;
  crossBorderCost: number;
  baseRatePerKm: number;
  pickupDate?: string | null;
  /** Lane benchmark, when loaded. */
  marketAvgRate: number;
  billingBlocked: boolean;
  quoteId?: number | string | null;
  /** The choice key of the market figures applied to this quote, if any. */
  appliedKey: string | null;
}

/** What the price bar needs to offer the market price. */
export interface PriceCheckOffer {
  review: Review;
  key: string;
  price: number;
  needsApply: boolean;
}

export function usePriceCheck(p: PriceCheckInputs) {
  const reqIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const [cache, setCache] = useState<Record<string, Entry>>({});
  // The trip of the last check run from here (for "Out of date").
  const [lastSig, setLastSig] = useState<string | null>(null);
  const [loadingSince, setLoadingSince] = useState<number | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [avail, setAvail] = useState<'yes' | 'no' | null>(readAvail);
  const [now, setNow] = useState(() => Date.now());

  // Persisted results from earlier (this launch or the last 12 hours).
  useEffect(() => {
    let cancelled = false;
    void loadCache().then((stored) => {
      if (!cancelled) setCache((prev) => ({ ...stored, ...prev }));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The trip itself: anything here changing means the check was for a different
  // job. The four priced items are compared separately below, because Apply
  // legitimately moves them.
  const laneSig = JSON.stringify([
    p.origin,
    p.destination,
    p.vehicleType,
    p.chargeDistance,
    p.legs,
    p.durationMinutes,
    Math.round(p.fuelLitres * 100) / 100,
    p.crossBorderCost,
    p.fuelType,
    p.fuelZone,
  ]);
  // Inputs only the win chance depends on (the price doesn't).
  const winSig = JSON.stringify([p.customerId || null, p.pickupDate || null, p.weightKg]);

  // Does this backend have the endpoint? Once per launch. A GET is free: 405
  // means it exists, 404 means the backend isn't deployed yet.
  useEffect(() => {
    if (avail !== null || !p.active) return;
    let cancelled = false;
    fetchData(ENDPOINT)
      .then(() => {
        if (cancelled) return;
        writeAvail('yes');
        setAvail('yes');
      })
      .catch((e: ApiError) => {
        if (cancelled) return;
        if (e?.status === 404) {
          writeAvail('no');
          setAvail('no');
        } else if (e?.status) {
          writeAvail('yes');
          setAvail('yes');
        }
        // No response at all (offline): leave unknown; a check will tell.
      });
    return () => {
      cancelled = true;
    };
  }, [avail, p.active]);

  // Clock for "4 s", "Try again in 18 s" and "Checked 2 min ago".
  const fast = loadingSince !== null || (failure?.until != null && failure.until > now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), fast ? 1000 : 30000);
    return () => clearInterval(id);
  }, [fast]);
  const secsLeft = failure?.until != null ? Math.ceil((failure.until - now) / 1000) : null;
  // A countdown that has run out is over: the card goes back to normal.
  useEffect(() => {
    if (
      failure?.until != null &&
      secsLeft != null &&
      secsLeft <= 0 &&
      (failure.code === 'cooldown' || failure.code === 'throttled')
    ) {
      setFailure(null);
    }
  }, [failure, secsLeft]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const runCheck = useCallback(async () => {
    // Never on a route that belongs to previous inputs (a paid run on mixed data).
    if (!p.active || !p.routeReady || !p.routeData || p.total <= 0 || loadingSince !== null) return;
    const reqId = ++reqIdRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    const sigAtRequest = laneSig;
    const winSigAtRequest = winSig;
    setLoadingSince(Date.now());
    setNow(Date.now());
    setFailure(null);
    let body: Review | null = null;
    let err: ApiError | null = null;
    try {
      body = await postData<Review>({
        url: ENDPOINT,
        data: {
          quote_id: p.quoteId ? Number(p.quoteId) : null,
          // Every check is started by the person (there is no automatic run).
          trigger_type: 'manual',
          distance_km: p.chargeDistance,
          one_way_distance_km: p.oneWayDistance,
          legs: p.legs,
          trip_type: p.tripType,
          duration_minutes: p.durationMinutes,
          origin: p.origin,
          destination: p.destination,
          vehicle_type: p.vehicleType,
          weight: p.weightKg,
          // Only used to score the win chance; never sent to OpenAI.
          customer_id: p.customerId ? Number(p.customerId) : null,
          fuel_cost: p.fuelCost,
          toll_cost: p.tollCost,
          driver_cost: p.driverAllowance,
          cross_border_cost: p.crossBorderCost,
          // The exact (unrounded) litres and price behind fuelCost.
          fuel_usage_litres: p.fuelLitres,
          fuel_price_used: p.fuelPricePerL,
          fuel_consumption_l_per_100km: p.fuelConsumption,
          fuel_type: p.fuelType,
          fuel_zone: p.fuelZone,
          base_rate_per_km: p.baseRatePerKm || 0,
          // Only when the lane benchmark has loaded (0 would read as "no market").
          ...(p.marketAvgRate > 0 ? { market_rate: p.marketAvgRate } : {}),
          pickup_date: p.pickupDate || null,
          route: {
            road_type: pick(p.route, ['road_type']) ?? null,
            terrain: pick(p.route, ['terrain']) ?? null,
            toll_breakdown: pick(p.route, ['toll_breakdown']) ?? null,
            traffic_status: pick(p.route, ['traffic_status']) ?? null,
            congested_km: pick(p.route, ['congested_km']) ?? null,
            country_codes: pick(p.route, ['country_codes']) ?? pick(p.routeData, ['countries']) ?? null,
            cross_border: !!pick(p.routeData, ['cross_border']),
          },
        },
        // Checks against stored figures take well under a second; an older
        // backend that still searches the web per check can take up to 55 s.
        config: { timeout: 60000, signal: controller.signal },
      });
    } catch (e) {
      err = (e as ApiError) || {};
    }
    if (reqId !== reqIdRef.current) return; // superseded or cancelled
    abortRef.current = null;
    setLoadingSince(null);
    if (controller.signal.aborted) return;

    const valid =
      !!body &&
      body.success === true &&
      !!body.combinations &&
      !!body.cost_breakdown &&
      !!body.default_choice_key &&
      !!body.combinations[body.default_choice_key];
    if (!valid) {
      const f = classify(err, err ? null : body);
      if (f.code === 'unavailable' && f.missing) {
        writeAvail('no');
        setAvail('no');
      }
      const secs = f.retryAfter ?? (f.code === 'cooldown' ? COOLDOWN_DEFAULT_S : null);
      setFailure({ code: f.code, until: secs ? Date.now() + secs * 1000 : null, missing: f.missing });
      return;
    }
    if (avail !== 'yes') {
      writeAvail('yes');
      setAvail('yes');
    }
    const review = body as Review;
    const entry: Entry = {
      review,
      laneSig: sigAtRequest,
      winSig: winSigAtRequest,
      at: Date.now(),
      choices: { ...review.combinations![review.default_choice_key!]!.choices },
    };
    setCache((c) => {
      const next = { ...c, [sigAtRequest]: entry };
      saveCache(next);
      return next;
    });
    setLastSig(sigAtRequest);
    // The inputs are read at call time; the signatures above decide staleness.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, loadingSince, laneSig, winSig, avail]);

  const cancelCheck = useCallback(() => {
    reqIdRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    setLoadingSince(null);
  }, []);

  // ── derived state ─────────────────────────────────────────────────────────
  const entry = cache[laneSig] || null;
  const review = entry?.review || null;
  const breakdown = (review?.cost_breakdown || {}) as Record<ItemKey, ReviewItem>;
  const combos = review?.combinations || {};
  const choices = entry?.choices;
  const currentKey = choices ? choiceKey(choices) : '';
  const combo: Combination | undefined = entry
    ? combos[currentKey] || combos[review!.default_choice_key!]
    : undefined;

  // Which side (yours / market) each line of the live quote is on right now.
  // null = it matches neither, i.e. someone changed it after the check.
  const currentLine: Record<ItemKey, number> = {
    fuel: p.fuelCost,
    tolls: p.tollCost,
    driver_allowance: p.driverAllowance,
    base_rate: p.baseRatePerKm || 0,
  };
  const sideOf = (t: ItemKey): Choice | null => {
    const item = breakdown[t];
    if (!item) return null;
    const mine = t === 'base_rate' ? Number(item.detail?.your_rate_per_km) : item.current_value_zar;
    const ai = t === 'base_rate' ? Number(item.detail?.ai_rate_per_km) : item.ai_value_zar;
    const tol = t === 'fuel' ? 0.5 : t === 'base_rate' ? 1e-6 : 0.005;
    if (Math.abs(currentLine[t] - mine) <= tol) return 'mine';
    if (Math.abs(currentLine[t] - ai) <= tol) return 'ai';
    return null;
  };
  const sides = entry ? TOPICS.map(sideOf) : [];
  const figuresChanged = !!entry && sides.some((s) => s === null);
  const hasResult = !!entry && !!combo && !figuresChanged;
  const outOfDate = (!!entry && figuresChanged) || (!entry && !!lastSig && !!cache[lastSig]);
  const quoteKey = hasResult
    ? choiceKey(Object.fromEntries(TOPICS.map((t, i) => [t, sides[i]!])) as Record<ItemKey, Choice>)
    : null;
  const delta = hasResult ? combo!.price_zar - p.total : 0;
  const needsApply = hasResult && (quoteKey !== currentKey || Math.abs(delta) >= 0.5);
  const toggleable = (review?.toggleable_items || []).filter((t) => breakdown[t]);
  const marketChosen = TOPICS.filter((t) => choices?.[t] === 'ai');
  const isApplied = hasResult && !needsApply && p.appliedKey === currentKey && marketChosen.length > 0;

  const setChoice = useCallback(
    (t: ItemKey, c: Choice) => {
      setCache((prev) => {
        const e = prev[laneSig];
        if (!e) return prev;
        const next = { ...prev, [laneSig]: { ...e, choices: { ...e.choices, [t]: c } } };
        saveCache(next);
        return next;
      });
    },
    [laneSig],
  );

  const loading = loadingSince !== null;
  const elapsed = loading ? Math.max(0, Math.floor((now - loadingSince!) / 1000)) : 0;
  const unavailable = avail === 'no' || failure?.code === 'unavailable' || failure?.code === 'budget';
  const waiting =
    (failure?.code === 'cooldown' || failure?.code === 'throttled') && secsLeft != null && secsLeft > 0;
  const canCheck = p.routeReady && !p.billingBlocked && !loading && !waiting;
  const failText = failure ? failureText(failure, secsLeft) : null;

  // Win chance (scored for the client / date / weight at check time).
  const winModel = review?.win_model;
  const winStale =
    !!entry && entry.winSig !== winSig && !!winModel?.available && combo?.win_probability != null;
  const winP = winModel?.available && !winStale ? (combo?.win_probability ?? null) : null;
  const winNote = winStale
    ? 'Client, date or weight changed. Re-check to update.'
    : winP != null
      ? `${winModel!.scope === 'user' ? 'From your quotes' : 'From platform quotes'} · ${formatNumber(winModel!.training_samples, { maximumFractionDigits: 0 })} closed`
      : WIN_REASON_COPY[winModel?.reason || ''] || WIN_REASON_COPY.not_enough_history!;
  const winText = winP != null ? formatPercent(winP * 100, 0) : 'Not scored';

  // Headline: the one figure the reader acts on.
  const matches = hasResult && !needsApply;
  const headLabel = matches
    ? 'Market check'
    : marketChosen.length === toggleable.length && toggleable.length > 0
      ? 'Market price'
      : marketChosen.length > 0
        ? 'Price with your picks'
        : 'Your figures';
  const anyUnverified = TOPICS.some((t) => breakdown[t] && kindOf(t, breakdown[t]) === 'unverified');
  // Nothing could be checked: never say the quote "matches" the market.
  const noneVerified =
    hasResult && TOPICS.every((t) => !breakdown[t] || kindOf(t, breakdown[t]) === 'unverified');
  const headNote = !hasResult
    ? ''
    : noneVerified && matches
      ? 'Your figures are kept'
      : isApplied
        ? 'Market figures in use'
        : matches
          ? toggleable.length === 0
            ? anyUnverified
              ? 'Nothing to change in the checked figures'
              : 'Your figures are at market'
            : 'You kept your own figures'
          : marketChosen.length > 0
            ? `With market ${joinWords(marketChosen.map((t) => ITEM_WORDS[t]))}`
            : 'Without the market changes';

  const offer: PriceCheckOffer | null =
    p.active && hasResult && review
      ? { review, key: currentKey, price: combo!.price_zar, needsApply }
      : null;

  return {
    // availability and run state
    avail,
    loading,
    elapsed,
    failure,
    failText,
    secsLeft,
    unavailable,
    waiting,
    canCheck,
    now,
    // the result
    entry,
    review,
    breakdown,
    combo,
    choices,
    currentKey,
    hasResult,
    outOfDate,
    figuresChanged,
    needsApply,
    isApplied,
    toggleable,
    marketChosen,
    matches,
    headLabel,
    headNote,
    noneVerified,
    winText,
    winNote,
    winStale,
    offer,
    // actions
    runCheck,
    cancelCheck,
    setChoice,
  };
}

export type PriceCheck = ReturnType<typeof usePriceCheck>;
