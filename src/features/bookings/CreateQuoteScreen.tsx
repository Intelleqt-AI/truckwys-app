import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, TextInput, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchData } from '@/lib/api/client';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  SheetScreen,
  Group,
  DetailRow,
  RoutePreview,
  ProfitCurve,
  SegmentedControl,
  SelectField,
  TextField,
  DateField,
  Badge,
  Button,
  Icon,
  Txt,
  Mono,
  Label,
  type CurvePoint,
} from '@/components/ui';
import {
  useVehicleTypes,
  useCompanyProfileData,
  useFuelPrice,
  useModelStats,
  suggestLocations,
  calculateRoute,
  analyzeQuote,
  guardQuote,
  benchmarkQuote,
  aiChatQuote,
  aiVoiceQuote,
  createQuote,
  patchQuote,
  sendQuote,
  type AiChatTurn,
} from './api';
import { useCustomers } from '@/features/customers/api';
import { RouteMap, type GeoPoint } from '@/components/RouteMap';
import { VoiceQuoteBar } from './VoiceQuoteBar';
import { VoiceQuoteSheet } from './VoiceQuoteSheet';
import { Skeleton, WorkingOverlay } from '@/components/feedback';
import { num, str, pick, asArray } from '@/lib/api/list';
import {
  formatCurrency,
  formatCurrencyCompact,
  formatConfidence,
  formatDuration,
  formatPlain,
  formatNumber,
  formatPercent,
  parseNum,
} from '@/lib/formatters';
import { useTheme } from '@/theme/ThemeProvider';
import { status as statusHues } from '@/theme/tokens';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'CreateQuote'>;

interface Loc {
  label: string;
  lat: number;
  lon: number;
  cc?: string;
}

const FUEL_FALLBACK: Record<string, number> = {
  Flatbed: 32,
  Tautliner: 33,
  Refrigerated: 38,
  Tanker: 35,
  'Box Truck': 28,
  'Danger Load': 34,
};

// Sanity bound on the optimiser's markup-over-cost. Freight does not price at
// four times cost; a figure past this means the lane benchmark it was derived
// from is junk (resolve_market_rate averages raw quote totals with no per-km
// normalisation and no outlier trimming, so one bad row poisons a lane). Past
// this point we stop presenting the optimiser's price as a recommendation.
const MAX_PLAUSIBLE_MARKUP_PCT = 300;

// Heuristic 3-letter lane code (mirrors web extractCode).
function extractCode(s: string): string {
  const t = s.toLowerCase();
  if (/johannesburg|joburg|jhb/.test(t)) return 'JHB';
  if (/cape town|cpt/.test(t)) return 'CPT';
  if (/durban|dbn|dur/.test(t)) return 'DUR';
  if (/port elizabeth|gqeberha|pe/.test(t)) return 'PE';
  if (/pretoria|pta/.test(t)) return 'PTA';
  if (/bloemfontein|bfn/.test(t)) return 'BFN';
  return s.trim().slice(0, 3).toUpperCase();
}

function plusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function CreateQuoteScreen({ route, navigation }: Props) {
  const ai = route.params?.ai;
  const prefill = route.params?.prefill as Record<string, unknown> | undefined;
  const editId = route.params?.quoteId;
  const editing = editId != null;
  const qc = useQueryClient();

  const { data: existing } = useQuery<Record<string, unknown>>({
    queryKey: ['quote', editId],
    queryFn: () => fetchData(`quotes/${editId}/`),
    enabled: editing,
    retry: false,
  });
  const [hydrated, setHydrated] = useState(false);

  const { data: customers } = useCustomers();
  const { data: vtypes } = useVehicleTypes();
  const { data: company } = useCompanyProfileData();
  const { data: fuel } = useFuelPrice();
  const { data: modelStats } = useModelStats();

  const [customerId, setCustomerId] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [pickup, setPickup] = useState<Loc | null>(null);
  const [delivery, setDelivery] = useState<Loc | null>(null);
  const [weight, setWeight] = useState(str(prefill?.weight));
  const [pickupDate, setPickupDate] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [validUntil, setValidUntil] = useState(plusDays(7));
  const [cargo, setCargo] = useState(str(prefill?.cargo_description));
  const [tripType, setTripType] = useState<'ONE_WAY' | 'ROUND_TRIP'>('ROUND_TRIP');
  const [notes, setNotes] = useState('');
  const [nlReply, setNlReply] = useState('');
  const [nlText, setNlText] = useState('');
  const [nlBusy, setNlBusy] = useState(false);
  // Conversation state for the extraction endpoint — see submitNL.
  const [nlHistory, setNlHistory] = useState<AiChatTurn[]>([]);
  const [pendingEntity, setPendingEntity] = useState<unknown>(null);
  const [declinedEntities, setDeclinedEntities] = useState<string[]>([]);
  const [voiceOpen, setVoiceOpen] = useState(false);
  // Covers the transcription step. submitNL sets nlBusy for the extraction that
  // follows, and without this flag there's a visible gap between the sheet
  // closing and that starting.
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [benchmark, setBenchmark] = useState<Record<string, unknown> | null>(null);
  const [tollOverride, setTollOverride] = useState('');
  const [tollEdited, setTollEdited] = useState(false);
  const [driverAllowance, setDriverAllowance] = useState('0');
  const [baseRatePerKm, setBaseRatePerKm] = useState('');
  const [serviceCharge, setServiceCharge] = useState(0);

  // Every typed number goes through parseNum once, here, and the rest of the
  // screen reads these. Number() was used inline in eight places and is NaN for
  // the comma decimal this keyboard produces — the worst of them was
  // `Number(weight) * 1000 || 20000`, which quietly priced the load as 20 tons
  // when the user had typed `1,5`. A null here is a validation error, never a
  // substituted number.
  const weightTons = parseNum(weight);
  const weightKg = weightTons == null ? 0 : weightTons * 1000;
  const weightInvalid = weight.trim() !== '' && weightTons == null;
  const baseRateNum = parseNum(baseRatePerKm) ?? 0;
  const driverNum = parseNum(driverAllowance) ?? 0;
  const tollOverrideNum = parseNum(tollOverride) ?? 0;

  const [routeData, setRouteData] = useState<Record<string, unknown> | null>(null);
  const [routeBlockedMessage, setRouteBlockedMessage] = useState('');
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [analysis, setAnalysis] = useState<Record<string, unknown> | null>(null);
  const [guard, setGuard] = useState<Record<string, unknown> | null>(null);
  const [routeBusy, setRouteBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [tollModal, setTollModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const savedId = useRef<string | number | null>(null);
  const routeReq = useRef(0);
  const aiReq = useRef(0);

  // Prefill R/km from the company default only if one is configured — no
  // hard-coded fallback (leave blank so the field isn't pre-filled with a
  // made-up rate). Deferred to avoid sync setState in effect.
  useEffect(() => {
    if (!company || baseRatePerKm || editing) return;
    const def = num(pick(company, ['default_base_rate_per_km']));
    if (def > 0) {
      const t = setTimeout(() => setBaseRatePerKm(String(def)), 0);
      return () => clearTimeout(t);
    }
  }, [company, baseRatePerKm, editing]);

  // Cross-border is a company policy, not a per-quote choice (web moved it to
  // Settings → Company Details). The form only reacts to it: an early warning
  // when a picked location is foreign, and a hard block once /route/calculate/
  // refuses the route.
  const allowCrossBorder = pick(company ?? {}, ['allow_cross_border']) !== false;

  // Hydrate from an existing quote (edit mode).
  useEffect(() => {
    if (!editing || hydrated || !existing) return;
    const q = existing;
    const t = setTimeout(() => {
      setCustomerId(str(pick(q, ['customer'])));
      setVehicleType(str(pick(q, ['vehicle_type'])));
      setPickup({
        label: str(pick(q, ['pickup_location'])),
        lat: num(pick(q, ['pickup_lat'])),
        lon: num(pick(q, ['pickup_lng'])),
      });
      setDelivery({
        label: str(pick(q, ['delivery_location'])),
        lat: num(pick(q, ['delivery_lat'])),
        lon: num(pick(q, ['delivery_lng'])),
      });
      setWeight(String((num(pick(q, ['weight'])) || 0) / 1000 || ''));
      setCargo(str(pick(q, ['cargo_description'])));
      setDriverAllowance(String(num(pick(q, ['driver_allowance']))));
      setTollOverride(String(num(pick(q, ['toll_charges']))));
      const trip = (str(pick(q, ['trip_type'])) as 'ONE_WAY' | 'ROUND_TRIP') || 'ROUND_TRIP';
      setTripType(trip);
      const dist = num(pick(q, ['distance']));
      const baseRate = num(pick(q, ['base_rate']));
      if (dist && baseRate) {
        const legs = trip === 'ROUND_TRIP' ? 2 : 1;
        setBaseRatePerKm(formatPlain(Math.round((baseRate / (dist * legs)) * 100) / 100));
      }
      setValidUntil(str(pick(q, ['valid_until'])) || plusDays(7));
      setPickupDate(str(pick(q, ['pickup_date'])));
      setDeliveryDate(str(pick(q, ['delivery_date'])));
      savedId.current = editId ?? null;
      setRouteData({
        distance_km: dist,
        toll_cost_zar: num(pick(q, ['toll_charges'])),
        routes: [{ distance_km: dist, toll_cost_zar: num(pick(q, ['toll_charges'])) }],
      });
      setHydrated(true);
    }, 0);
    return () => clearTimeout(t);
  }, [editing, hydrated, existing, editId]);

  const customerOptions = useMemo(
    () => (customers ?? []).map((c) => ({ label: c.name, value: String(c.id) })),
    [customers],
  );
  const vtypeOptions = useMemo(() => {
    const seen = new Set<string>();
    return (vtypes ?? [])
      .filter((v) => (v.available_vehicle_count ?? 1) > 0)
      .filter((v) => (seen.has(v.name) ? false : (seen.add(v.name), true)))
      .map((v) => ({ label: v.name, value: v.name }));
  }, [vtypes]);

  const ready = !!(customerId && vehicleType && pickup?.lat && delivery?.lat);

  // Route calc (debounced 500ms, stale-guarded).
  useEffect(() => {
    if (!ready || !pickup || !delivery) return;
    const id = ++routeReq.current;
    const t = setTimeout(async () => {
      setRouteBusy(true);
      try {
        const res = await calculateRoute({
          origin: pickup.label,
          destination: delivery.label,
          origin_lat: pickup.lat,
          origin_lon: pickup.lon,
          origin_country: pickup.cc,
          dest_lat: delivery.lat,
          dest_lon: delivery.lon,
          dest_country: delivery.cc,
          vehicle_type: vehicleType || 'Flatbed',
          // Default only for an empty field. It used to also catch a failed
          // parse, so a comma weight estimated tolls for a 20-ton load.
          weight_kg: weightKg || 20000,
        });
        if (id === routeReq.current && (res as { success?: boolean }).success !== false) {
          setRouteBlockedMessage('');
          setRouteData(res);
          setSelectedRouteIndex(num(pick(res, ['best_index'])) || 0);
        }
      } catch (e) {
        if (id !== routeReq.current) return;
        // Company policy gate: the route genuinely crosses a border but the
        // company isn't set up for cross-border work. Anything else — just keep
        // the previous route rather than blanking the form.
        const body = (e as { data?: { error?: string; message?: string } }).data;
        if (body?.error === 'cross_border_not_allowed') {
          setRouteBlockedMessage(body.message || "This route isn't allowed for your company.");
          setRouteData(null);
        }
      } finally {
        if (id === routeReq.current) setRouteBusy(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [ready, pickup, delivery, vehicleType, weightKg]);

  const routes = useMemo(
    () => asArray(pick(routeData ?? {}, ['routes'])) as Record<string, unknown>[],
    [routeData],
  );
  const currentRoute = useMemo(
    () => (routes[selectedRouteIndex] ?? routes[0] ?? {}) as Record<string, unknown>,
    [routes, selectedRouteIndex],
  );

  // ── Cost breakdown ──────────────────────────────────────────────────────
  const costs = useMemo(() => {
    const distance = num(pick(currentRoute, ['distance_km'])) || num(pick(routeData ?? {}, ['distance_km']));
    const legs = tripType === 'ROUND_TRIP' ? 2 : 1;
    const chargeDistance = distance * legs;
    const surchargePctBase = num(pick(company ?? {}, ['weight_surcharge_pct'])) || 15;

    const consumption =
      (vtypes ?? []).find((v) => v.name === vehicleType)?.fuel_consumption_l_per_100km ??
      FUEL_FALLBACK[vehicleType] ??
      32;
    const fuelPrice = num(pick(fuel ?? {}, ['diesel_inland'])) || num(pick(company ?? {}, ['fuel_price_per_litre'])) || 21.7;
    const fuelCost = Math.round((chargeDistance * consumption * fuelPrice) / 100);

    const tollRate = num(pick(company ?? {}, ['default_toll_rate_per_km'])) || 0.95;
    const routeTollOneWay = num(pick(currentRoute, ['toll_cost_zar'])) || num(pick(routeData ?? {}, ['toll_cost_zar'])) || distance * tollRate;
    const tollCost = tollEdited ? tollOverrideNum : Math.round(routeTollOneWay * legs);
    const tollBreakdown = (asArray(pick(currentRoute, ['toll_breakdown'])).length
      ? asArray(pick(currentRoute, ['toll_breakdown']))
      : asArray(pick(routeData ?? {}, ['toll_breakdown']))) as Record<string, unknown>[];

    const add = (pick(routeData ?? {}, ['additional_costs']) ?? {}) as Record<string, unknown>;
    const crossBorderCost = Math.round(
      (num(pick(add, ['border_fees'])) + num(pick(add, ['weighbridge_fees'])) + num(pick(add, ['non_sa_tolls']))) * legs,
    );

    const threshold = num(pick(company ?? {}, ['weight_surcharge_threshold_kg'])) || 5000;
    const baseCost = Math.round(chargeDistance * baseRateNum);
    const weightSurcharge = weightKg > threshold ? Math.round((baseCost * surchargePctBase) / 100) : 0;
    const driver = driverNum;

    const total = baseCost + fuelCost + tollCost + crossBorderCost + driver + weightSurcharge + serviceCharge;
    const directCost = total - serviceCharge;
    const marginPct = total > 0 ? Math.round(((total - directCost) / total) * 100) : 0;
    const duration = num(pick(currentRoute, ['duration_minutes'])) || num(pick(currentRoute, ['duration_min']));

    return {
      distance,
      legs,
      chargeDistance,
      consumption,
      fuelCost,
      tollCost,
      tollBreakdownOneWay: Math.round(routeTollOneWay),
      tollBreakdown,
      crossBorderCost,
      baseCost,
      weightSurcharge,
      surchargePct: surchargePctBase,
      driver,
      total,
      directCost,
      marginPct,
      duration,
      fuelUsage: Math.round((chargeDistance * consumption) / 100),
      fuelPrice,
    };
  }, [currentRoute, routeData, tripType, vtypes, vehicleType, fuel, company, weightKg, baseRateNum, tollEdited, tollOverrideNum, driverNum, serviceCharge]);

  // Drop a stale analysis the moment a real cost input moves, so the card can't
  // go on showing numbers for a quote that no longer exists while the next
  // request is in flight.
  //
  // Keyed on directCost, not total: applying the AI markup changes total but not
  // the cost the optimiser reasoned about, and clearing here would flash the
  // whole card to a skeleton on every Apply. The guard does depend on total and
  // simply refreshes on the next pass.
  useEffect(() => {
    setAnalysis(null);
    setGuard(null);
    // Straight into the loading state, so the gap before the debounce fires
    // can't render the bare cost total under a "Recommended price" label.
    // Conditioned exactly as the analyze effect below, so a pass that bails
    // can't leave the card stuck on a skeleton.
    if (routeData && costs.total > 0 && pickup && delivery) setAiBusy(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [costs.directCost, vehicleType, weightKg, selectedRouteIndex]);

  // AI analyze + guard (debounced 700ms, stale-guarded).
  useEffect(() => {
    if (!routeData || costs.total <= 0 || !pickup || !delivery) return;
    const id = ++aiReq.current;
    const t = setTimeout(async () => {
      setAiBusy(true);
      const [a, g] = await Promise.all([
        analyzeQuote({
          quote_total: costs.total,
          direct_cost: costs.directCost,
          distance_km: costs.chargeDistance,
          origin: extractCode(pickup.label),
          destination: extractCode(delivery.label),
          vehicle_type: vehicleType,
          weight: weightKg,
          fuel_cost: costs.fuelCost,
          toll_cost: costs.tollCost,
          driver_cost: costs.driver,
          fuel_usage_litres: costs.fuelUsage,
          fuel_price_used: costs.fuelPrice,
          market_rate: num(pick(benchmark ?? {}, ['market_avg_rate'])),
          client_tier: 'standard',
          skip_narrative: true,
        }).catch(() => null),
        guardQuote({
          total_cost: costs.directCost,
          quote_price: costs.total,
          distance_km: costs.chargeDistance,
          fuel_cost: costs.fuelCost,
          toll_cost: costs.tollCost,
        }).catch(() => null),
      ]);
      if (id === aiReq.current) {
        setAnalysis(a);
        setGuard(g);
        setAiBusy(false);
      }
      benchmarkQuote(extractCode(pickup.label), extractCode(delivery.label), vehicleType)
        .then((b) => id === aiReq.current && setBenchmark(b))
        .catch(() => null);
    }, 700);
    return () => clearTimeout(t);
    // benchmark intentionally excluded (it's set inside this effect).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeData, costs, pickup, delivery, vehicleType, weight, selectedRouteIndex]);

  const opt = useMemo(
    () => (pick(analysis ?? {}, ['price_optimization']) ?? {}) as Record<string, unknown>,
    [analysis],
  );
  const winModel = (pick(modelStats ?? {}, ['win_model']) ?? {}) as Record<string, unknown>;
  const aiLearning = str(pick(winModel, ['mode'])) === 'heuristic';
  const outcomesLogged = num(pick(winModel, ['outcomes_collected']));
  const outcomesNeeded = num(pick(winModel, ['outcomes_needed']));
  // Guarded — a zero threshold would otherwise render a NaN-wide bar.
  const learnPct = outcomesNeeded > 0 ? Math.min(100, Math.round((outcomesLogged / outcomesNeeded) * 100)) : 0;

  const optPrice = pick(opt, ['optimal_price']) != null ? num(pick(opt, ['optimal_price'])) : null;
  const backendSuggested = pick(analysis ?? {}, ['suggested_price']) != null ? num(pick(analysis ?? {}, ['suggested_price'])) : null;
  // The optimiser's margin is a markup on COST, not a margin on revenue, and the
  // backend returns it unclamped (margin_optimizer.py:269). When the lane
  // benchmark is junk it comes back in the thousands of percent, which is how a
  // R64k job was recommended at R1.5M. Treat anything past this as "the
  // benchmark behind this is not trustworthy" and fall back to cost-based
  // pricing rather than showing the number.
  const optMarkupPct = pick(opt, ['optimal_margin_pct']) != null ? num(pick(opt, ['optimal_margin_pct'])) : null;
  const markupImplausible = optMarkupPct != null && optMarkupPct > MAX_PLAUSIBLE_MARKUP_PCT;
  // Cost-based fallback price, and the trained optimiser's price. One value
  // feeds both the number on screen and what Apply actually applies — they used
  // to be two separate expressions, so applying never matched what was shown
  // and each apply compounded on the last.
  const costPlusPrice = Math.round(costs.directCost * 1.25);
  const priceUntrusted = aiLearning || markupImplausible;
  const suggestedPrice = priceUntrusted ? costPlusPrice : optPrice || backendSuggested || null;
  const alreadyApplied = suggestedPrice != null && Math.abs(costs.total - suggestedPrice) < 1;
  // Margin, win probability and the curve are all outputs of the win model, so
  // they mean nothing until it is trained — and nothing if its benchmark is off.
  const statsTrusted = !priceUntrusted;

  const winProb = num(pick(opt, ['win_probability_at_optimal']));
  const expProfit =
    pick(opt, ['expected_profit']) != null
      ? num(pick(opt, ['expected_profit']))
      : (suggestedPrice ?? costs.total) - costs.directCost;
  const riskLevel = str(pick(guard ?? {}, ['risk_level']), 'SAFE');
  const curveData = useMemo<CurvePoint[]>(
    () =>
      asArray(pick(opt, ['curve'])).map((c) => {
        const o = c as Record<string, unknown>;
        const m = pick(o, ['margin_pct']) != null ? num(pick(o, ['margin_pct'])) : num(pick(o, ['margin'])) * 100;
        return { margin: Math.round(m), profit: Math.round(num(pick(o, ['expected_profit']))) };
      }),
    [opt],
  );
  const estimateLoading = (routeBusy || aiBusy) && !analysis;
  const guardExplain = asArray<string>(pick(guard ?? {}, ['explanations']))[0] as unknown as string;
  const guardWarn = asArray<string>(pick(guard ?? {}, ['warnings']))[0] as unknown as string;
  const guardFix = asArray<string>(pick(guard ?? {}, ['suggestions']))[0] as unknown as string;
  const guardMsg = guardExplain || guardWarn || guardFix || 'Margin is below your guardrail — review before sending.';
  // The suggestion is the actionable half ("increase price by ~R… to reach …%"),
  // and it was being dropped whenever an explanation existed.
  const guardHint = guardFix && guardFix !== guardMsg ? guardFix : null;

  const submitNL = async (text?: string) => {
    const message = (text ?? nlText).trim();
    if (!message || nlBusy) return;
    setNlBusy(true);
    try {
      // The form as it stands goes back with the message, so a follow-up
      // refines this quote instead of starting over. customer_name in
      // particular is how the model keeps hold of an already-picked client.
      const currentFields = {
        pickup_location: pickup?.label,
        delivery_location: delivery?.label,
        weight_kg: weightKg > 0 ? weightKg : undefined,
        vehicle_type: vehicleType || undefined,
        customer_name: customerOptions.find((o) => o.value === customerId)?.label || '',
        cargo_description: cargo || undefined,
        pickup_date: pickupDate || undefined,
        delivery_date: deliveryDate || undefined,
        valid_until: validUntil || undefined,
        trip_type: tripType,
      };
      const res = await aiChatQuote(message, nlHistory, currentFields, pendingEntity, declinedEntities);

      // Carry the entity conversation forward: without this the backend's
      // "that client doesn't exist — create it?" question can never be
      // answered, and replying just sends a fresh contextless message.
      setPendingEntity(pick(res, ['pending_entity']) ?? null);
      const declined = str(pick(res, ['declined_entity']));
      if (declined) setDeclinedEntities((prev) => [...prev, declined.toLowerCase()]);
      setNlHistory((prev) => [
        ...prev,
        { role: 'user' as const, content: message },
        { role: 'assistant' as const, content: str(pick(res, ['reply'])) },
      ]);

      const ex = (pick(res, ['extracted_fields']) ?? {}) as Record<string, unknown>;
      // The backend already fuzzy-matches a spoken name to a real customer and
      // returns its id, so this is a straight assignment. Omitting this line
      // was the bug: every other field filled and the client stayed empty.
      if (pick(ex, ['customer_id'])) {
        setCustomerId(String(pick(ex, ['customer_id'])));
        // A client created mid-conversation isn't in the cached picker yet.
        invalidateFor(qc, 'customer');
      }
      if (pick(ex, ['cargo_description'])) setCargo(str(pick(ex, ['cargo_description'])));
      // Backend weight is in kg → the UI field is tons.
      if (pick(ex, ['weight'])) {
        const kg = num(pick(ex, ['weight']));
        if (kg > 0) setWeight(formatPlain(Math.round((kg / 1000) * 100) / 100));
      }
      if (pick(ex, ['vehicle_type'])) setVehicleType(str(pick(ex, ['vehicle_type'])));
      if (pick(ex, ['pickup_date'])) setPickupDate(str(pick(ex, ['pickup_date'])));
      if (pick(ex, ['delivery_date'])) setDeliveryDate(str(pick(ex, ['delivery_date'])));
      if (pick(ex, ['valid_until'])) setValidUntil(str(pick(ex, ['valid_until'])));
      const tt = str(pick(ex, ['trip_type'])).toUpperCase();
      if (tt === 'ONE_WAY' || tt === 'ROUND_TRIP') setTripType(tt);
      const geocode = async (q: string, set: (l: Loc) => void) => {
        const raw = await suggestLocations(q);
        const first = asArray(raw)[0] as Record<string, unknown> | undefined;
        if (first)
          set({
            label: str(pick(first, ['label', 'name', 'description'])),
            lat: num(pick(first, ['lat', 'latitude'])),
            lon: num(pick(first, ['lon', 'lng', 'longitude'])),
            cc: str(pick(first, ['country_code'])) || undefined,
          });
      };
      if (pick(ex, ['pickup_location'])) await geocode(str(pick(ex, ['pickup_location'])), setPickup);
      if (pick(ex, ['delivery_location'])) await geocode(str(pick(ex, ['delivery_location'])), setDelivery);
      setNlText('');
      const reply = str(pick(res, ['reply']));
      setNlReply(reply || 'Filled from your description.');
      toast.success();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not parse');
    } finally {
      setNlBusy(false);
    }
  };

  // The voice sheet only records. Transcription and extraction happen here,
  // behind the overlay, so the sheet can close the moment the user submits.
  const onVoiceCaptured = async (uri: string) => {
    setVoiceOpen(false);
    setVoiceBusy(true);
    try {
      const res = await aiVoiceQuote({ uri, name: 'quote.m4a', type: 'audio/m4a' });
      const text = str(pick(res, ['text', 'transcription'])).trim();
      if (!text) {
        toast.error("Didn't catch that — try again");
        return;
      }
      setNlText(text);
      await submitNL(text);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not transcribe audio');
    } finally {
      setVoiceBusy(false);
    }
  };

  // Applies the exact figure that is on screen. Floored at 0 because
  // serviceCharge has no line item of its own in the breakdown, so a negative
  // would be an unexplained discount below cost.
  const applyRecommended = () => {
    if (suggestedPrice != null && suggestedPrice > 0) {
      setServiceCharge((sc) => Math.max(0, sc + (suggestedPrice - costs.total)));
    }
  };

  // serviceCharge is only ever written by apply / this / the form reset, so it
  // is purely the AI markup — zeroing it drops the total back to true cost.
  const useActualPrice = () => setServiceCharge(0);

  const buildPayload = (status: 'DRAFT' | 'SENT') => ({
    customer: Number(customerId),
    pickup_location: pickup?.label,
    delivery_location: delivery?.label,
    pickup_date: pickupDate || null,
    delivery_date: deliveryDate || null,
    origin: extractCode(pickup?.label ?? ''),
    destination: extractCode(delivery?.label ?? ''),
    pickup_lat: pickup?.lat,
    pickup_lng: pickup?.lon,
    delivery_lat: delivery?.lat,
    delivery_lng: delivery?.lon,
    cargo_description: cargo || `${weight}t ${vehicleType}`,
    weight: weightKg,
    distance: costs.distance,
    estimated_duration_minutes: costs.duration,
    vehicle_type: vehicleType,
    base_rate: costs.baseCost,
    fuel_surcharge: costs.fuelCost,
    toll_charges: costs.tollCost,
    driver_allowance: costs.driver,
    additional_charges: costs.weightSurcharge + costs.crossBorderCost + serviceCharge,
    total_amount: costs.total,
    margin_percentage: costs.marginPct,
    notes,
    status,
    confidence: 'MEDIUM',
    sla_hours: num(pick(company ?? {}, ['default_sla_hours'])) || 48,
    valid_until: validUntil,
    trip_type: tripType,
    win_probability: winProb ? Math.round(winProb * 100) : null,
  });

  const save = async (send: boolean) => {
    // Draft can be saved any time (just needs a client to attach to).
    if (!customerId) return toast.error('Select a client');
    if (routeBlockedMessage) return toast.error(routeBlockedMessage);
    if (send) {
      if (!ready) return toast.error('Add a vehicle type, pickup and drop-off');
      const missing: string[] = [];
      if (weightInvalid) return toast.error('Weight is not a number');
      if (!(weightKg > 0)) missing.push('weight');
      if (!pickupDate) missing.push('pickup date');
      if (!deliveryDate) missing.push('delivery date');
      if (missing.length) return toast.error(`Add ${missing.join(', ')} before sending`);
    }
    setBusy(true);
    try {
      const payload = buildPayload(send ? 'SENT' : 'DRAFT');
      let id = savedId.current;
      if (id) await patchQuote(id, payload);
      else {
        const created = await createQuote(payload);
        id = pick(created, ['id', 'pk']) as string | number;
        savedId.current = id;
      }
      if (send && id) {
        const res = await sendQuote(id);
        toast.success(pick(res, ['email_sent']) ? 'Quote sent to client' : 'Quote saved — email pending');
      } else {
        toast.success('Draft saved');
      }
      // Also refreshes this quote's own detail cache, which the old
      // quotes-only invalidation missed — reopening an edited quote showed
      // the pre-edit values.
      invalidateFor(qc, 'quote');
      navigation.goBack();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save quote');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetScreen
      eyebrow={editing ? 'Edit' : ai ? 'AI quote' : 'New quote'}
      title={editing ? 'Edit quote' : 'Build quote'}
      variant="modal"
      onBack={() => navigation.goBack()}
      footer={
        <View className="flex-row gap-2.5">
          <View className="flex-1">
            <Button label="Save draft" variant="secondary" loading={busy} onPress={() => save(false)} fullWidth />
          </View>
          <View className="flex-1">
            <Button
              label="Send to client"
              icon="send"
              loading={busy}
              disabled={!ready || !!routeBlockedMessage}
              onPress={() => save(true)}
              fullWidth
            />
          </View>
        </View>
      }
    >
      <View className="gap-4">
        {/* AI voice / natural-language quick fill */}
        <VoiceQuoteBar
          value={nlText}
          onChangeText={(t) => {
            setNlText(t);
            if (nlReply) setNlReply('');
          }}
          onSubmit={() => submitNL()}
          busy={nlBusy}
          onRecord={() => setVoiceOpen(true)}
          note={nlReply || undefined}
        />

        <SelectField label="Client" icon="user" placeholder="Select customer" options={customerOptions} value={customerId} onSelect={setCustomerId} />
        <SelectField label="Vehicle type" icon="truck" placeholder="Select vehicle type" options={vtypeOptions} value={vehicleType} onSelect={setVehicleType} />
        <LocationField label="Collection" value={pickup} onChange={setPickup} placeholder="Search origin" />
        <LocationField label="Drop-off" value={delivery} onChange={setDelivery} placeholder="Search destination" />

        {/* Early heads-up the moment a picked location is outside SA, before the
            rest of the form is filled in. The real enforcement happens once
            /route/calculate/ runs — see routeBlockedMessage below. */}
        {!allowCrossBorder && (isForeignCc(pickup?.cc) || isForeignCc(delivery?.cc)) && (
          <View className="flex-row items-start gap-2.5 rounded-xs border border-warning bg-warning-bg p-3">
            <Icon name="alert" size={17} color="#F59E0B" />
            <Txt className="flex-1 text-sub text-muted">
              This location is outside South Africa, but your company isn&apos;t set up for cross-border
              routes (Settings → Company details). This quote will be refused once calculated — pick a
              domestic location or ask an admin to enable cross-border routes.
            </Txt>
          </View>
        )}

        <View>
          <Label className="mb-2 text-muted">Trip</Label>
          <SegmentedControl
            options={[
              { label: 'Round trip', value: 'ROUND_TRIP' },
              { label: 'One way', value: 'ONE_WAY' },
            ]}
            value={tripType}
            onChange={(v) => setTripType(v as 'ONE_WAY' | 'ROUND_TRIP')}
          />
        </View>

        {/* R/km lives in the overrides section further down, next to the other
            cost levers — it isn't repeated here. */}
        <TextField
          label="Weight (tons) *"
          placeholder="e.g. 20"
          keyboardType="decimal-pad"
          error={weightInvalid ? 'Enter a number, e.g. 1,5' : undefined}
          value={weight}
          onChangeText={setWeight}
        />
        <TextField label="Cargo" placeholder="e.g. Steel coils" value={cargo} onChangeText={setCargo} />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <DateField label="Pickup date *" value={pickupDate} onChange={setPickupDate} />
          </View>
          <View className="flex-1">
            <DateField label="Delivery date *" value={deliveryDate} onChange={setDeliveryDate} />
          </View>
        </View>
        <DateField label="Valid until" value={validUntil} onChange={setValidUntil} />
        <TextField label="Notes" placeholder="Anything the client should see" value={notes} onChangeText={setNotes} multiline />
      </View>

      {/* Route refused by company policy — replaces the whole estimate block,
          same as web. */}
      {ready && routeBlockedMessage && (
        <View className="mt-5 rounded-xs border border-danger bg-danger-bg p-4">
          <Txt className="text-callout font-semibold text-danger">Route not allowed</Txt>
          <Txt className="mt-1.5 text-sub text-muted">{routeBlockedMessage}</Txt>
        </View>
      )}

      {/* Route + estimate */}
      {ready && !routeBlockedMessage && (
        <View className="mt-5 gap-5">
          {/* Static OSM map of the selected route. Geometry already comes back
              from route/calculate/ — this just draws it. */}
          <RouteMap
            geometry={asArray(pick(currentRoute, ['geometry'])) as GeoPoint[]}
            pickup={pickup ? { lat: pickup.lat, lon: pickup.lon } : null}
            delivery={delivery ? { lat: delivery.lat, lon: delivery.lon } : null}
          />

          <RoutePreview
            origin={pickup!.label}
            dest={delivery!.label}
            distance={costs.distance ? `${Math.round(costs.chargeDistance)} km` : 'Calculating…'}
            duration={costs.duration ? formatDuration(costs.duration / 60) : undefined}
          />

          {/* Alternative routes */}
          {routes.length > 1 && (
            <View>
              <Label className="mb-2 text-muted">Alternative routes</Label>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {routes.map((r, i) => {
                  const active = i === selectedRouteIndex;
                  return (
                    <Pressable
                      key={i}
                      onPress={() => {
                        setSelectedRouteIndex(i);
                        setAnalysis(null);
                        setGuard(null);
                      }}
                      className={`min-h-[34px] justify-center rounded-xs border px-3 ${active ? 'border-accent bg-accent-dim' : 'border-line bg-surface'}`}
                    >
                      <Mono className={`text-micro tracking-wide uppercase ${active ? 'text-accent' : 'text-muted'}`}>
                        {str(pick(r, ['label', 'summary']), `Route ${i + 1}`)} · {Math.round(num(pick(r, ['distance_km'])))} km
                      </Mono>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {costs.total > 0 && (
            <>
              {/* AI recommendation card */}
              <Group label="AI recommendation">
                {estimateLoading ? (
                  /* One unified skeleton — no piecemeal spinners. */
                  <View className="p-4">
                    <View className="mb-3 flex-row items-center gap-2">
                      <ActivityIndicator size="small" color="#4D9EFF" />
                      <Mono className="text-caption text-muted">Analysing route & optimising price…</Mono>
                    </View>
                    <Skeleton width="55%" height={26} className="mb-4" />
                    <View className="mb-4 flex-row gap-8">
                      <View className="flex-1 gap-2">
                        <Skeleton width="40%" height={10} />
                        <Skeleton width="60%" height={18} />
                      </View>
                      <View className="flex-1 gap-2">
                        <Skeleton width="55%" height={10} />
                        <Skeleton width="45%" height={18} />
                      </View>
                    </View>
                    <Skeleton height={56} />
                  </View>
                ) : (
                <View className="p-4">
                  {/* The price is the hero. Its label and caption say which
                      basis it came from, so a cost-based figure is never
                      mistaken for a trained recommendation. */}
                  <Label className="text-faint">{statsTrusted ? 'Recommended price' : 'Suggested price'}</Label>
                  <Mono
                    className={`mt-1 ${statsTrusted ? 'text-accent' : 'text-fg'}`}
                    style={{ fontSize: 26, fontWeight: '700' }}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {formatCurrency(suggestedPrice ?? costs.total)}
                  </Mono>
                  <Txt className="mt-0.5 text-caption text-faint">
                    {statsTrusted ? 'to this client' : 'true cost + 25%'}
                  </Txt>

                  {statsTrusted ? (
                    <>
                      {/* One compact stat row rather than a tile grid. */}
                      <View className="mt-4 flex-row gap-8">
                        <View className="flex-1">
                          <Label className="text-faint">Margin</Label>
                          <Mono className="mt-1 text-fg" style={{ fontSize: 18, fontWeight: '600' }}>
                            {optMarkupPct != null ? formatPercent(optMarkupPct, 0) : formatPercent(costs.marginPct, 0)}
                          </Mono>
                          <Mono className="text-micro text-success">{formatCurrencyCompact(expProfit)} profit</Mono>
                        </View>
                        <View className="flex-1">
                          <Label className="text-faint">Win probability</Label>
                          <Mono className="mt-1 text-fg" style={{ fontSize: 18, fontWeight: '600' }}>
                            {winProb > 0 ? formatConfidence(winProb) : '—'}
                          </Mono>
                          <View className="mt-2 h-1 overflow-hidden rounded-pill bg-surface-hover">
                            <View style={{ width: `${Math.min(100, Math.round(winProb * 100))}%`, height: '100%' }} className="bg-accent" />
                          </View>
                        </View>
                      </View>

                      {curveData.length > 1 && (
                        <View className="mt-4">
                          <Label className="mb-1 text-faint">Profit sweet-spot · tap to inspect</Label>
                          <ProfitCurve
                            points={curveData}
                            optimalMargin={optMarkupPct != null ? Math.round(optMarkupPct) : undefined}
                            height={56}
                          />
                        </View>
                      )}
                    </>
                  ) : (
                    /* One honest line instead of three "unlocks after training"
                       placeholders — the client asked for less clutter, and
                       empty tiles are clutter. */
                    <Txt className="mt-3 text-caption text-faint">
                      Margin, win probability and the profit curve unlock once the model is trained.
                    </Txt>
                  )}

                  {alreadyApplied ? (
                    <View className="mt-4 gap-2.5">
                      <View className="flex-row items-center gap-1.5">
                        <Icon name="check" size={15} color={statusHues.success} />
                        <Txt className="text-sub text-success">AI price applied</Txt>
                      </View>
                      <Button label="Use actual price" variant="secondary" onPress={useActualPrice} fullWidth />
                    </View>
                  ) : (
                    suggestedPrice != null &&
                    suggestedPrice > 0 && (
                      <Button label="Apply recommended" variant="secondary" icon="sparkle" onPress={applyRecommended} fullWidth className="mt-4" />
                    )
                  )}
                </View>
                )}

                {riskLevel !== 'SAFE' && (
                  <View className={`flex-row gap-2.5 border-t border-line p-3 ${riskLevel === 'AT_RISK' ? 'bg-danger-bg' : 'bg-warning-bg'}`}>
                    <Icon name="alert" size={16} color={riskLevel === 'AT_RISK' ? '#FF4949' : '#F59E0B'} />
                    <Txt className="flex-1 text-sub text-muted">
                      <Txt className={`text-sub font-semibold ${riskLevel === 'AT_RISK' ? 'text-danger' : 'text-warning'}`}>
                        {riskLevel === 'AT_RISK' ? 'At risk' : 'Caution'}
                      </Txt>
                      {' · '}
                      {guardMsg}
                      {guardHint ? ` — ${guardHint}` : ''}
                    </Txt>
                  </View>
                )}

                {aiLearning && (
                  <View className="flex-row items-center gap-2.5 border-t border-line bg-warning-bg p-3">
                    <Icon name="sparkle" size={16} color="#F59E0B" />
                    <Txt className="flex-1 text-sub text-muted">
                      <Txt className="text-sub font-semibold text-fg">Still learning your fleet. </Txt>
                      Priced on true cost + your {vehicleType} base rate for now.
                    </Txt>
                    <View className="items-end">
                      <Mono className="text-micro text-fg">
                        {formatNumber(outcomesLogged)}/{formatNumber(outcomesNeeded)} logged
                      </Mono>
                      <View className="mt-1 h-1 w-16 overflow-hidden rounded-pill bg-surface-hover">
                        <View style={{ width: `${learnPct}%`, height: '100%', backgroundColor: '#F59E0B' }} />
                      </View>
                    </View>
                  </View>
                )}
              </Group>

              {/* Cost breakdown */}
              <Group label={`Cost breakdown · ${vehicleType || '—'}`}>
                <DetailRow
                  label={`Fuel — ${costs.consumption} L/100km @ ${formatCurrency(costs.fuelPrice)}`}
                  value={formatCurrency(costs.fuelCost)}
                />
                <Pressable onPress={() => setTollModal(true)} className="flex-row items-center justify-between border-b border-line-row px-3.5 py-3">
                  <View className="flex-row items-center gap-1.5">
                    <Txt className="text-callout text-muted">Tolls (SA plazas)</Txt>
                    <Icon name="alert" size={13} color="#888888" />
                  </View>
                  <Mono className="text-sub font-medium text-fg">{formatCurrency(costs.tollCost)}</Mono>
                </Pressable>
                {costs.crossBorderCost > 0 && <DetailRow label="Cross-border / weighbridge" value={formatCurrency(costs.crossBorderCost)} />}
                <DetailRow label="Driver allowance" value={formatCurrency(costs.driver)} />
                {costs.weightSurcharge > 0 && <DetailRow label={`Weight surcharge (${formatPercent(costs.surchargePct)})`} value={formatCurrency(costs.weightSurcharge)} />}
                <DetailRow
                  label={`Base rate (${vehicleType || '—'} · ${formatCurrency(baseRateNum)}/km)`}
                  value={formatCurrency(costs.baseCost)}
                />
                {serviceCharge !== 0 && <DetailRow label="Service adjustment" value={formatCurrency(serviceCharge)} />}
                <View className="flex-row items-center justify-between bg-surface-hover px-3.5 py-3.5">
                  <Txt className="text-callout font-semibold text-fg">Quote total · {costs.marginPct}% margin</Txt>
                  <Mono className="text-heading font-semibold text-accent">{formatCurrency(costs.total)}</Mono>
                </View>
                <View className="px-3.5 py-2">
                  <Mono className="text-micro text-faint">
                    {formatNumber(Math.round(costs.distance))} km one way ·{' '}
                    {formatNumber(Math.round(costs.chargeDistance))} km{' '}
                    {tripType === 'ROUND_TRIP' ? 'round trip' : 'total'}
                  </Mono>
                </View>
              </Group>

              {/* Editable overrides */}
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <TextField
                    label="Tolls"
                    prefix="R"
                    placeholder="0"
                    keyboardType="decimal-pad"
                    value={tollEdited ? tollOverride : formatPlain(costs.tollCost)}
                    onChangeText={(v) => {
                      setTollEdited(true);
                      setTollOverride(v);
                    }}
                  />
                </View>
                <View className="flex-1">
                  <TextField label="Driver" prefix="R" placeholder="0" keyboardType="decimal-pad" numeric decimals={2} value={driverAllowance} onChangeText={setDriverAllowance} />
                </View>
                <View className="flex-1">
                  <TextField label="Rate / km" prefix="R" placeholder="e.g. 25" keyboardType="decimal-pad" value={baseRatePerKm} onChangeText={setBaseRatePerKm} />
                </View>
              </View>
            </>
          )}
        </View>
      )}

      {/* Toll plaza breakdown modal */}
      <Modal visible={tollModal} transparent animationType="fade" onRequestClose={() => setTollModal(false)}>
        <Pressable className="flex-1 justify-center bg-black/60 px-6" onPress={() => setTollModal(false)}>
          <Pressable className="rounded-md border border-line bg-elevated p-4" onPress={(e) => e.stopPropagation()}>
            <Label className="mb-3 text-muted">Toll plazas on this route</Label>
            {costs.tollBreakdown.length === 0 ? (
              <Txt className="text-callout text-muted">No SANRAL plazas matched on this route.</Txt>
            ) : (
              <View>
                {costs.tollBreakdown.map((b, i) => (
                  <View key={i} className="flex-row items-center justify-between border-b border-line-row py-2">
                    <Txt className="flex-1 text-sub text-fg" numberOfLines={1}>
                      {str(pick(b, ['plaza']), 'Plaza')}
                      {pick(b, ['route']) ? ` (${str(pick(b, ['route']))})` : ''}
                    </Txt>
                    <Mono className="text-sub text-muted">{formatCurrency(num(pick(b, ['tariff'])))}</Mono>
                  </View>
                ))}
                <View className="mt-2 flex-row items-center justify-between">
                  <Txt className="text-callout font-semibold text-fg">One way total</Txt>
                  <Mono className="text-callout font-semibold text-fg">{formatCurrency(costs.tollBreakdownOneWay)}</Mono>
                </View>
                {costs.legs === 2 && (
                  <Mono className="mt-1 text-micro text-faint">× 2 for round trip = {formatCurrency(costs.tollBreakdownOneWay * 2)}</Mono>
                )}
              </View>
            )}
            <Button label="Close" variant="secondary" onPress={() => setTollModal(false)} fullWidth className="mt-4" />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Stays open through the AI step, so the user sees "Building your
          quote" rather than being dropped back on a form that's mid-change. */}
      {voiceOpen && (
        <VoiceQuoteSheet onCaptured={onVoiceCaptured} onClose={() => setVoiceOpen(false)} />
      )}

      {/* Both entry points get this — the voice sheet and the typed
          "Fill from description" button, which previously only spun a small
          button through a multi-second AI call. */}
      <WorkingOverlay visible={voiceBusy || nlBusy} title="Building your quote" />
    </SheetScreen>
  );
}


// A location is cross-border when its country code isn't South Africa.
const isForeignCc = (cc?: string) => {
  if (!cc) return false;
  const c = cc.replace(/\s/g, '').toUpperCase();
  return c !== '' && !['ZA', 'ZAF', 'SOUTHAFRICA'].includes(c);
};

type LocSuggest = Loc & { foreign: boolean; country: string };

// ── Location autocomplete with coordinates ──────────────────────────────────
function LocationField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: Loc | null;
  onChange: (l: Loc) => void;
  placeholder: string;
}) {
  const { colors } = useTheme();
  const [text, setText] = useState(value?.label ?? '');
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState<LocSuggest[]>([]);
  // One ref per timer. These used to share a slot, so the clear-results timeout
  // and the search timeout cancelled each other at random.
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The label the field is already settled on — either tapped from the list or
  // filled in from outside. While text still equals it, the user isn't
  // searching, so we must not look it up. Without this, picking "Durban" set
  // the text to "Durban…", which re-armed the debounce below and reopened the
  // dropdown a couple of seconds later on top of the completed selection.
  const chosen = useRef<string | null>(value?.label ?? null);
  // Monotonic request id, same pattern as routeReq/aiReq above: a reply that is
  // no longer the newest must not write results. Covers the other half of the
  // reopen — the in-flight lookup from the last keystroke landing after the tap.
  const reqId = useRef(0);

  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      if (clearTimer.current) clearTimeout(clearTimer.current);
      if (blurTimer.current) clearTimeout(blurTimer.current);
    },
    [],
  );

  // Reflect an externally-set value (edit-mode hydration, or the AI/voice fill
  // path via geocode → setPickup) into the input. Marked as chosen so an
  // address we filled in ourselves doesn't trigger a lookup either.
  useEffect(() => {
    if (!value?.label || value.label === text) return;
    chosen.current = value.label;
    const t = setTimeout(() => setText(value.label), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.label]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!focused || text.length < 2 || chosen.current === text) {
      clearTimer.current = setTimeout(() => setResults([]), 0);
      return () => {
        if (clearTimer.current) clearTimeout(clearTimer.current);
      };
    }
    searchTimer.current = setTimeout(async () => {
      const mine = ++reqId.current;
      try {
        const raw = await suggestLocations(text);
        if (mine !== reqId.current) return;
        const list = asArray(raw)
          .map((r) => {
            const o = r as Record<string, unknown>;
            const cc = str(pick(o, ['country_code', 'country'])) || undefined;
            const foreign = Boolean(pick(o, ['cross_border'])) || isForeignCc(cc);
            return {
              label: str(pick(o, ['label', 'name', 'description', 'address'])),
              lat: num(pick(o, ['lat', 'latitude'])),
              lon: num(pick(o, ['lon', 'lng', 'longitude'])),
              cc,
              foreign,
              country: str(pick(o, ['country', 'country_name'])),
            } as LocSuggest;
          })
          .filter((l) => l.label && l.lat && l.lon)
          .slice(0, 6);
        setResults(list);
      } catch {
        if (mine === reqId.current) setResults([]);
      }
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [text, focused]);

  return (
    <View>
      <Label className="mb-1.5 text-muted">{label}</Label>
      {/* Shell matches TextField/SelectField exactly — min height rather than a
          fixed one, padding on the input rather than a stretched height, and a
          17px icon. It used to be h-12 with a 16px pin, which read a notch low
          against the Client and Vehicle-type rows directly above it. */}
      <View className={`min-h-[48px] flex-row items-center gap-2 rounded-xs border bg-surface px-3 ${focused ? 'border-accent' : 'border-line'}`}>
        <Icon name="pin" size={17} color={value ? colors.accent : colors.faint} />
        <TextInput
          className="flex-1 text-body text-fg"
          placeholder={placeholder}
          placeholderTextColor={colors.faint}
          value={text}
          onChangeText={(t) => {
            // A real keystroke means the settled value no longer applies, so
            // searching is wanted again.
            chosen.current = null;
            setText(t);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            // Delayed so a tap on a suggestion row still registers before the
            // list unmounts. Tracked so it can't fire into an unmounted field.
            if (blurTimer.current) clearTimeout(blurTimer.current);
            blurTimer.current = setTimeout(() => setFocused(false), 150);
          }}
          style={{ paddingVertical: 12 }}
        />
      </View>
      {value?.cc && isForeignCc(value.cc) && (
        <View className="mt-1.5 flex-row">
          <Badge label="Cross-border" tone="warning" />
        </View>
      )}
      {focused && results.length > 0 && (
        <View className="mt-2 overflow-hidden rounded-xs border border-line bg-surface">
          {results.map((r, i) => (
            <Pressable
              key={`${r.label}-${i}`}
              onPress={() => {
                // Settle on this label and discard any reply still in flight,
                // so nothing can refill the list behind the selection.
                chosen.current = r.label;
                reqId.current++;
                onChange(r);
                setText(r.label);
                setResults([]);
              }}
              className="flex-row items-center gap-2.5 border-b border-line-row px-3 py-3 active:bg-surface-hover"
            >
              <Icon name="pin" size={15} color={r.foreign ? '#F59E0B' : colors.faint} />
              <Txt className="flex-1 text-sub text-fg" numberOfLines={1}>
                {r.label}
              </Txt>
              {r.foreign && <Badge label={r.country || 'Cross-border'} tone="warning" />}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
