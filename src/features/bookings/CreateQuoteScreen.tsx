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
  Toggle,
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
  createQuote,
  patchQuote,
  sendQuote,
} from './api';
import { useCustomers } from '@/features/customers/api';
import { num, str, pick, asArray } from '@/lib/api/list';
import { formatCurrency, formatCurrencyCompact, formatDuration } from '@/lib/formatters';
import { useTheme } from '@/theme/ThemeProvider';
import { toast } from '@/lib/toast';
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
  const [weight, setWeight] = useState(str(prefill?.weight, '28'));
  const [pickupDate, setPickupDate] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [validUntil, setValidUntil] = useState(plusDays(7));
  const [cargo, setCargo] = useState(str(prefill?.cargo_description));
  const [tripType, setTripType] = useState<'ONE_WAY' | 'ROUND_TRIP'>('ROUND_TRIP');
  const [crossBorder, setCrossBorder] = useState(true);
  const [notes, setNotes] = useState('');
  const [nlText, setNlText] = useState('');
  const [nlBusy, setNlBusy] = useState(false);
  const [benchmark, setBenchmark] = useState<Record<string, unknown> | null>(null);
  const [tollOverride, setTollOverride] = useState('');
  const [tollEdited, setTollEdited] = useState(false);
  const [driverAllowance, setDriverAllowance] = useState('0');
  const [baseRatePerKm, setBaseRatePerKm] = useState('');
  const [serviceCharge, setServiceCharge] = useState(0);

  const [routeData, setRouteData] = useState<Record<string, unknown> | null>(null);
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

  // Defaults from company profile (deferred to avoid sync setState in effect).
  useEffect(() => {
    if (!company || baseRatePerKm || editing) return;
    const t = setTimeout(() => setBaseRatePerKm(String(num(pick(company, ['default_base_rate_per_km']), 10))), 0);
    return () => clearTimeout(t);
  }, [company, baseRatePerKm, editing]);

  // Company can force cross-border off (derived, no state churn).
  const allowCrossBorder = pick(company ?? {}, ['allow_cross_border']) !== false;
  const effectiveCrossBorder = crossBorder && allowCrossBorder;

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
        setBaseRatePerKm(String(Math.round((baseRate / (dist * legs)) * 100) / 100));
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
          cross_border_enabled: effectiveCrossBorder,
          weight_kg: Number(weight) * 1000 || 20000,
        });
        if (id === routeReq.current && (res as { success?: boolean }).success !== false) {
          setRouteData(res);
          setSelectedRouteIndex(num(pick(res, ['best_index'])) || 0);
        }
      } catch {
        /* leave prior route */
      } finally {
        if (id === routeReq.current) setRouteBusy(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [ready, pickup, delivery, vehicleType, weight, effectiveCrossBorder]);

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
    const tollCost = tollEdited ? Number(tollOverride) || 0 : Math.round(routeTollOneWay * legs);
    const tollBreakdown = (asArray(pick(currentRoute, ['toll_breakdown'])).length
      ? asArray(pick(currentRoute, ['toll_breakdown']))
      : asArray(pick(routeData ?? {}, ['toll_breakdown']))) as Record<string, unknown>[];

    const add = (pick(routeData ?? {}, ['additional_costs']) ?? {}) as Record<string, unknown>;
    const crossBorderCost = Math.round(
      (num(pick(add, ['border_fees'])) + num(pick(add, ['weighbridge_fees'])) + num(pick(add, ['non_sa_tolls']))) * legs,
    );

    const weightKg = Number(weight) * 1000 || 0;
    const threshold = num(pick(company ?? {}, ['weight_surcharge_threshold_kg'])) || 5000;
    const baseCost = Math.round(chargeDistance * (Number(baseRatePerKm) || 0));
    const weightSurcharge = weightKg > threshold ? Math.round((baseCost * surchargePctBase) / 100) : 0;
    const driver = Number(driverAllowance) || 0;

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
  }, [currentRoute, routeData, tripType, vtypes, vehicleType, fuel, company, weight, baseRatePerKm, tollEdited, tollOverride, driverAllowance, serviceCharge]);

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
          weight: Number(weight) * 1000,
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
  const recPrice = num(pick(opt, ['optimal_price'])) || num(pick(analysis ?? {}, ['suggested_price'])) || costs.total;
  const optMargin = num(pick(opt, ['optimal_margin_pct'])) || costs.marginPct;
  const winProb = num(pick(opt, ['win_probability_at_optimal']));
  const expProfit = pick(opt, ['expected_profit']) != null ? num(pick(opt, ['expected_profit'])) : recPrice - costs.directCost;
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
  const winModel = (pick(modelStats ?? {}, ['win_model']) ?? {}) as Record<string, unknown>;
  const aiLearning = str(pick(winModel, ['mode'])) === 'heuristic';
  const estimateLoading = (routeBusy || aiBusy) && !analysis;
  const guardMsg =
    (asArray<string>(pick(guard ?? {}, ['explanations']))[0] as unknown as string) ||
    (asArray<string>(pick(guard ?? {}, ['warnings']))[0] as unknown as string) ||
    (asArray<string>(pick(guard ?? {}, ['suggestions']))[0] as unknown as string) ||
    'Margin is below your guardrail — review before sending.';

  const submitNL = async () => {
    if (!nlText.trim() || nlBusy) return;
    setNlBusy(true);
    try {
      const res = await aiChatQuote(nlText, [], {});
      const ex = (pick(res, ['extracted_fields']) ?? {}) as Record<string, unknown>;
      if (pick(ex, ['cargo_description'])) setCargo(str(pick(ex, ['cargo_description'])));
      if (pick(ex, ['weight'])) setWeight(String(num(pick(ex, ['weight']))));
      if (pick(ex, ['vehicle_type'])) setVehicleType(str(pick(ex, ['vehicle_type'])));
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
      toast.success('Filled from description');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not parse');
    } finally {
      setNlBusy(false);
    }
  };

  const applyRecommended = () => {
    const target = num(pick(opt, ['optimal_price'])) || num(pick(analysis ?? {}, ['suggested_price']));
    if (target > 0) setServiceCharge((sc) => Math.max(0, sc + (target - costs.total)));
  };

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
    weight: Number(weight) * 1000,
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
    if (!customerId) return toast.error('Select a client');
    if (!ready) return toast.error('Add pickup and drop-off');
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
      await qc.invalidateQueries({ queryKey: ['quotes'] });
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
      onBack={() => navigation.goBack()}
      footer={
        <View className="flex-row gap-2.5">
          <View className="flex-1">
            <Button label="Save draft" variant="secondary" loading={busy} onPress={() => save(false)} fullWidth />
          </View>
          <View className="flex-1">
            <Button label="Send to client" icon="send" loading={busy} disabled={!ready} onPress={() => save(true)} fullWidth />
          </View>
        </View>
      }
    >
      <View className="gap-4">
        {/* Natural-language quick fill */}
        <View className="rounded-xs border border-line bg-surface p-3">
          <View className="mb-2 flex-row items-center gap-1.5">
            <Icon name="sparkle" size={14} color="#4D9EFF" />
            <Label className="text-accent">Describe it</Label>
          </View>
          <TextField
            placeholder="e.g. 20t steel, Johannesburg to Cape Town, flatbed"
            value={nlText}
            onChangeText={setNlText}
            multiline
          />
          <Button label="Fill from description" icon="sparkle" variant="secondary" loading={nlBusy} onPress={submitNL} fullWidth className="mt-2" />
        </View>

        <SelectField label="Client" icon="user" placeholder="Select customer" options={customerOptions} value={customerId} onSelect={setCustomerId} />
        <SelectField label="Vehicle type" icon="truck" placeholder="Select vehicle type" options={vtypeOptions} value={vehicleType} onSelect={setVehicleType} />
        <LocationField label="Collection" value={pickup} onChange={setPickup} placeholder="Search origin" />
        <LocationField label="Drop-off" value={delivery} onChange={setDelivery} placeholder="Search destination" />

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

        {allowCrossBorder && (
          <View className="flex-row items-center justify-between rounded-xs border border-line bg-surface px-3.5 py-3">
            <View className="flex-1 pr-3">
              <Txt className="text-callout text-fg">Cross-border</Txt>
              <Txt className="mt-0.5 text-caption text-faint">Include border fees, weighbridge & non-SA tolls</Txt>
            </View>
            <Toggle value={crossBorder} onValueChange={setCrossBorder} />
          </View>
        )}

        <View className="flex-row gap-3">
          <View className="flex-1">
            <TextField label="Weight (tons)" keyboardType="numeric" value={weight} onChangeText={setWeight} />
          </View>
          <View className="flex-1">
            <TextField label="R / km" keyboardType="numeric" value={baseRatePerKm} onChangeText={setBaseRatePerKm} />
          </View>
        </View>
        <TextField label="Cargo" placeholder="e.g. Steel coils" value={cargo} onChangeText={setCargo} />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <DateField label="Pickup date" value={pickupDate} onChange={setPickupDate} />
          </View>
          <View className="flex-1">
            <DateField label="Delivery date" value={deliveryDate} onChange={setDeliveryDate} />
          </View>
        </View>
        <DateField label="Valid until" value={validUntil} onChange={setValidUntil} />
        <TextField label="Notes" placeholder="Anything the client should see" value={notes} onChangeText={setNotes} multiline />
      </View>

      {/* Route + estimate */}
      {ready && (
        <View className="mt-5 gap-5">
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
                <View className="p-4">
                  {/* Recommended price — full width */}
                  <Label className="text-faint">Recommended price</Label>
                  {estimateLoading ? (
                    <View className="mt-2 flex-row items-center gap-2">
                      <ActivityIndicator size="small" color="#4D9EFF" />
                      <Mono className="text-callout text-muted">Optimising price…</Mono>
                    </View>
                  ) : (
                    <Mono className="mt-1 text-accent" style={{ fontSize: 26, fontWeight: '700' }} numberOfLines={1} adjustsFontSizeToFit>
                      {formatCurrency(recPrice)}
                    </Mono>
                  )}

                  {/* Margin + win probability */}
                  <View className="mt-4 flex-row gap-8">
                    <View className="flex-1">
                      <Label className="text-faint">Margin</Label>
                      <Mono className="mt-1 text-fg" style={{ fontSize: 18, fontWeight: '600' }}>
                        {estimateLoading ? '—' : `${Math.round(optMargin)}%`}
                      </Mono>
                      {!(estimateLoading) && (
                        <Mono className="text-micro text-success">{formatCurrencyCompact(expProfit)} profit</Mono>
                      )}
                    </View>
                    <View className="flex-1">
                      <Label className="text-faint">Win probability</Label>
                      <Mono className="mt-1 text-fg" style={{ fontSize: 15, fontWeight: '600' }}>
                        {estimateLoading ? '—' : winProb > 0 ? `${Math.round(winProb * 100)}%` : '—'}
                      </Mono>
                      <View className="mt-1.5 h-1 overflow-hidden rounded-pill bg-surface-hover">
                        <View style={{ width: `${Math.min(100, Math.round(winProb * 100))}%`, height: '100%' }} className="bg-accent" />
                      </View>
                    </View>
                  </View>

                  {/* Profit sweet-spot — full width, tap to inspect */}
                  <View className="mt-4">
                    <Label className="mb-1 text-faint">Profit sweet-spot · tap to inspect</Label>
                    {estimateLoading ? (
                      <View style={{ height: 56 }} className="items-center justify-center">
                        <ActivityIndicator size="small" color="#4D9EFF" />
                      </View>
                    ) : (
                      <ProfitCurve points={curveData} optimalMargin={Math.round(optMargin)} height={56} />
                    )}
                  </View>

                  {(num(pick(opt, ['optimal_price'])) > 0 || num(pick(analysis ?? {}, ['suggested_price'])) > 0) && (
                    <Button label="Apply recommended" variant="secondary" icon="sparkle" onPress={applyRecommended} fullWidth className="mt-4" />
                  )}
                </View>

                {riskLevel !== 'SAFE' && (
                  <View className={`flex-row items-center gap-2.5 border-t border-line p-3 ${riskLevel === 'AT_RISK' ? 'bg-danger-bg' : 'bg-warning-bg'}`}>
                    <Icon name="alert" size={16} color={riskLevel === 'AT_RISK' ? '#FF4949' : '#F59E0B'} />
                    <Txt className="flex-1 text-sub text-muted">{guardMsg}</Txt>
                  </View>
                )}

                {aiLearning && (
                  <View className="flex-row gap-2.5 border-t border-line bg-warning-bg p-3">
                    <Icon name="sparkle" size={16} color="#F59E0B" />
                    <Txt className="flex-1 text-sub text-muted">
                      <Txt className="text-sub font-semibold text-fg">AI pricing is still learning your fleet. </Txt>
                      Priced on true cost + your {vehicleType} base rate for now — needs ~
                      {num(pick(winModel, ['outcomes_needed']))} completed loads (
                      {num(pick(winModel, ['outcomes_collected']))}/{num(pick(winModel, ['outcomes_needed']))} logged).
                    </Txt>
                  </View>
                )}
              </Group>

              {/* Cost breakdown */}
              <Group label={`Cost breakdown · ${vehicleType || '—'}`}>
                <DetailRow label={`Fuel — ${costs.consumption} L/100km @ R${costs.fuelPrice}`} value={formatCurrency(costs.fuelCost)} />
                <Pressable onPress={() => setTollModal(true)} className="flex-row items-center justify-between border-b border-line-row px-3.5 py-3">
                  <View className="flex-row items-center gap-1.5">
                    <Txt className="text-callout text-muted">Tolls (SA plazas)</Txt>
                    <Icon name="alert" size={13} color="#888888" />
                  </View>
                  <Mono className="text-sub font-medium text-fg">{formatCurrency(costs.tollCost)}</Mono>
                </Pressable>
                {costs.crossBorderCost > 0 && <DetailRow label="Cross-border / weighbridge" value={formatCurrency(costs.crossBorderCost)} />}
                <DetailRow label="Driver allowance" value={formatCurrency(costs.driver)} />
                {costs.weightSurcharge > 0 && <DetailRow label={`Weight surcharge (${costs.surchargePct}%)`} value={formatCurrency(costs.weightSurcharge)} />}
                <DetailRow label={`Base rate (${vehicleType || '—'} · R${baseRatePerKm || 0}/km)`} value={formatCurrency(costs.baseCost)} />
                {serviceCharge !== 0 && <DetailRow label="Service adjustment" value={formatCurrency(serviceCharge)} />}
                <View className="flex-row items-center justify-between bg-surface-hover px-3.5 py-3.5">
                  <Txt className="text-callout font-semibold text-fg">Quote total · {costs.marginPct}% margin</Txt>
                  <Mono className="text-heading font-semibold text-accent">{formatCurrency(costs.total)}</Mono>
                </View>
                <View className="px-3.5 py-2">
                  <Mono className="text-micro text-faint">
                    {Math.round(costs.distance)} km one way · {Math.round(costs.chargeDistance)} km {tripType === 'ROUND_TRIP' ? 'round trip' : 'total'}
                  </Mono>
                </View>
              </Group>

              {/* Editable overrides */}
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <TextField
                    label="Tolls (R)"
                    keyboardType="numeric"
                    value={tollEdited ? tollOverride : String(costs.tollCost)}
                    onChangeText={(v) => {
                      setTollEdited(true);
                      setTollOverride(v);
                    }}
                  />
                </View>
                <View className="flex-1">
                  <TextField label="Driver (R)" keyboardType="numeric" value={driverAllowance} onChangeText={setDriverAllowance} />
                </View>
                <View className="flex-1">
                  <TextField label="R / km" keyboardType="numeric" value={baseRatePerKm} onChangeText={setBaseRatePerKm} />
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
    </SheetScreen>
  );
}


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
  const [results, setResults] = useState<Loc[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reflect an externally-set value (e.g. edit-mode hydration) into the input.
  useEffect(() => {
    if (!value?.label || value.label === text) return;
    const t = setTimeout(() => setText(value.label), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.label]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!focused || text.length < 2) {
      timer.current = setTimeout(() => setResults([]), 0);
      return () => {
        if (timer.current) clearTimeout(timer.current);
      };
    }
    timer.current = setTimeout(async () => {
      try {
        const raw = await suggestLocations(text);
        const list = asArray(raw)
          .map((r) => {
            const o = r as Record<string, unknown>;
            return {
              label: str(pick(o, ['label', 'name', 'description', 'address'])),
              lat: num(pick(o, ['lat', 'latitude'])),
              lon: num(pick(o, ['lon', 'lng', 'longitude'])),
              cc: str(pick(o, ['country_code', 'country'])) || undefined,
            } as Loc;
          })
          .filter((l) => l.label && l.lat && l.lon)
          .slice(0, 6);
        setResults(list);
      } catch {
        setResults([]);
      }
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [text, focused]);

  return (
    <View>
      <Label className="mb-1.5 text-muted">{label}</Label>
      <View className={`min-h-[48px] flex-row items-center gap-2 rounded-xs border bg-surface px-3 ${focused ? 'border-accent' : 'border-line'}`}>
        <Icon name="pin" size={16} color={value ? colors.accent : colors.faint} />
        <TextInput
          className="flex-1 text-body text-fg"
          placeholder={placeholder}
          placeholderTextColor={colors.faint}
          value={text}
          onChangeText={setText}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          style={{ paddingVertical: 12 }}
        />
      </View>
      {focused && results.length > 0 && (
        <View className="mt-2 overflow-hidden rounded-xs border border-line bg-surface">
          {results.map((r, i) => (
            <Pressable
              key={`${r.label}-${i}`}
              onPress={() => {
                onChange(r);
                setText(r.label);
                setResults([]);
              }}
              className="flex-row items-center gap-2.5 border-b border-line-row px-3 py-3 active:bg-surface-hover"
            >
              <Icon name="pin" size={15} color={colors.faint} />
              <Txt className="flex-1 text-sub text-fg">{r.label}</Txt>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
