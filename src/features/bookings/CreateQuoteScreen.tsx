import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, TextInput } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchData } from '@/lib/api/client';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  SheetScreen,
  Group,
  DetailRow,
  RoutePreview,
  SegmentedControl,
  SelectField,
  TextField,
  Button,
  Icon,
  Txt,
  Mono,
  Label,
} from '@/components/ui';
import {
  useVehicleTypes,
  useCompanyProfileData,
  useFuelPrice,
  suggestLocations,
  calculateRoute,
  analyzeQuote,
  guardQuote,
  benchmarkQuote,
  createQuote,
  patchQuote,
  sendQuote,
} from './api';
import { useCustomers } from '@/features/customers/api';
import { num, str, pick, asArray } from '@/lib/api/list';
import { formatCurrency } from '@/lib/formatters';
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

  const [customerId, setCustomerId] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [pickup, setPickup] = useState<Loc | null>(null);
  const [delivery, setDelivery] = useState<Loc | null>(null);
  const [weight, setWeight] = useState(str(prefill?.weight, '28'));
  const [pickupDate, setPickupDate] = useState('');
  const [deliveryDate] = useState('');
  const [validUntil, setValidUntil] = useState(plusDays(7));
  const [cargo, setCargo] = useState(str(prefill?.cargo_description));
  const [tripType, setTripType] = useState<'ONE_WAY' | 'ROUND_TRIP'>('ROUND_TRIP');
  const [notes] = useState('');
  const [tollOverride, setTollOverride] = useState('');
  const [tollEdited, setTollEdited] = useState(false);
  const [driverAllowance, setDriverAllowance] = useState('0');
  const [baseRatePerKm, setBaseRatePerKm] = useState('');
  const [serviceCharge, setServiceCharge] = useState(0);

  const [routeData, setRouteData] = useState<Record<string, unknown> | null>(null);
  const [analysis, setAnalysis] = useState<Record<string, unknown> | null>(null);
  const [guard, setGuard] = useState<Record<string, unknown> | null>(null);
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
          cross_border_enabled: pickup.cc !== delivery.cc,
          weight_kg: Number(weight) * 1000 || 20000,
        });
        if (id === routeReq.current && (res as { success?: boolean }).success !== false) {
          setRouteData(res);
        }
      } catch {
        /* leave prior route */
      }
    }, 500);
    return () => clearTimeout(t);
  }, [ready, pickup, delivery, vehicleType, weight]);

  // ── Cost breakdown ──────────────────────────────────────────────────────
  const costs = useMemo(() => {
    const bestRoute = (() => {
      const routes = asArray(pick(routeData ?? {}, ['routes']));
      const bi = num(pick(routeData ?? {}, ['best_index']));
      return (routes[bi] ?? routes[0] ?? {}) as Record<string, unknown>;
    })();
    const distance = num(pick(bestRoute, ['distance_km'])) || num(pick(routeData ?? {}, ['distance_km']));
    const legs = tripType === 'ROUND_TRIP' ? 2 : 1;
    const chargeDistance = distance * legs;

    const consumption =
      (vtypes ?? []).find((v) => v.name === vehicleType)?.fuel_consumption_l_per_100km ??
      FUEL_FALLBACK[vehicleType] ??
      32;
    const fuelPrice = num(pick(fuel ?? {}, ['diesel_inland'])) || num(pick(company ?? {}, ['fuel_price_per_litre'])) || 21.7;
    const fuelCost = Math.round((chargeDistance * consumption * fuelPrice) / 100);

    const tollRate = num(pick(company ?? {}, ['default_toll_rate_per_km'])) || 0.95;
    const routeToll = num(pick(bestRoute, ['toll_cost_zar'])) || num(pick(routeData ?? {}, ['toll_cost_zar'])) || distance * tollRate;
    const tollCost = tollEdited ? Number(tollOverride) || 0 : Math.round(routeToll * legs);

    const add = (pick(routeData ?? {}, ['additional_costs']) ?? {}) as Record<string, unknown>;
    const crossBorderCost = Math.round(
      (num(pick(add, ['border_fees'])) + num(pick(add, ['weighbridge_fees'])) + num(pick(add, ['non_sa_tolls']))) * legs,
    );

    const weightKg = Number(weight) * 1000 || 0;
    const threshold = num(pick(company ?? {}, ['weight_surcharge_threshold_kg'])) || 5000;
    const pct = num(pick(company ?? {}, ['weight_surcharge_pct'])) || 15;
    const baseCost = Math.round(chargeDistance * (Number(baseRatePerKm) || 0));
    const weightSurcharge = weightKg > threshold ? Math.round((baseCost * pct) / 100) : 0;
    const driver = Number(driverAllowance) || 0;

    const total = baseCost + fuelCost + tollCost + crossBorderCost + driver + weightSurcharge + serviceCharge;
    const directCost = total - serviceCharge;
    const marginPct = total > 0 ? Math.round(((total - directCost) / total) * 100) : 0;
    const duration = num(pick(bestRoute, ['duration_minutes'])) || num(pick(bestRoute, ['duration_min']));

    return {
      distance,
      chargeDistance,
      fuelCost,
      tollCost,
      routeToll: Math.round(routeToll * legs),
      crossBorderCost,
      baseCost,
      weightSurcharge,
      driver,
      total,
      directCost,
      marginPct,
      duration,
      fuelUsage: Math.round((chargeDistance * consumption) / 100),
      fuelPrice,
    };
  }, [routeData, tripType, vtypes, vehicleType, fuel, company, weight, baseRatePerKm, tollEdited, tollOverride, driverAllowance, serviceCharge]);

  // AI analyze + guard (debounced 700ms, stale-guarded).
  useEffect(() => {
    if (!routeData || costs.total <= 0 || !pickup || !delivery) return;
    const id = ++aiReq.current;
    const t = setTimeout(async () => {
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
          market_rate: 0,
          client_tier: 'standard',
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
      }
      benchmarkQuote(extractCode(pickup.label), extractCode(delivery.label), vehicleType).catch(() => null);
    }, 700);
    return () => clearTimeout(t);
  }, [routeData, costs, pickup, delivery, vehicleType, weight]);

  const opt = (pick(analysis ?? {}, ['price_optimization']) ?? {}) as Record<string, unknown>;
  const recPrice = num(pick(opt, ['optimal_price'])) || num(pick(analysis ?? {}, ['suggested_price'])) || costs.total;
  const winProb = num(pick(opt, ['win_probability_at_optimal']));
  const riskLevel = str(pick(guard ?? {}, ['risk_level']), 'SAFE');
  const guardMsg =
    (asArray<string>(pick(guard ?? {}, ['explanations']))[0] as unknown as string) ||
    (asArray<string>(pick(guard ?? {}, ['warnings']))[0] as unknown as string) ||
    'Margin is below your guardrail — review before sending.';

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
            <TextField label="Pickup date" placeholder="YYYY-MM-DD" value={pickupDate} onChangeText={setPickupDate} />
          </View>
          <View className="flex-1">
            <TextField label="Valid until" placeholder="YYYY-MM-DD" value={validUntil} onChangeText={setValidUntil} />
          </View>
        </View>
      </View>

      {/* Route + estimate */}
      {ready && (
        <View className="mt-5 gap-5">
          <RoutePreview
            origin={pickup!.label}
            dest={delivery!.label}
            distance={costs.distance ? `${Math.round(costs.chargeDistance)} km` : 'Calculating…'}
            duration={costs.duration ? `${Math.round(costs.duration / 60)}h ${Math.round(costs.duration % 60)}m` : undefined}
          />

          {costs.total > 0 && (
            <>
              {/* AI recommendation */}
              <View className="rounded-xs border border-accent bg-surface px-4 py-3.5">
                <View className="flex-row items-center justify-between">
                  <View>
                    <Label className="text-accent" style={{ fontSize: 10 }}>
                      Recommended{costs.marginPct ? ` · ${costs.marginPct}% margin` : ''}
                    </Label>
                    <Mono className="mt-1 text-fg" style={{ fontSize: 24, fontWeight: '600' }}>
                      {formatCurrency(recPrice)}
                    </Mono>
                  </View>
                  {winProb > 0 && (
                    <View className="items-end">
                      <Label className="text-faint">Win prob</Label>
                      <Mono className="text-accent" style={{ fontSize: 16, fontWeight: '600' }}>
                        {Math.round(winProb * 100)}%
                      </Mono>
                    </View>
                  )}
                </View>
                {Math.abs(recPrice - costs.total) > 1 && (
                  <Pressable onPress={applyRecommended} className="mt-2 self-start">
                    <Mono className="text-micro tracking-wide uppercase text-accent">Apply recommended →</Mono>
                  </Pressable>
                )}
              </View>

              {riskLevel !== 'SAFE' && (
                <View className={`flex-row items-center gap-2.5 rounded-xs border p-3 ${riskLevel === 'AT_RISK' ? 'border-danger bg-danger-bg' : 'border-warning bg-warning-bg'}`}>
                  <Icon name="alert" size={17} color={riskLevel === 'AT_RISK' ? '#FF4949' : '#F59E0B'} />
                  <Txt className="flex-1 text-sub text-muted">{guardMsg}</Txt>
                </View>
              )}

              <Group label="Cost breakdown">
                <DetailRow label="Base rate" value={formatCurrency(costs.baseCost)} />
                <DetailRow label="Fuel" value={formatCurrency(costs.fuelCost)} />
                <TollRow value={tollEdited ? tollOverride : String(costs.tollCost)} onEdit={(v) => { setTollEdited(true); setTollOverride(v); }} />
                {costs.crossBorderCost > 0 && <DetailRow label="Cross-border" value={formatCurrency(costs.crossBorderCost)} />}
                {costs.weightSurcharge > 0 && <DetailRow label="Weight surcharge" value={formatCurrency(costs.weightSurcharge)} />}
                <DriverRow value={driverAllowance} onEdit={setDriverAllowance} />
                {serviceCharge !== 0 && <DetailRow label="Service adjustment" value={formatCurrency(serviceCharge)} />}
                <View className="flex-row items-center justify-between bg-surface-hover px-3.5 py-3.5">
                  <Txt className="text-callout font-semibold text-fg">Total · {costs.marginPct}% margin</Txt>
                  <Mono className="text-heading font-semibold text-accent">{formatCurrency(costs.total)}</Mono>
                </View>
              </Group>
            </>
          )}
        </View>
      )}
    </SheetScreen>
  );
}

// Editable rows for toll + driver allowance.
function TollRow({ value, onEdit }: { value: string; onEdit: (v: string) => void }) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center justify-between border-b border-line-row px-3.5 py-2.5">
      <Txt className="text-callout text-muted">Tolls</Txt>
      <View className="flex-row items-center gap-1">
        <Mono className="text-sub text-faint">R</Mono>
        <TextInput
          className="min-w-[70px] text-right text-sub text-fg"
          keyboardType="numeric"
          value={value}
          onChangeText={onEdit}
          style={{ fontFamily: 'Menlo' }}
          placeholderTextColor={colors.faint}
        />
      </View>
    </View>
  );
}

function DriverRow({ value, onEdit }: { value: string; onEdit: (v: string) => void }) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center justify-between border-b border-line-row px-3.5 py-2.5">
      <Txt className="text-callout text-muted">Driver allowance</Txt>
      <View className="flex-row items-center gap-1">
        <Mono className="text-sub text-faint">R</Mono>
        <TextInput
          className="min-w-[70px] text-right text-sub text-fg"
          keyboardType="numeric"
          value={value}
          onChangeText={onEdit}
          style={{ fontFamily: 'Menlo' }}
          placeholderTextColor={colors.faint}
        />
      </View>
    </View>
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
