import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  View,
  Pressable,
  Platform,
  Keyboard,
  useWindowDimensions,
  InteractionManager,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import BottomSheet, {
  BottomSheetFooter,
  BottomSheetScrollView,
  useBottomSheetInternal,
  KEYBOARD_STATUS,
  type BottomSheetFooterProps,
  type BottomSheetScrollViewMethods,
} from '@gorhom/bottom-sheet';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchData } from '@/lib/api/client';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  RoutePreview,
  SegmentedControl,
  SelectField,
  TextField,
  DateField,
  Button,
  Icon,
  Txt,
  Label,
  type CurvePoint,
} from '@/components/ui';
import {
  useVehicleTypes,
  useCompanyProfileData,
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
import type { GeoPoint } from '@/lib/routeGeometry';
import { MapCanvas } from './quote/MapCanvas';
import { CrosshairOverlay, type PickTarget } from './quote/CrosshairOverlay';
import { reverseGeocode } from '@/lib/geocode';
import { VoiceQuoteSheet } from './VoiceQuoteSheet';
import { WorkingOverlay } from '@/components/feedback';
import { num, str, pick, asArray } from '@/lib/api/list';
import { formatDuration, formatPlain, parseNum } from '@/lib/formatters';
import { useTheme } from '@/theme/ThemeProvider';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import { dismissKeyboard } from '@/lib/keyboard';
import { useSubscription } from '@/hooks/useSubscription';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import type { AppStackParamList } from '@/navigation/types';
import {
  type Loc,
  type StopEntry,
  type SectionId,
  roundCoord,
  extractCode,
  isForeignCc,
  plusDays,
  startOfToday,
  MAX_PLAUSIBLE_MARKUP_PCT,
} from './quote/types';
import { computeCosts } from './quote/costs';
import { buildQuotePayload } from './quote/payload';
import { LocationField } from './quote/LocationField';
import { StopLocationRow } from './quote/StopLocationRow';
import { NaturalLanguageBar, type NaturalLanguageBarHandle } from './quote/NaturalLanguageBar';
import { QuoteSection } from './quote/QuoteSection';
import {
  QuoteJumpBar,
  type QuoteJumpBarHandle,
  type QuoteJumpBarSection,
} from './quote/QuoteJumpBar';
import { RouteOptionChips } from './quote/RouteOptionChips';
import { AiRecommendationCard } from './quote/AiRecommendationCard';
import { CostBreakdownCard } from './quote/CostBreakdownCard';
import { CostOverrides } from './quote/CostOverrides';
import { TollBreakdownModal } from './quote/TollBreakdownModal';
import { QuoteSentOverlay } from './quote/QuoteSentOverlay';
import {
  collectIssues,
  formatGapList,
  missingPriceInputs,
  type QuoteIssue,
} from './quote/validation';
import { QuoteFooterActions, type FooterStrip } from './quote/QuoteFooterActions';

type Props = NativeStackScreenProps<AppStackParamList, 'CreateQuote'>;

// The map sits behind the sheet, so it needs to know how much of itself is
// covered — both to keep the route clear of it and to place the confirm card.
// Two stops, and the upper one caps at 70% so the map always keeps ~30%. It
// used to go to 94%, which left the map as a sliver and made the whole
// map-first idea pointless. A middle stop made the drag feel indecisive.
//
// keyboardBehavior lifts the sheet past this while a field is focused, which
// has to stay — otherwise you type into an input under the keyboard. The floor
// is a constraint on dragging, not on the keyboard.
//
// Module-level rather than useMemo([]) — the values never change, so there's
// no reason to spend two hooks re-confirming that every render.
const SNAP_FRACTIONS = [0.36, 0.7] as const;
const SNAP = SNAP_FRACTIONS.map((f) => `${Math.round(f * 100)}%`);

// Section order for the jump bar and for the scroll-position → active-chip
// lookup below. Fixed, so it lives at module scope rather than being
// recomputed per render.
const SECTION_ORDER: SectionId[] = ['client', 'route', 'load', 'schedule', 'price'];

export function CreateQuoteScreen({ route, navigation }: Props) {
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
  const { data: modelStats } = useModelStats();
  // A suspended or cancelled subscription blocks new quotes server-side
  // (PlanLimitsMiddleware), so gate it here too rather than letting the user
  // build a whole quote and take a 403 on save.
  const subscription = useSubscription();

  const [customerId, setCustomerId] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [pickup, setPickup] = useState<Loc | null>(null);
  const [delivery, setDelivery] = useState<Loc | null>(null);
  const [stops, setStops] = useState<StopEntry[]>([]);
  const stopSeq = useRef(0);
  const [weight, setWeight] = useState(str(prefill?.weight));
  const [pickupDate, setPickupDate] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  useEffect(() => {
    if (pickupDate && deliveryDate && deliveryDate < pickupDate) setDeliveryDate('');
  }, [pickupDate]);
  const [validUntil, setValidUntil] = useState(plusDays(7));
  const [cargo, setCargo] = useState(str(prefill?.cargo_description));
  const [tripType, setTripType] = useState<'ONE_WAY' | 'ROUND_TRIP'>('ONE_WAY');
  const [notes, setNotes] = useState('');
  const [nlReply, setNlReply] = useState('');
  const nlBarRef = useRef<NaturalLanguageBarHandle>(null);
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

  // Unsaved-changes baseline (Phase 4) — null until captured (see the two
  // effects below), so isDirty is false rather than a false positive during
  // the window before either capture point is reached.
  const baselineRef = useRef<string | null>(null);
  const snapshotTuple = () =>
    JSON.stringify([
      customerId,
      vehicleType,
      pickup?.label,
      delivery?.label,
      stops.length,
      weight,
      cargo,
      notes,
      pickupDate,
      deliveryDate,
      validUntil,
      tripType,
      tollEdited,
      driverAllowance,
      baseRatePerKm,
      serviceCharge,
    ]);

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
  const [busy, setBusy] = useState<'draft' | 'send' | null>(null);
  // Validation surfacing (Phase 3): never on first paint, Weight shows its
  // error once the user leaves it, everything else waits for a Send attempt
  // — and then stays visible (never reset) so it clears live as fields fill.
  const [weightTouched, setWeightTouched] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState<'draft' | 'send' | null>(null);
  // Send/save confirmation (Phase 4) — replaces the old instant goBack(); see
  // save() below and QuoteSentOverlay's render near the end of this file.
  const [sentOverlay, setSentOverlay] = useState<{
    kind: 'draft' | 'send';
    emailSent: boolean;
    total: number;
    clientName: string;
    id: string | number;
  } | null>(null);
  // True once a save has actually completed — the unsaved-changes guard
  // (below) reads this so dismissing the confirmation overlay doesn't itself
  // trigger a "discard this quote?" prompt.
  const completedRef = useRef(false);
  const savedId = useRef<string | number | null>(null);
  const routeReq = useRef(0);
  const aiReq = useRef(0);
  // Lane the last benchmark fetch was for ("origin|destination|vehicleType").
  // Guards benchmarkQuote below so a keystroke in Tolls/Driver/Rate — which
  // re-fires the AI effect via costs, but changes none of the three benchmark
  // args — doesn't cost a wasted /benchmark/ round-trip.
  const benchKey = useRef('');

  // ── Map-first shell ──────────────────────────────────────────────────────
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const { colors } = useTheme();
  const sheetRef = useRef<BottomSheet>(null);
  const [snapIndex, setSnapIndex] = useState(0);
  const sheetHeight = screenH * (SNAP_FRACTIONS[Math.max(0, snapIndex)] ?? SNAP_FRACTIONS[0]!);
  // Where to put the sheet back when a pick ends — onChange also reports -1
  // while the sheet is closed for a pick, which is not a place to return to.
  const lastOpenIndex = useRef(0);
  const onSheetChange = useCallback((i: number) => {
    setSnapIndex(i);
    if (i >= 0) lastOpenIndex.current = i;
  }, []);

  const [picking, setPicking] = useState<PickTarget | null>(null);
  const [pinLabel, setPinLabel] = useState<string | null>(null);
  const [pinPlace, setPinPlace] = useState<{ label: string; cc: string } | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  // True as soon as the map has settled on a point at least once this pick
  // session — independent of whether the address lookup for it has finished
  // or even succeeded. Confirming only ever needs a coordinate; gating it on
  // the geocode meant a spot with no resolvable address (a farm gate, a yard
  // with no listed address) couldn't be confirmed at all, forcing the pin to
  // be dragged toward wherever *did* resolve — i.e. the nearest named place,
  // not the exact one being marked.
  const [pinReady, setPinReady] = useState(false);
  const pinCentre = useRef<GeoPoint | null>(null);
  const pinReq = useRef(0);
  const pinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const beginPick = useCallback((target: PickTarget) => {
    setPicking(target);
    setPinLabel(null);
    setPinPlace(null);
    setPinError(null);
    setPinReady(false);
    // Off-screen for the duration of the pick, so the map is unobstructed and
    // the sheet can't be dragged up under the centre-locked pin. close()
    // rather than a style/opacity hide: @gorhom/bottom-sheet composes its own
    // animated opacity after the `style` prop (BottomSheetBody), so
    // `style={{opacity: 0}}` is a no-op — and even if it weren't, a
    // transparent sheet still takes touches. Children stay mounted at index
    // -1, so the form keeps its state.
    Keyboard.dismiss();
    sheetRef.current?.close();
  }, []);

  const endPick = useCallback(() => {
    if (pinTimer.current) clearTimeout(pinTimer.current);
    pinReq.current++;
    setPicking(null);
    setPinBusy(false);
    setPinError(null);
    setPinReady(false);
    sheetRef.current?.snapToIndex(lastOpenIndex.current);
  }, []);

  const removeStop = useCallback((id: string) => {
    setStops((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const updateStop = useCallback((id: string, loc: Loc) => {
    setStops((prev) => prev.map((s) => (s.id === id ? { ...s, loc } : s)));
  }, []);

  // Simple index swap — no drag gesture, matches the up/down affordance in the UI.
  const moveStop = useCallback((id: string, dir: -1 | 1) => {
    setStops((prev) => {
      const i = prev.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  }, []);

  const addStop = useCallback(() => {
    const id = `stop-${++stopSeq.current}`;
    setStops((prev) => [...prev, { id, loc: null }]);
  }, []);

  /**
   * The map settled on a new centre. Debounced, and sequence-guarded so a slow
   * lookup for a point the user has already dragged away from can't overwrite a
   * newer one.
   */
  const onCentreSettled = useCallback(
    (point: GeoPoint) => {
      if (!picking) return;
      pinCentre.current = point;
      setPinReady(true);
      if (pinTimer.current) clearTimeout(pinTimer.current);
      setPinError(null);
      setPinBusy(true);
      pinTimer.current = setTimeout(async () => {
        const mine = ++pinReq.current;
        try {
          const place = await reverseGeocode(point);
          if (mine !== pinReq.current) return;
          setPinPlace({ label: place.label, cc: place.cc });
          setPinLabel(place.label);
        } catch (e) {
          if (mine !== pinReq.current) return;
          setPinPlace(null);
          setPinLabel(null);
          setPinError(e instanceof Error ? e.message : "Couldn't find that address");
        } finally {
          if (mine === pinReq.current) setPinBusy(false);
        }
      }, 400);
    },
    [picking],
  );

  const confirmPick = useCallback(() => {
    const centre = pinCentre.current;
    if (!picking || !centre) return;
    // The pin itself is always this exact coordinate. The address lookup only
    // supplies a friendlier label for it — when it hasn't resolved (or can't,
    // for a spot with no known nearby address), fall back to the coordinates
    // themselves rather than blocking the confirm on a name existing at all.
    const loc: Loc = {
      label: pinPlace?.label ?? `${centre.lat.toFixed(5)}, ${centre.lon.toFixed(5)}`,
      lat: roundCoord(centre.lat),
      lon: roundCoord(centre.lon),
      cc: pinPlace?.cc || undefined,
    };
    const wasPicking = picking;
    // A confirmed point always reopens the sheet expanded, not wherever it
    // was before the pick.
    lastOpenIndex.current = 1;
    // A stop pin never auto-advances to another field — just settles and
    // reopens the sheet, unlike the pickup/dropoff chain below.
    if (typeof wasPicking === 'object') {
      updateStop(wasPicking.stop, loc);
      endPick();
      return;
    }
    if (wasPicking === 'pickup') setPickup(loc);
    else setDelivery(loc);
    endPick();
  }, [picking, pinPlace, endPick, updateStop]);

  useEffect(
    () => () => {
      if (pinTimer.current) clearTimeout(pinTimer.current);
    },
    [],
  );

  // This screen draws its own chrome over the map, so the native header goes.
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // route.params.ai (Phase 4) — declared in navigation/types.ts and passed by
  // useAppNavigation().createQuote(true), but never read until now. Written
  // by the Bookings/Home Fab's onLongPress.
  useEffect(() => {
    if (route.params?.ai !== true || editing) return;
    // One-shot: without clearing it, a remount (or restored nav state)
    // re-presents the recorder on top of a half-typed form.
    navigation.setParams({ ai: undefined });
    sheetRef.current?.snapToIndex(1);
    const t = setTimeout(() => setVoiceOpen(true), 350); // let the sheet settle first
    return () => clearTimeout(t);
  }, [route.params?.ai, editing, navigation]);

  // Prefill R/km from the company default only if one is configured — no
  // hard-coded fallback (leave blank so the field isn't pre-filled with a
  // made-up rate). Deferred to avoid sync setState in effect.
  //
  // baseRatePerKm is deliberately NOT a dependency. It used to be, and because
  // the effect also writes it, clearing the field re-armed the effect and the
  // default was written straight back — so the box could never be emptied and
  // its first digit could never be changed (10 -> 19 worked, 10 -> 20 did not).
  // The "don't clobber what the user typed" intent now lives in the functional
  // update instead, which is where it belongs.
  useEffect(() => {
    if (!company || editing) return;
    const def = num(pick(company, ['default_base_rate_per_km']));
    if (def > 0) {
      const t = setTimeout(() => setBaseRatePerKm((prev) => prev || String(def)), 0);
      return () => clearTimeout(t);
    }
  }, [company, editing]);

  // Selecting a vehicle type prefills R/km from that type's own configured
  // rate, falling back to the company default if it has none set — mirrors
  // web's applyVehicleType. Only fires on an actual dropdown selection, never
  // as a passive effect keyed on vehicleType, so it can't re-fire and clobber
  // the saved rate when an existing quote is loaded for editing.
  const handleVehicleTypeSelect = (name: string) => {
    setVehicleType(name);
    const vt = (vtypes ?? []).find((v) => v.name === name);
    const vtRate = Number(vt?.base_rate) || 0;
    if (vtRate > 0) {
      setBaseRatePerKm(String(vtRate));
      return;
    }
    const def = num(pick(company ?? {}, ['default_base_rate_per_km']));
    if (def > 0) setBaseRatePerKm(String(def));
  };

  // The AI returns a free-form spoken vehicle type ("flat bed") rather than
  // one of our configured names ("Flatbed"). costs.ts matches fuel figures by
  // exact name, so an unresolved string silently loses both the type's rate
  // and its fuel consumption. Reconcile it against the real list before
  // applying it — exact, then case-insensitive, then case/punctuation-
  // insensitive — and return the configured name so every exact-match lookup
  // downstream still hits. Matches against the full list, not vtypeOptions,
  // since that filters out types with no vehicles free right now and a
  // spoken type with zero availability should still resolve to its own rate.
  const resolveVehicleTypeName = (spoken: string): string | null => {
    const list = vtypes ?? [];
    const exact = list.find((v) => v.name === spoken);
    if (exact) return exact.name;
    const lower = spoken.toLowerCase();
    const ci = list.find((v) => v.name.toLowerCase() === lower);
    if (ci) return ci.name;
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const target = normalize(spoken);
    const loose = list.find((v) => normalize(v.name) === target);
    return loose?.name ?? null;
  };

  // Unsaved-changes baseline, fresh-quote case (Phase 4) — captured once,
  // after the base-rate prefill above has had its own deferred setTimeout(0)
  // a chance to settle. Without waiting for it, the default R/km landing a
  // moment later would make every fresh quote register as dirty from the
  // instant it opens.
  useEffect(() => {
    if (editing || baselineRef.current != null || company == null) return;
    const t = setTimeout(() => {
      baselineRef.current = snapshotTuple();
    }, 0);
    return () => clearTimeout(t);
    // snapshotTuple intentionally excluded — it's a plain function recreated
    // every render, and this effect must only fire once, on editing/company,
    // not on every keystroke that would give it a new identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, company]);

  // Cross-border is a company policy, not a per-quote choice (web moved it to
  // Settings → Company Details). The form only reacts to it: an early warning
  // when a picked location is foreign, and a hard block once /route/calculate/
  // refuses the route.
  const allowCrossBorder = useMemo(
    () => pick(company ?? {}, ['allow_cross_border']) !== false,
    [company],
  );

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
      const savedStops = asArray<Record<string, unknown>>(pick(q, ['stops']));
      if (savedStops.length > 0) {
        setStops(
          savedStops.map((s, i) => ({
            id: `saved-${i}`,
            loc: {
              label: str(pick(s, ['location'])),
              lat: num(pick(s, ['lat'])),
              lon: num(pick(s, ['lon'])),
            },
          })),
        );
      }
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

  // Unsaved-changes baseline, edit-mode case (Phase 4) — captured the render
  // right after hydration writes every field above, so opening an existing
  // quote to look at it isn't itself "dirty."
  useEffect(() => {
    if (!editing || !hydrated || baselineRef.current != null) return;
    baselineRef.current = snapshotTuple();
    // snapshotTuple intentionally excluded — same reasoning as the
    // fresh-quote baseline effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, hydrated]);

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

  // Same four prerequisites as before, but as a list rather than a boolean, so
  // the footer and the Price section can name the one that's actually missing
  // instead of both saying "a route" whatever the user has left blank.
  const priceGaps = useMemo(
    () => missingPriceInputs({ customerId, vehicleType, pickup, delivery, weightKg }),
    [customerId, vehicleType, pickup, delivery, weightKg],
  );
  const ready = priceGaps.length === 0;

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
          // No fallback needed: this effect only runs once `ready`, and
          // weight is now one of the priceGaps, so weightKg is guaranteed
          // positive here.
          weight_kg: weightKg,
          // Unresolved rows (no coords yet) are omitted rather than blocking
          // the calc — same shape RouteCalculatorView already parses for web.
          stops: stops.filter((s) => s.loc).map((s) => ({ lat: s.loc!.lat, lon: s.loc!.lon })),
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
  }, [ready, pickup, delivery, stops, vehicleType, weightKg]);

  const routes = useMemo(
    () => asArray(pick(routeData ?? {}, ['routes'])) as Record<string, unknown>[],
    [routeData],
  );
  const currentRoute = useMemo(
    () => (routes[selectedRouteIndex] ?? routes[0] ?? {}) as Record<string, unknown>,
    [routes, selectedRouteIndex],
  );
  // The response's own pick — RouteOptionChips' RECOMMENDED tag (Phase 5).
  const bestIndex = num(pick(routeData ?? {}, ['best_index']));

  // ── Cost breakdown ──────────────────────────────────────────────────────
  // computeCosts is the same computation as before, hoisted to quote/costs.ts
  // (Phase 0 extraction) so it's a pure, testable function — this useMemo and
  // its dep list are unchanged.
  const costs = useMemo(
    () =>
      computeCosts({
        currentRoute,
        routeData,
        tripType,
        vtypes,
        vehicleType,
        company,
        weightKg,
        baseRateNum,
        tollEdited,
        tollOverrideNum,
        driverNum,
        serviceCharge,
      }),
    [
      currentRoute,
      routeData,
      tripType,
      vtypes,
      vehicleType,
      company,
      weightKg,
      baseRateNum,
      tollEdited,
      tollOverrideNum,
      driverNum,
      serviceCharge,
    ],
  );

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
    // No point spending an AI-pricing call on a quote that cannot be saved.
    if (subscription.blocked) return;
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
      // Same lane (origin/destination/vehicle) as the last fetch → the
      // benchmark can't have changed, so skip it. Without this, every Apply
      // recommended and every keystroke in Tolls/Driver/Rate — none of which
      // touch origin/destination/vehicleType — re-fired this network call.
      const lane = `${extractCode(pickup.label)}|${extractCode(delivery.label)}|${vehicleType}`;
      if (benchKey.current !== lane) {
        benchKey.current = lane;
        benchmarkQuote(extractCode(pickup.label), extractCode(delivery.label), vehicleType)
          .then((b) => id === aiReq.current && setBenchmark(b))
          .catch(() => null);
      }
    }, 700);
    return () => clearTimeout(t);
    // benchmark intentionally excluded (it's set inside this effect). weight is
    // also excluded — weightKg (inside costs.*) is the value that actually
    // reaches the request; parseNum maps "20" and "20," to the same weightKg,
    // so keeping weight here fired a byte-identical request on the comma alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    routeData,
    costs.total,
    costs.directCost,
    costs.chargeDistance,
    costs.fuelCost,
    costs.tollCost,
    costs.driver,
    costs.fuelUsage,
    costs.fuelPrice,
    pickup,
    delivery,
    vehicleType,
    weightKg,
    selectedRouteIndex,
  ]);

  const opt = useMemo(
    () => (pick(analysis ?? {}, ['price_optimization']) ?? {}) as Record<string, unknown>,
    [analysis],
  );
  const { aiLearning, outcomesLogged, outcomesNeeded, learnPct } = useMemo(() => {
    const winModel = (pick(modelStats ?? {}, ['win_model']) ?? {}) as Record<string, unknown>;
    const logged = num(pick(winModel, ['outcomes_collected']));
    const needed = num(pick(winModel, ['outcomes_needed']));
    return {
      aiLearning: str(pick(winModel, ['mode'])) === 'heuristic',
      outcomesLogged: logged,
      outcomesNeeded: needed,
      // Guarded — a zero threshold would otherwise render a NaN-wide bar.
      learnPct: needed > 0 ? Math.min(100, Math.round((logged / needed) * 100)) : 0,
    };
  }, [modelStats]);

  const optPrice = pick(opt, ['optimal_price']) != null ? num(pick(opt, ['optimal_price'])) : null;
  const backendSuggested =
    pick(analysis ?? {}, ['suggested_price']) != null
      ? num(pick(analysis ?? {}, ['suggested_price']))
      : null;
  // The optimiser's margin is a markup on COST, not a margin on revenue, and the
  // backend returns it unclamped (margin_optimizer.py:269). When the lane
  // benchmark is junk it comes back in the thousands of percent, which is how a
  // R64k job was recommended at R1.5M. Treat anything past this as "the
  // benchmark behind this is not trustworthy" and fall back to cost-based
  // pricing rather than showing the number.
  const optMarkupPct =
    pick(opt, ['optimal_margin_pct']) != null ? num(pick(opt, ['optimal_margin_pct'])) : null;
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
        const m =
          pick(o, ['margin_pct']) != null
            ? num(pick(o, ['margin_pct']))
            : num(pick(o, ['margin'])) * 100;
        return { margin: Math.round(m), profit: Math.round(num(pick(o, ['expected_profit']))) };
      }),
    [opt],
  );
  const estimateLoading = (routeBusy || aiBusy) && !analysis;
  const guardExplain = asArray<string>(pick(guard ?? {}, ['explanations']))[0] as unknown as string;
  const guardWarn = asArray<string>(pick(guard ?? {}, ['warnings']))[0] as unknown as string;
  const guardFix = asArray<string>(pick(guard ?? {}, ['suggestions']))[0] as unknown as string;
  const guardMsg =
    guardExplain ||
    guardWarn ||
    guardFix ||
    'Margin is below your guardrail — review before sending.';
  // The suggestion is the actionable half ("increase price by ~R… to reach …%"),
  // and it was being dropped whenever an explanation existed.
  const guardHint = guardFix && guardFix !== guardMsg ? guardFix : null;

  const submitNL = async (text: string) => {
    const message = text.trim();
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
      const res = await aiChatQuote(
        message,
        nlHistory,
        currentFields,
        pendingEntity,
        declinedEntities,
      );

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
      if (pick(ex, ['vehicle_type'])) {
        const spoken = str(pick(ex, ['vehicle_type']));
        const resolved = resolveVehicleTypeName(spoken);
        // Route through the dropdown's own handler so a resolved type gets
        // its rate exactly like a manual selection would — same precedence
        // (vehicle type's own rate, else the company default). An
        // unresolved type is left as-is: shown so the user can correct it,
        // rate untouched.
        if (resolved) handleVehicleTypeSelect(resolved);
        else setVehicleType(spoken);
      }
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
      if (pick(ex, ['pickup_location']))
        await geocode(str(pick(ex, ['pickup_location'])), setPickup);
      if (pick(ex, ['delivery_location']))
        await geocode(str(pick(ex, ['delivery_location'])), setDelivery);
      nlBarRef.current?.setText('');
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
      nlBarRef.current?.setText(text);
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
  //
  // Named without a "use" prefix (it was "useActualPrice") — resetAllOverrides
  // below calls it directly, and eslint's react-hooks/rules-of-hooks treats
  // any called `useXxx` identifier as a hook regardless of what it actually
  // is, which flagged this as a hook invoked from a plain function.
  const resetPriceToActual = () => setServiceCharge(0);

  // ── Cost overrides: a way back to the calculated/default value (Phase 5) ──
  // Same field the base-rate prefill effect reads — kept in sync with it so
  // "Use default" always offers the same figure that effect would have.
  const companyDefaultRate = num(pick(company ?? {}, ['default_base_rate_per_km']));
  // The selected vehicle type's own rate wins over the company-wide default —
  // same precedence as handleVehicleTypeSelect above — so reverting a quote
  // that has a vehicle type with its own rate doesn't throw that away.
  const effectiveDefaultRate = (() => {
    const vt = (vtypes ?? []).find((v) => v.name === vehicleType);
    const vtRate = Number(vt?.base_rate) || 0;
    return vtRate > 0 ? vtRate : companyDefaultRate;
  })();
  const overridden =
    tollEdited ||
    driverNum !== 0 ||
    (effectiveDefaultRate > 0 && baseRatePerKm !== String(effectiveDefaultRate)) ||
    serviceCharge !== 0;

  const resetTollToCalculated = () => {
    setTollEdited(false);
    setTollOverride('');
  };
  const resetRateToDefault = () => setBaseRatePerKm(String(effectiveDefaultRate));
  const resetAllOverrides = () => {
    resetTollToCalculated();
    setDriverAllowance('0');
    if (effectiveDefaultRate > 0) setBaseRatePerKm(String(effectiveDefaultRate));
    resetPriceToActual();
  };

  // ── Jump bar (Phase 2) ───────────────────────────────────────────────────
  // Sticky chip bar above the scroll — a section's y offset is captured once
  // by QuoteSection's onLayout and read back here, so jumping to it never
  // depends on re-measuring anything. Declared before save()/the footer below
  // (Phase 3) since onSend needs jumpTo's stable identity.
  const scrollRef = useRef<BottomSheetScrollViewMethods>(null);
  const jumpBarRef = useRef<QuoteJumpBarHandle>(null);
  const sectionY = useRef<Partial<Record<SectionId, number>>>({});

  const registerSectionY = useCallback((id: SectionId, y: number) => {
    sectionY.current[id] = y;
  }, []);

  const jumpTo = useCallback((id: SectionId) => {
    sheetRef.current?.snapToIndex(1);
    const y = sectionY.current[id];
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
  }, []);

  // Highlights the jump bar's active chip from where the user has scrolled
  // to. Deliberately not a continuous onScroll — this only needs to settle
  // once the scroll stops, and going through the jump bar's own ref means a
  // scroll never re-renders the form (see QuoteJumpBar's setActive).
  const handleScrollSettled = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y + 24;
    let bestId: SectionId = SECTION_ORDER[0]!;
    for (const id of SECTION_ORDER) {
      const sy = sectionY.current[id];
      if (sy != null && sy <= y) bestId = id;
    }
    jumpBarRef.current?.setActive(bestId);
  }, []);

  // Single source of truth for what's blocking Save/Send (Phase 3) — exactly
  // the conditions save() below enforces, just surfaced before the user taps
  // rather than after. save() keeps its own guard clauses as a last line of
  // defence; once this is wired they're unreachable in practice.
  const issues = useMemo<QuoteIssue[]>(
    () =>
      collectIssues({
        subscriptionBlocked: subscription.blocked,
        subscriptionNotice: subscription.notice,
        customerId,
        routeBlockedMessage,
        vehicleType,
        pickup,
        delivery,
        weightInvalid,
        weightKg,
        pickupDate,
        deliveryDate,
      }),
    [
      subscription.blocked,
      subscription.notice,
      customerId,
      routeBlockedMessage,
      vehicleType,
      pickup,
      delivery,
      weightInvalid,
      weightKg,
      pickupDate,
      deliveryDate,
    ],
  );
  // Read by the []-stable onSend further down, so tapping Send always sees
  // the latest issues without onSend's own identity ever changing — same
  // saveRef-style indirection as save() below.
  const issuesRef = useRef(issues);
  issuesRef.current = issues;

  const issueFor = (field: QuoteIssue['field']) => issues.find((i) => i.field === field);
  const showIssue = (field: QuoteIssue['field'], touched: boolean) => {
    if (touched) return issueFor(field)?.message;
    const issue = issueFor(field);
    if (!issue) return undefined;
    // A Draft attempt only surfaces 'both'-blocking issues — 'send'-only ones
    // (vehicle type, weight, dates) aren't required for a draft, so flagging
    // them here would be misleading.
    if (submitAttempted === 'send') return issue.message;
    if (submitAttempted === 'draft' && issue.blocks === 'both') return issue.message;
    return undefined;
  };

  const jumpSections = useMemo<QuoteJumpBarSection[]>(() => {
    // Only after a Send or Draft attempt — a blank Route section on a fresh
    // quote isn't an "issue", it just hasn't been filled in yet. Which
    // issues count depends on which action was attempted: Draft only cares
    // about 'both'-blocking issues, Send cares about all of them.
    const issueSections = !submitAttempted
      ? null
      : new Set(
          issues
            .filter((i) =>
              submitAttempted === 'send'
                ? i.blocks === 'both' || i.blocks === 'send'
                : i.blocks === 'both',
            )
            .map((i) => i.section),
        );
    const base: { id: SectionId; label: string; complete: boolean }[] = [
      { id: 'client', label: 'Client', complete: !!(customerId && vehicleType) },
      { id: 'route', label: 'Route', complete: !!(pickup?.lat && delivery?.lat) },
      { id: 'load', label: 'Load', complete: weightKg > 0 && !weightInvalid },
      { id: 'schedule', label: 'Schedule', complete: !!(pickupDate && deliveryDate) },
      { id: 'price', label: 'Price', complete: costs.total > 0 },
    ];
    return base.map((s) => ({ ...s, hasIssue: issueSections?.has(s.id) }));
  }, [
    customerId,
    vehicleType,
    pickup?.lat,
    delivery?.lat,
    weightKg,
    weightInvalid,
    pickupDate,
    deliveryDate,
    costs.total,
    submitAttempted,
    issues,
  ]);

  // buildQuotePayload is the same object literal as before (same key order —
  // it's the DRF contract), hoisted to quote/payload.ts (Phase 0 extraction).
  const buildPayload = (status: 'DRAFT' | 'SENT') =>
    buildQuotePayload(
      {
        customerId,
        pickup,
        delivery,
        pickupDate,
        deliveryDate,
        cargo,
        weight,
        weightKg,
        vehicleType,
        costs,
        serviceCharge,
        notes,
        company,
        validUntil,
        tripType,
        winProb,
        stops,
      },
      status,
    );

  const save = async (send: boolean) => {
    // Fire-and-forget: starts the keyboard closing the instant Save/Send is
    // tapped (footer buttons sit in the sheet's pinned footer, outside the
    // scroll view, so a tap on them never blurs whatever field was focused).
    // Also gets validation toasts below out from behind the keyboard, where
    // they were otherwise invisible.
    void dismissKeyboard();
    if (subscription.blocked) return toast.error(subscription.notice ?? 'Subscription inactive');
    // Draft can be saved any time (just needs a client to attach to) — except
    // pickup/dropoff, which the backend requires unconditionally (no
    // draft-specific relaxation for pickup_location/delivery_location).
    if (!customerId) return toast.error('Select a client');
    if (!pickup?.lat || !delivery?.lat)
      return toast.error('Set a collection point and drop-off first');
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
    setBusy(send ? 'send' : 'draft');
    try {
      const payload = buildPayload(send ? 'SENT' : 'DRAFT');
      let id = savedId.current;
      if (id) await patchQuote(id, payload);
      else {
        const created = await createQuote(payload);
        id = pick(created, ['id', 'pk']) as string | number;
        savedId.current = id;
      }
      let emailSent = false;
      if (send && id) {
        const res = await sendQuote(id);
        emailSent = !!pick(res, ['email_sent']);
      }
      toast.success();
      completedRef.current = true;
      // Guarantee the keyboard is gone before the overlay shows — the tap-time
      // dismiss above usually wins the race already, but this covers a fast
      // cached response (e.g. an immediate PATCH) and the "Save draft" button
      // inside the unsaved-changes Alert, which never goes through the footer.
      await dismissKeyboard();
      // Visible confirmation (Phase 4) — toast.success above is haptic-only
      // by app-wide policy (src/lib/toast.tsx), so this is what actually
      // tells the user what happened. Replaces the old instant goBack(); the
      // overlay's own View quote / Done buttons navigate — see those below.
      setSentOverlay({
        kind: send ? 'send' : 'draft',
        emailSent,
        total: costs.total,
        clientName: customerOptions.find((o) => o.value === customerId)?.label ?? '',
        id: id!,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save quote');
    } finally {
      setBusy(null);
    }
  };

  // Always points at the save() closure from the latest render, so the
  // footer's memoized onPress handlers (below) never validate against
  // stale form state even when renderFooter itself hasn't re-memoized.
  const saveRef = useRef(save);
  saveRef.current = save;

  // Shared by both of QuoteSentOverlay's dismissal paths — refreshes this
  // quote's own detail cache too (the old quotes-only invalidation missed
  // that, so reopening an edited quote showed the pre-edit values).
  //
  // Deferred until after the pop/replace transition finishes: invalidating
  // immediately kicks off a background refetch of Home's ['overview'] query
  // (via DASHBOARD) at the same moment the native-stack transition starts,
  // and Home's data landing mid-transition on Android could commit a
  // corrupted layout (blank Total revenue card, collapsed gap above Fleet
  // utilisation) that never repaints until the app is fully restarted.
  const invalidateQuoteAfterTransition = useCallback(() => {
    InteractionManager.runAfterInteractions(() => invalidateFor(qc, 'quote'));
  }, [qc]);

  const onOverlayDone = useCallback(() => {
    setSentOverlay(null);
    navigation.goBack();
    invalidateQuoteAfterTransition();
  }, [navigation, invalidateQuoteAfterTransition]);

  const onOverlayViewQuote = useCallback(() => {
    const id = sentOverlay?.id;
    setSentOverlay(null);
    // replace, not navigate — back from the detail must not land on this
    // create form, which is still holding a savedId for the same quote.
    if (id != null) navigation.replace('QuoteDetail', { id });
    invalidateQuoteAfterTransition();
  }, [navigation, invalidateQuoteAfterTransition, sentOverlay]);

  // Unsaved-changes guard (Phase 4) — covers the back chevron (which already
  // calls goBack() below) and the OS-level back gestures, which don't route
  // through it.
  const isDirtyNow = () => {
    if (busy != null || completedRef.current || baselineRef.current == null) return false;
    if (snapshotTuple() !== baselineRef.current) return true;
    // nlBarRef's text lives in a child component precisely so typing there
    // doesn't re-render this screen — read it fresh here rather than through
    // any value captured at render time, which could go stale.
    return (nlBarRef.current?.getText() ?? '').trim() !== '';
  };

  useUnsavedChangesGuard({
    navigation,
    isDirty: isDirtyNow,
    // While picking a point or recording, "back" closes that mode instead of
    // asking to discard the whole quote.
    onIntercept: picking ? endPick : voiceOpen ? () => setVoiceOpen(false) : undefined,
    title: 'Discard this quote?',
    message: "You've started this quote. Leaving now loses it.",
    buttons: [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Save draft', onPress: () => saveRef.current(false) },
      { text: 'Discard', style: 'destructive', dispatch: true },
    ],
  });

  const onSaveDraft = useCallback(() => {
    setSubmitAttempted('draft');
    const blocking = issuesRef.current.filter((i) => i.blocks === 'both');
    if (blocking.length) {
      // The section jumpTo scrolls to is itself behind the keyboard while
      // typing — close it so the jump actually lands somewhere visible.
      void dismissKeyboard();
      if (Platform.OS !== 'web')
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      jumpTo(blocking[0]!.section);
      return;
    }
    saveRef.current(false);
  }, [jumpTo]);

  const onSend = useCallback(() => {
    setSubmitAttempted('send');
    const blocking = issuesRef.current.filter((i) => i.blocks === 'both' || i.blocks === 'send');
    if (blocking.length) {
      // Same reasoning as onSaveDraft above.
      void dismissKeyboard();
      if (Platform.OS !== 'web')
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      jumpTo(blocking[0]!.section);
      return;
    }
    saveRef.current(true);
    // jumpTo is []-stable (see its own useCallback above), so this never
    // needs to change identity across renders.
  }, [jumpTo]);

  // The footer's left half while the quote can't be priced yet. Deliberately
  // generic rather than naming each gap: with up to four possible gaps
  // (client, vehicle type, route, weight) the full list got long and
  // truncated on the strip's single 26px line, and implied one field was the
  // last thing needed right after it was filled. The Price section below
  // still names every gap since it has room to wrap. Kept as two primitives +
  // a callback so QuoteFooterActions stays memo-safe.
  const priceHint = priceGaps.length ? 'Complete the form to see the price' : '';
  const priceHintSection = priceGaps[0]?.section ?? null;
  const onPriceHintPress = useCallback(() => {
    if (priceHintSection) jumpTo(priceHintSection);
  }, [priceHintSection, jumpTo]);

  // The Price section's empty state. Unlike the footer strip this can wrap, so
  // it names every gap — and it separates the three cases the one old sentence
  // ("Add a route and load details to see pricing.") lumped together, one of
  // which — load details — isn't even a pricing prerequisite.
  const priceEmptyMessage = useMemo(() => {
    if (priceGaps.length) return `Add ${formatGapList(priceGaps)} to see pricing.`;
    if (routeBlockedMessage) return "This route isn't allowed, so there's nothing to price.";
    if (routeBusy) return 'Working out the price…';
    return 'No route found between these points yet.';
  }, [priceGaps, routeBlockedMessage, routeBusy]);

  // Footer status strip, by precedence: a suspended subscription (not
  // tappable — nothing here fixes it) → a route refused by company policy
  // (tap to review) → outstanding field issues once a Send has been
  // attempted (tap to jump to the first one) → nothing, the resting state.
  const footerStrip = useMemo<FooterStrip | null>(() => {
    if (subscription.blocked) {
      return { tone: 'danger', message: subscription.notice ?? 'Subscription inactive' };
    }
    if (routeBlockedMessage) {
      return {
        tone: 'danger',
        message: 'Route not allowed — tap to review',
        onPress: () => jumpTo('route'),
      };
    }
    if (!submitAttempted) return null;
    const blocking = issues.filter(
      (i) =>
        (submitAttempted === 'send'
          ? i.blocks === 'both' || i.blocks === 'send'
          : i.blocks === 'both') && i.fixable,
    );
    if (!blocking.length) return null;
    return {
      tone: 'warning',
      message: `${blocking.length} thing${blocking.length === 1 ? '' : 's'} left before you can ${submitAttempted === 'send' ? 'send' : 'save'}`,
      onPress: () => jumpTo(blocking[0]!.section),
    };
  }, [
    subscription.blocked,
    subscription.notice,
    routeBlockedMessage,
    submitAttempted,
    issues,
    jumpTo,
  ]);

  // Pinned to the sheet's bottom edge via footerComponent rather than sitting at
  // the end of the scroll view, so the primary action is always reachable and
  // stays above the keyboard. Every dep below is either a primitive the footer
  // actually reads or a []-stable callback, so — unlike before — this doesn't
  // need a hand-trimmed, eslint-disabled dep list to stay correct.
  const renderFooter = useCallback(
    (props: BottomSheetFooterProps) => (
      <BottomSheetFooter {...props} bottomInset={0}>
        <QuoteFooterBar insetsBottom={insets.bottom}>
          <QuoteFooterActions
            total={costs.total}
            statsTrusted={statsTrusted}
            marginPct={costs.marginPct}
            ready={ready}
            priceHint={priceHint}
            onPriceHintPress={onPriceHintPress}
            calculating={routeBusy || aiBusy}
            strip={footerStrip}
            busy={busy}
            saveDisabled={subscription.blocked}
            sendDisabled={subscription.blocked || !!routeBlockedMessage}
            onSaveDraft={onSaveDraft}
            onSend={onSend}
          />
        </QuoteFooterBar>
      </BottomSheetFooter>
    ),
    [
      insets.bottom,
      costs.total,
      costs.marginPct,
      statsTrusted,
      ready,
      priceHint,
      onPriceHintPress,
      routeBusy,
      aiBusy,
      footerStrip,
      busy,
      subscription.blocked,
      routeBlockedMessage,
      onSaveDraft,
      onSend,
    ],
  );

  // MapCanvas is memoized (it's a native MapView) — these are its props, kept
  // stable so a keystroke anywhere else in the sheet doesn't re-render the
  // map. Keyed on lat/lon primitives rather than pickup/delivery themselves:
  // submitNL's geocode() (AI/voice fill) calls setPickup with a fresh object
  // even when the coordinates come out identical to what's already set.
  const mapGeometry = useMemo(
    () => asArray(pick(currentRoute, ['geometry'])) as GeoPoint[],
    [currentRoute],
  );
  const mapPickup = useMemo(
    () => (pickup ? { lat: pickup.lat, lon: pickup.lon } : null),
    // pickup intentionally excluded — deliberately keyed on its lat/lon, not
    // the object itself (see comment above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pickup?.lat, pickup?.lon],
  );
  const mapDelivery = useMemo(
    () => (delivery ? { lat: delivery.lat, lon: delivery.lon } : null),
    // delivery intentionally excluded — same reasoning as mapPickup above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [delivery?.lat, delivery?.lon],
  );
  // Carries each stop's id (so MapCanvas can hide just the one being picked)
  // and its true 1-based position in the full `stops` array — not its index
  // in this filtered-to-resolved-only list, which disagreed with the form's
  // own "Stop N" labelling (StopLocationRow) whenever an earlier stop had no
  // coordinate yet.
  const mapStops = useMemo(
    () =>
      stops.flatMap((s, i) =>
        s.loc ? [{ id: s.id, index: i + 1, lat: s.loc.lat, lon: s.loc.lon }] : [],
      ),
    [stops],
  );

  return (
    <View className="flex-1 bg-bg-deep">
      {/* The map is the page. It fills the screen and the sheet floats over it,
          so dragging the sheet down reveals more map without any relayout. */}
      <MapCanvas
        geometry={mapGeometry}
        pickup={mapPickup}
        delivery={mapDelivery}
        stops={mapStops}
        // 0 while picking, not some peek height, so the route-framing math
        // above the sheet still has room to work with. Coordinate accuracy no
        // longer depends on this: MapCanvas resolves the picked point via
        // coordinateForPoint/unproject at the crosshair's exact pixel, not
        // off the reported region centre, so it's correct regardless of
        // mapPadding.
        bottomInset={picking ? 0 : sheetHeight}
        onCentreSettled={onCentreSettled}
        picking={picking}
        width={screenW}
        height={screenH}
        topInset={insets.top}
      />

      {/* Own chrome, since the native header is off on this screen. A white
          chevron in a translucent circle is the iOS pattern for a back control
          over full-bleed content — Apple Maps and Photos both do this, because a
          bare chevron loses contrast as the map moves under it. */}
      <View
        className="absolute left-0 right-0 flex-row items-center px-4"
        style={{ top: insets.top + 6 }}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="h-10 w-10 items-center justify-center rounded-pill bg-black/45 active:opacity-60"
        >
          <Icon name="chevronLeft" size={24} color="#FFFFFF" strokeWidth={2.4} />
        </Pressable>
      </View>

      <BottomSheet
        ref={sheetRef}
        index={0}
        snapPoints={SNAP as unknown as string[]}
        enableDynamicSizing={false}
        enablePanDownToClose={false}
        onChange={onSheetChange}
        footerComponent={renderFooter}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustPan"
        backgroundStyle={{ backgroundColor: colors.surface, borderRadius: 2 }}
        handleIndicatorStyle={{ backgroundColor: colors.faint, width: 42 }}
      >
        <QuoteJumpBar ref={jumpBarRef} sections={jumpSections} onPress={jumpTo} />
        <BottomSheetScrollView
          ref={scrollRef}
          contentContainerStyle={{
            paddingHorizontal: 16,
            // Clears the pinned footer, which overlays the scroll area. Extra
            // margin beyond the footer's own measured height (border + pt-3 +
            // 26px strip row + 8px gap + 48px button row + bottom inset) so the
            // last section's content never sits flush against it.
            paddingBottom: insets.bottom + 112,
            gap: 16,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onScrollEndDrag={handleScrollSettled}
          onMomentumScrollEnd={handleScrollSettled}
        >
          <View className="gap-6">
            {subscription.notice && (
              <View className="flex-row items-start gap-2.5 rounded-xs border border-danger bg-danger-bg p-3">
                <Icon name="alert" size={17} color="#FF4949" />
                <Txt className="flex-1 text-sub text-muted">{subscription.notice}</Txt>
              </View>
            )}
            {/* AI voice / natural-language quick fill — stays outside the
            sections below and always at the top; it's the fast path and the
            one thing on this screen that fills several sections at once. */}
            <NaturalLanguageBar
              ref={nlBarRef}
              busy={nlBusy}
              onRecord={() => setVoiceOpen(true)}
              onSubmit={submitNL}
              note={nlReply || undefined}
              onTyped={() => {
                if (nlReply) setNlReply('');
              }}
            />

            {/* Five visible groupings (Phase 2) — still one continuous scroll, no
            accordion, no wizard. QuoteJumpBar above scrolls to each; the
            fields themselves keep the exact props/handlers they had before. */}
            <QuoteSection id="client" label="" onLayout={registerSectionY}>
              <SelectField
                label="Client"
                icon="user"
                placeholder="Select customer"
                options={customerOptions}
                value={customerId}
                onSelect={setCustomerId}
                error={showIssue('client', false)}
              />
              <SelectField
                label="Vehicle type"
                icon="truck"
                placeholder="Select vehicle type"
                options={vtypeOptions}
                value={vehicleType}
                onSelect={handleVehicleTypeSelect}
                error={showIssue('vehicleType', false)}
              />
            </QuoteSection>

            <QuoteSection id="route" label="Route" onLayout={registerSectionY}>
              <LocationField
                label="Collection"
                value={pickup}
                onChange={setPickup}
                placeholder="Search origin"
                onPickOnMap={() => beginPick('pickup')}
                error={showIssue('pickup', false)}
              />

              {/* Stops between Collection and Drop-off, in visit order — mirrors the
              physical route rather than sitting off to the side of it. */}
              {stops.map((stop, i) => (
                <StopLocationRow
                  key={stop.id}
                  stop={stop}
                  index={i}
                  isFirst={i === 0}
                  isLast={i === stops.length - 1}
                  updateStop={updateStop}
                  moveStop={moveStop}
                  removeStop={removeStop}
                  beginPick={beginPick}
                />
              ))}
              {pickup && delivery && (
                <Button
                  label="Add stop"
                  icon="plus"
                  variant="secondary"
                  size="sm"
                  onPress={addStop}
                />
              )}

              <LocationField
                label="Drop-off"
                value={delivery}
                onChange={setDelivery}
                placeholder="Search destination"
                onPickOnMap={() => beginPick('dropoff')}
                error={showIssue('dropoff', false)}
              />

              {/* Early heads-up the moment a picked location is outside SA, before the
              rest of the form is filled in. The real enforcement happens once
              /route/calculate/ runs — see routeBlockedMessage below. */}
              {!allowCrossBorder && (isForeignCc(pickup?.cc) || isForeignCc(delivery?.cc)) && (
                <View className="flex-row items-start gap-2.5 rounded-xs border border-warning bg-warning-bg p-3">
                  <Icon name="alert" size={17} color="#F59E0B" />
                  <Txt className="flex-1 text-sub text-muted">
                    This location is outside South Africa, but your company isn&apos;t set up for
                    cross-border routes (Settings → Company details). This quote will be refused
                    once calculated — pick a domestic location or ask an admin to enable
                    cross-border routes.
                  </Txt>
                </View>
              )}

              <View>
                <Label className="mb-2 text-muted">Trip</Label>
                <SegmentedControl
                  options={[
                    { label: 'One way', value: 'ONE_WAY' },
                    { label: 'Round trip', value: 'ROUND_TRIP' },
                  ]}
                  value={tripType}
                  onChange={(v) => setTripType(v as 'ONE_WAY' | 'ROUND_TRIP')}
                />
              </View>

              {/* Route refused by company policy — replaces the route preview,
              same as web. */}
              {ready && routeBlockedMessage && (
                <View className="mt-5 rounded-xs border border-danger bg-danger-bg p-4">
                  <Txt className="text-callout font-semibold text-danger">Route not allowed</Txt>
                  <Txt className="mt-1.5 text-sub text-muted">{routeBlockedMessage}</Txt>
                </View>
              )}

              {/* Route preview + alternatives sit right under the addresses that
              produced them, not ~1000px below (Phase 2's one field move). */}
              {ready && !routeBlockedMessage && (
                <View className="mt-5 gap-5">
                  <RoutePreview
                    origin={pickup!.label}
                    dest={delivery!.label}
                    stops={stops.filter((s) => s.loc).map((s) => s.loc!.label)}
                    distance={
                      costs.distance ? `${Math.round(costs.chargeDistance)} km` : 'Calculating…'
                    }
                    duration={costs.duration ? formatDuration(costs.duration / 60) : undefined}
                    loading={routeBusy}
                  />
                  <RouteOptionChips
                    routes={routes}
                    selectedRouteIndex={selectedRouteIndex}
                    bestIndex={bestIndex}
                    onSelect={(i) => {
                      setSelectedRouteIndex(i);
                      setAnalysis(null);
                      setGuard(null);
                    }}
                  />
                </View>
              )}
            </QuoteSection>

            <QuoteSection id="load" label="Load" onLayout={registerSectionY}>
              {/* R/km lives in the overrides section under Price, next to the other
              cost levers — it isn't repeated here. */}
              <TextField
                label="Weight (tons)"
                required
                placeholder="e.g. 20"
                keyboardType="decimal-pad"
                error={showIssue('weight', weightTouched)}
                value={weight}
                onChangeText={setWeight}
                onBlur={() => setWeightTouched(true)}
                bottomSheet
              />
              <TextField
                label="Cargo"
                placeholder="e.g. Steel coils"
                value={cargo}
                onChangeText={setCargo}
                bottomSheet
              />
            </QuoteSection>

            <QuoteSection id="schedule" label="Schedule & terms" onLayout={registerSectionY}>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <DateField
                    label="Pickup date"
                    required
                    value={pickupDate}
                    onChange={setPickupDate}
                    minimumDate={startOfToday()}
                    error={showIssue('pickupDate', false)}
                  />
                </View>
                <View className="flex-1">
                  <DateField
                    label="Delivery date"
                    required
                    value={deliveryDate}
                    onChange={setDeliveryDate}
                    minimumDate={pickupDate ? new Date(pickupDate) : startOfToday()}
                    error={showIssue('deliveryDate', false)}
                  />
                </View>
              </View>
              <DateField
                label="Valid until"
                value={validUntil}
                onChange={setValidUntil}
                minimumDate={startOfToday()}
              />
              <TextField
                label="Notes"
                placeholder="Anything the client should see"
                value={notes}
                onChangeText={setNotes}
                multiline
                bottomSheet
              />
            </QuoteSection>

            <QuoteSection id="price" label="Price" onLayout={registerSectionY}>
              {ready && !routeBlockedMessage && costs.total > 0 ? (
                <>
                  <AiRecommendationCard
                    estimateLoading={estimateLoading}
                    statsTrusted={statsTrusted}
                    suggestedPrice={suggestedPrice}
                    costsTotal={costs.total}
                    optMarkupPct={optMarkupPct}
                    marginPct={costs.marginPct}
                    expProfit={expProfit}
                    winProb={winProb}
                    curveData={curveData}
                    alreadyApplied={alreadyApplied}
                    onApplyRecommended={applyRecommended}
                    onUseActualPrice={resetPriceToActual}
                    riskLevel={riskLevel}
                    guardMsg={guardMsg}
                    guardHint={guardHint}
                    aiLearning={aiLearning}
                    vehicleType={vehicleType}
                    outcomesLogged={outcomesLogged}
                    outcomesNeeded={outcomesNeeded}
                    learnPct={learnPct}
                  />
                  <CostBreakdownCard
                    costs={costs}
                    vehicleType={vehicleType}
                    baseRateNum={baseRateNum}
                    serviceCharge={serviceCharge}
                    tripType={tripType}
                    onTollPress={() => setTollModal(true)}
                    onRemoveUplift={resetPriceToActual}
                  />
                  <CostOverrides
                    tollValue={tollEdited ? tollOverride : formatPlain(costs.tollCost)}
                    tollEdited={tollEdited}
                    tollOverrideNum={tollOverrideNum}
                    tollCalculated={costs.tollCalculated}
                    onTollChangeText={(v) => {
                      setTollEdited(true);
                      setTollOverride(v);
                    }}
                    onUseCalculatedToll={resetTollToCalculated}
                    driverAllowance={driverAllowance}
                    onDriverChangeText={setDriverAllowance}
                    baseRatePerKm={baseRatePerKm}
                    onRateChangeText={setBaseRatePerKm}
                    overridden={overridden}
                    onResetAll={resetAllOverrides}
                  />
                </>
              ) : (
                <Txt className="text-caption text-faint">{priceEmptyMessage}</Txt>
              )}
            </QuoteSection>
          </View>

          <TollBreakdownModal
            visible={tollModal}
            onClose={() => setTollModal(false)}
            costs={costs}
          />
          {/* Stays open through the AI step, so the user sees "Building your
          quote" rather than being dropped back on a form that's mid-change. */}
          {voiceOpen && (
            <VoiceQuoteSheet onCaptured={onVoiceCaptured} onClose={() => setVoiceOpen(false)} />
          )}

          {/* Both entry points get this — the voice sheet and the typed
          "Fill from description" button, which previously only spun a small
          button through a multi-second AI call. */}
          <WorkingOverlay visible={voiceBusy || nlBusy} title="Building your quote" />
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Painted after the sheet, not before — the sheet's footer/background
          sit in this same bottom region and would otherwise cover (and steal
          taps from) the Confirm/Cancel card, even while the sheet is faded
          to opacity 0. */}
      {picking && (
        <CrosshairOverlay
          target={picking}
          address={pinLabel}
          resolving={pinBusy}
          error={pinError}
          ready={pinReady}
          onConfirm={confirmPick}
          onCancel={endPick}
          bottomInset={insets.bottom + 8}
        />
      )}

      {/* Same tree position as CrosshairOverlay, for the same reason (see
          above) — needs to paint over the sheet's footer. */}
      <QuoteSentOverlay
        visible={sentOverlay != null}
        kind={sentOverlay?.kind ?? 'draft'}
        total={sentOverlay?.total ?? 0}
        clientName={sentOverlay?.clientName ?? ''}
        emailSent={sentOverlay?.emailSent ?? false}
        onViewQuote={onOverlayViewQuote}
        onDone={onOverlayDone}
      />
    </View>
  );
}

// ── Sticky footer bar, shrinking its own bottom padding while the keyboard
// is up ──────────────────────────────────────────────────────────────────────
// `insetsBottom + 10` only exists to clear the home indicator while the
// keyboard is closed. BottomSheetFooter already lifts this whole bar to sit
// right on top of the keyboard once it's shown — so without shrinking this
// same padding back down, it reappears as a dead gap between the buttons and
// the keyboard instead of the home indicator it was meant for. Reads the
// sheet's own keyboard state (rather than react-native-keyboard-controller)
// so it can't drag in that library's Android adjustResize side effect, which
// would fight the sheet's own android_keyboardInputMode="adjustPan" above.
function QuoteFooterBar({ insetsBottom, children }: { insetsBottom: number; children: ReactNode }) {
  const { animatedKeyboardState } = useBottomSheetInternal();
  const restingPadding = insetsBottom + 10;
  const style = useAnimatedStyle(() => {
    const shown = animatedKeyboardState.value.status === KEYBOARD_STATUS.SHOWN;
    return {
      paddingBottom: withTiming(shown ? 10 : restingPadding, {
        duration: animatedKeyboardState.value.duration,
      }),
    };
  });
  return (
    <Animated.View className="border-t border-line bg-surface px-4 pt-3" style={style}>
      {children}
    </Animated.View>
  );
}
