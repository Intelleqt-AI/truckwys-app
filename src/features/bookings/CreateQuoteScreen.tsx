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
  TouchableOpacity,
  Platform,
  Keyboard,
  useWindowDimensions,
  InteractionManager,
  AccessibilityInfo,
  Alert,
  type TextInput,
  ActivityIndicator,
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
  SegmentedControl,
  SelectField,
  TextField,
  DateField,
  Button,
  Banner,
  Icon,
  Txt,
  Label,
  Mono,
} from '@/components/ui';
import {
  useVehicleTypes,
  useCompanyProfileData,
  useFuelPrice,
  useQuoteFuelAlert,
  refreshFuelPrices,
  suggestLocations,
  calculateRoute,
  analyzeQuote,
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
import { useFinanceSettings } from '@/lib/finance/api';
import { previewQuoteVat } from '@/lib/vat';
import { formatCurrency, formatDuration, formatNumber, formatPlain, parseNum, decimalMax } from '@/lib/formatters';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import { dismissKeyboard } from '@/lib/keyboard';
import { useSubscription } from '@/hooks/useSubscription';
import { useDemo } from '@/hooks/useDemo';
import { DEMO_QUOTA_MESSAGE } from '@/lib/demoStatus';
import { useAuthStore } from '@/stores/authStore';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import type { AppStackParamList } from '@/navigation/types';
import {
  type Loc,
  type StopEntry,
  type SectionId,
  roundCoord,
  round2,
  extractCode,
  isForeignCc,
  plusDays,
  startOfToday,
  capacityTons,
} from './quote/types';
import { computeCosts } from './quote/costs';
import {
  suggestTruck,
  pricedInEarlierPeriod,
  changesSincePriced,
  saShortDate,
  ACTION_LABELS,
  computeTonnage,
  operatingCostPerKm,
  type ChangesSincePriced,
  type QuoteWarning,
  type CostingInputs as TonnageLane,
  type TonnageCosting,
} from './quote/rules';
import { QuoteWarnings } from './quote/QuoteWarnings';
import { TonnageCard } from './quote/TonnageCard';
import { useTonnageAnalysis } from './quote/useTonnageAnalysis';
import { CostFloorModal } from './quote/CostFloorModal';
import { useServerCosting } from './quote/useServerCosting';
import { analysisPayload } from './quote/analysisPayload';
import { reopenedInputs } from './quote/reopenInputs';
import { buildQuotePayload } from './quote/payload';
import { compactStoredSnapshot } from './quote/routeSnapshot';
import { LocationField } from './quote/LocationField';
import { StopLocationRow } from './quote/StopLocationRow';
import { NaturalLanguageBar, type NaturalLanguageBarHandle } from './quote/NaturalLanguageBar';
import { FillSummary, CheckHint, type FillSuggestion } from './quote/FillSummary';
import {
  UNDO_MS,
  buildChips,
  borderPostShort,
  conflictSummary,
  didntCatchLine,
  dieselLabel,
  heardBadge,
  isLow,
  nightsLabel,
  placeShort,
  planFill,
  plainNumber,
  readChatResult,
  readVoiceResult,
  shortDate,
  t,
  tonsLabel,
  uiLangOf,
  vehicleHintLabel,
  voiceErrorText,
  type FieldChange,
  type FieldVal,
  type FillChip,
  type FillKey,
  type FillPlan,
  type UiLang,
  type VoiceLangPref,
} from './quote/nlFill';
import { QuoteSection } from './quote/QuoteSection';
import {
  QuoteJumpBar,
  type QuoteJumpBarHandle,
  type QuoteJumpBarSection,
} from './quote/QuoteJumpBar';
import { RouteOptionChips } from './quote/RouteOptionChips';
import { PriceCheckCard } from './quote/priceCheck/PriceCheckCard';
import { usePriceCheck } from './quote/priceCheck/usePriceCheck';
import { moneyWhole, type Choice, type Review, type ItemKey } from './quote/priceCheck/types';
import { QuoteSendPreview, type QuotePreviewData } from './QuoteSendPreview';
import { CostBreakdownCard, pct } from './quote/CostBreakdownCard';
import { DriverBreakdownModal } from './quote/DriverBreakdownModal';
import { AdjustmentModal } from './quote/AdjustmentModal';
import { TollBreakdownModal } from './quote/TollBreakdownModal';
import { FuelBreakdownModal } from './quote/FuelBreakdownModal';
import { RateBreakdownModal } from './quote/RateBreakdownModal';
import { BorderBreakdownModal } from './quote/BorderBreakdownModal';
import { QuoteSentOverlay } from './quote/QuoteSentOverlay';
import {
  collectIssues,
  formatGapList,
  missingPriceInputs,
  WEIGHT_MAX_TONS,
  type QuoteIssue,
} from './quote/validation';
import { QuoteFooterActions, type FooterStrip, type FooterOffer } from './quote/QuoteFooterActions';

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
const SNAP_FRACTIONS = [0.45, 0.75] as const;
const SNAP = SNAP_FRACTIONS.map((f) => `${Math.round(f * 100)}%`);

// Section order for the jump bar and for the scroll-position → active-chip
// lookup below. Fixed, so it lives at module scope rather than being
// recomputed per render.
const SECTION_ORDER: SectionId[] = ['client', 'route', 'load', 'schedule', 'price'];


// The fields the market price check's Apply writes, so Undo can put back exactly
// what was there. Tolls travel as a group: a market figure (aiToll), or a typed
// one (tollEdited + tollOverride).
interface AiInputs {
  aiFuel: { pricePerL: number; fuelType: string } | null;
  aiToll: { oneWay: number; routeKey: string } | null;
  tollOverride: string;
  tollEdited: boolean;
  driverAllowance: string;
  driverEdited: boolean;
  baseRatePerKm: string;
  serviceCharge: number;
}

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Identifies the inputs a route calculation was made for. */
const routeKeyOf = (
  pickup: Loc | null,
  delivery: Loc | null,
  stops: StopEntry[],
  vehicleType: string,
  weightKg: number,
) =>
  JSON.stringify([
    pickup?.lat,
    pickup?.lon,
    delivery?.lat,
    delivery?.lon,
    stops.filter((s) => s.loc).map((s) => [s.loc!.lat, s.loc!.lon]),
    vehicleType || 'Flatbed',
    weightKg,
  ]);

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
  const { data: financeSettings } = useFinanceSettings();
  // Live diesel price for the company's zone (quotes are priced off it unless
  // the fleet set its own price). See lib/dieselPrice.ts.
  const { data: liveFuel } = useFuelPrice();
  // A reopened quote saved before the cost-floor snapshot: the backend's
  // diesel alert (litres × price change) is what moved since.
  const { data: fuelAlert, isFetched: fuelAlertDone } = useQuoteFuelAlert(editId ?? '', editing);
  // A suspended or cancelled subscription blocks new quotes server-side
  // (PlanLimitsMiddleware), so gate it here too rather than letting the user
  // build a whole quote and take a 403 on save.
  const subscription = useSubscription();
  // A demo session's one free quote is enforced server-side too
  // (QuoteViewSet.create) — gate here for the same reason as subscription.
  const demo = useDemo();

  const [customerId, setCustomerId] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [pickup, setPickup] = useState<Loc | null>(null);
  const [delivery, setDelivery] = useState<Loc | null>(null);
  const [stops, setStops] = useState<StopEntry[]>([]);
  const stopSeq = useRef(0);
  const [weight, setWeight] = useState(str(prefill?.weight));
  // Pricing basis: per load (the classic price) or per tonne (rate per tonne x
  // weighbridge tonnes, never below a minimum per load; with a total, a volume
  // contract booked load by load). Same rules as the web builder.
  const [pricingBasis, setPricingBasis] = useState<'per_load' | 'per_tonne'>(
    prefill?.pricing_basis === 'per_tonne' || prefill?.contract === true ? 'per_tonne' : 'per_load',
  );
  const perTonne = pricingBasis === 'per_tonne';
  const [isContract, setIsContract] = useState(prefill?.contract === true);
  const [totalTonnes, setTotalTonnes] = useState('');
  const [minTonnes, setMinTonnes] = useState('');
  const [ratePerTonne, setRatePerTonne] = useState('');
  const [contractStart, setContractStart] = useState('');
  const [contractEnd, setContractEnd] = useState('');
  // Truck unknown: priced (and routed) on the safest truck, the tonnage basis.
  const [autoBasisName, setAutoBasisName] = useState<string | null>(null);
  const basisHistoryRef = useRef<string[]>([]);
  // A new quote collects tomorrow; delivery follows the driving days (below)
  // until the person picks one.
  const [pickupDate, setPickupDate] = useState(editing ? '' : plusDays(1));
  const deliveryTouchedRef = useRef(editing);
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
  // "Describe the load" — what the last Fill did (see submitNL / nlFill.ts).
  // Afrikaans UI after an Afrikaans voice/chat response, else English.
  const [nlLang, setNlLang] = useState<UiLang>('en');
  const [heard, setHeard] = useState<string | null>(null);
  const [fillView, setFillView] = useState<{
    applied: FieldChange[];
    stops: string[];
    stopsLow: boolean;
    notUnderstood: string[];
    vehicleHint: string | null;
    vehicleHintLabel: string | null;
    driverNights: number | null;
    fuelPrice: number | null;
    // Cross-border as this Fill stated it (not a sticky earlier one).
    borderPost: string | null;
    international: boolean | null;
    stated: FieldChange[];
  } | null>(null);
  // The fields a Fill would overwrite that the person typed: asked about first.
  const [pendingFill, setPendingFill] = useState<{
    plan: FillPlan;
    locs: Partial<Record<FillKey, Loc>>;
  } | null>(null);
  // What each earlier Fill wrote, per field: a field still holding it is the
  // Fill's, so a follow-up ("make it 30 ton") replaces it without asking.
  const aiWrittenRef = useRef<Partial<Record<FillKey, string>>>({});
  // Undo for 8 s after a Fill: the exact earlier values of what it changed.
  const undoRef = useRef<{ restores: (() => void)[]; aiPrev: Partial<Record<FillKey, string | undefined>> } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  // international / border_post from the description: used only while the
  // route's own countries are unknown, and as the border line's hint.
  const [aiBorder, setAiBorder] = useState<{ international?: boolean; borderPost?: string } | null>(null);
  const [truckPickerReq, setTruckPickerReq] = useState(0);
  const weightInputRef = useRef<TextInput>(null);
  // Each filled field's box, so a chip can move the screen reader to it.
  const fieldRefs = useRef<Partial<Record<FillKey, View | null>>>({});
  const cargoInputRef = useRef<TextInput>(null);
  // The form's starting values are not "typed": a Fill replaces them freely.
  const fillDefaultsRef = useRef({ pickupDate: editing ? '' : plusDays(1), validUntil: plusDays(7) });
  const [benchmark, setBenchmark] = useState<Record<string, unknown> | null>(null);
  const [tollOverride, setTollOverride] = useState('');
  const [tollEdited, setTollEdited] = useState(false);
  // Driver nights out: the suggested allowance (nights × company rate) until the
  // person types their own figure.
  const [driverAllowance, setDriverAllowance] = useState('');
  const [driverEdited, setDriverEdited] = useState(false);
  // Trip shape and confirmations (QUOTE-RULES §5, §6).
  const [returnLoadBooked, setReturnLoadBooked] = useState(false);
  // Border costs typed on this quote (all legs); '' = the route's figure.
  const [borderOverride, setBorderOverride] = useState('');
  // The clearing agent's fee typed on this quote; '' = the agent estimate.
  const [agentFee, setAgentFee] = useState('');
  // An abnormal load (Zimbabwe charges it a different access toll).
  const [abnormalLoad, setAbnormalLoad] = useState(false);
  const [tollsConfirmedNone, setTollsConfirmedNone] = useState(false);
  const [distanceConfirmed, setDistanceConfirmed] = useState(false);
  // "Use official price" on this quote while the company prices on its own.
  const [useOfficialDiesel, setUseOfficialDiesel] = useState(false);
  // Bumped to force a fresh route calculation ("Recalculate route").
  const [routeNonce, setRouteNonce] = useState(0);
  // The rate box follows the suggested truck until the person types in it.
  const rateTouchedRef = useRef(false);
  // Typed into the rate box this session (it then shows what was typed).
  const rateTypedRef = useRef(false);
  // Reopening a saved quote (§11): the price it was saved at, and how the
  // costs moved since. 'init' until the first current route lands.
  const savedPricingRef = useRef<{
    total: number;
    floor: number | null;
    fuelLitres: number | null;
    fuelPrice: number | null;
    pricedAt: string | null;
  } | null>(null);
  const [reopen, setReopen] = useState<
    | { state: 'init' }
    | { state: 'notice'; change: ChangesSincePriced }
    | { state: 'kept'; earlierPeriod: boolean }
    | { state: 'done' }
  >({ state: 'init' });
  const [baseRatePerKm, setBaseRatePerKm] = useState('');
  const [serviceCharge, setServiceCharge] = useState(0);
  // Market figures applied from the price check. A fuel price replaces the
  // company/live price for its fuel type; a toll figure is per one-way leg and
  // belongs to the plazas it was checked for (routeKey).
  const [aiFuel, setAiFuel] = useState<AiInputs['aiFuel']>(null);
  // A diesel price the person gave for this quote: the per-quote override, not a market figure.
  // Driver nights said in the description and applied: saved as
  // costing_inputs.driver_nights (a typed driver amount still wins).
  const [spokenNights, setSpokenNights] = useState<number | null>(null);
  const [quoteFuel, setQuoteFuel] = useState<{ pricePerL: number; fuelType: string } | null>(null);
  const [aiToll, setAiToll] = useState<AiInputs['aiToll']>(null);
  // Set while market figures are in use: the check it came from and its win chance.
  const [aiApplied, setAiApplied] = useState<{
    logId: number | null;
    key: string;
    winProbability: number | null;
  } | null>(null);
  const preAiRef = useRef<{ before: AiInputs; applied: AiInputs } | null>(null);
  // Where the quote stood when it was last saved: a quote that is not yet SENT
  // is saved as a draft before send_to_customer, which makes the one transition
  // (and so the one email). Patching it to SENT first would email it twice.
  const lastStatusRef = useRef<string>('');
  const [sendPreviewOpen, setSendPreviewOpen] = useState(false);

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
      driverEdited,
      returnLoadBooked,
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
  // round2: tons * 1000 is plain float arithmetic and routinely lands on
  // things like 16100.000000000002 (16.1t) — the backend's weight column is
  // DecimalField(max_digits=10, decimal_places=2), so that noise blows past
  // max_digits and the save is rejected. See round2's own comment in ./quote/types.
  const weightKg = weightTons == null ? 0 : round2(weightTons * 1000);
  const weightInvalid = weight.trim() !== '' && weightTons == null;
  const weightTooLarge = weightTons != null && weightTons > WEIGHT_MAX_TONS;
  const baseRateNum = parseNum(baseRatePerKm) ?? 0;
  // A new quote is priced at the rules' default price (QUOTE-RULES §7:
  // ceil(max(rate × km, floor ÷ (1 − target)))) until the person sets a rate,
  // a price or a market figure. A reopened quote keeps its saved price.
  const [useDefaultPrice, setUseDefaultPrice] = useState(!editing);
  const driverNum = driverEdited ? (parseNum(driverAllowance) ?? 0) : 0;
  // An emptied box is not R 0: until a figure is typed the suggestion (or the
  // warning that there is none) stands.
  const driverOverride = driverEdited ? parseNum(driverAllowance) : null;
  const tollOverrideNum = parseNum(tollOverride) ?? 0;
  // Same for tolls: "Enter tolls" opens the box; only a typed figure counts.
  const tollTyped = tollEdited && parseNum(tollOverride) != null;

  const [routeData, setRouteData] = useState<Record<string, unknown> | null>(null);
  // The inputs routeData was calculated for. An edited quote starts with a stub
  // routeData (just its saved toll), which must never be mistaken for a route
  // that belongs to the current inputs.
  const [routeCalcKey, setRouteCalcKey] = useState<string | null>(null);
  const [routeBlockedMessage, setRouteBlockedMessage] = useState('');
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [analysis, setAnalysis] = useState<Record<string, unknown> | null>(null);
  const [routeBusy, setRouteBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [tollModal, setTollModal] = useState(false);
  const [fuelModal, setFuelModal] = useState(false);
  const [rateModal, setRateModal] = useState(false);
  const [borderModal, setBorderModal] = useState(false);
  const [costModal, setCostModal] = useState(false);
  const savedRouteRef = useRef<{ key: string; distance: number; duration: number } | null>(null);
  const [driverModal, setDriverModal] = useState(false);
  const [adjustModal, setAdjustModal] = useState(false);
  // Where the price adjustment came from: kept from the saved price on reopen,
  // the target-margin fix, the minimum charge, or the market check.
  const [adjustmentSource, setAdjustmentSource] = useState<'saved' | 'target' | 'minimum' | null>(null);
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
  // Synchronous twin of `busy`: setBusy only lands on the next render, so a fast
  // second tap (or the unsaved-changes Alert's Save draft) could start a second
  // save() before the footer buttons disable.
  const savingRef = useRef(false);
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
  const handleVehicleTypeSelect = useCallback(
    (name: string) => {
      setVehicleType(name);
      const vt = (vtypes ?? []).find((v) => v.name === name);
      const vtRate = Number(vt?.base_rate) || 0;
      if (vtRate > 0) {
        setBaseRatePerKm(String(vtRate));
        return;
      }
      const def = num(pick(company ?? {}, ['default_base_rate_per_km']));
      if (def > 0) setBaseRatePerKm(String(def));
    },
    [vtypes, company],
  );

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
      if (pick(q, ['pricing_basis']) === 'per_tonne') {
        setPricingBasis('per_tonne');
        const tot = pick(q, ['total_tonnes']);
        setIsContract(tot != null);
        setTotalTonnes(tot != null ? formatPlain(num(tot)) : '');
        const mn = pick(q, ['min_tonnes_per_load']);
        setMinTonnes(mn != null ? formatPlain(num(mn)) : '');
        const rt = pick(q, ['rate_per_tonne']);
        setRatePerTonne(rt != null ? formatPlain(num(rt)) : '');
        setContractStart(str(pick(q, ['contract_start'])));
        setContractEnd(str(pick(q, ['contract_end'])));
        const tpl = pick(q, ['tonnes_per_load']);
        if (tpl != null) setWeight(formatPlain(num(tpl)));
        // Saved on the safest truck (none chosen): reopens on "safest".
        if (pick(q, ['basis_vehicle_type']) == null) setVehicleType('');
      }
      setCargo(str(pick(q, ['cargo_description'])));
      setTollOverride(String(num(pick(q, ['toll_charges']))));
      lastStatusRef.current = str(pick(q, ['status'])).toUpperCase();
      // A market fuel price applied from the price check, and a typed or market
      // toll figure, are the person's choice, so they survive a reload. Tolls the
      // route itself supplied still do not pin: they follow the recalculated route.
      const snap = (pick(q, ['route_snapshot']) ?? {}) as Record<string, unknown>;
      // Driver: a typed figure stays; a suggested one follows the route. Quotes
      // saved before the snapshot defaulted to R 0, so only a non-zero amount
      // there was typed.
      const savedDriver = num(pick(q, ['driver_allowance']));
      const driverWasTyped =
        'driver_source' in snap ? snap.driver_source === 'user' : savedDriver > 0;
      setDriverAllowance(driverWasTyped ? formatPlain(savedDriver) : '');
      setDriverEdited(driverWasTyped);
      setReturnLoadBooked(snap.return_load_booked === true);
      setTollsConfirmedNone(snap.tolls_confirmed_none === true);
      setDistanceConfirmed(snap.distance_confirmed === true);
      setUseOfficialDiesel(snap.use_official === true);
      // The quote's own border choices (costing_inputs, newer backends).
      const ci = (pick(q, ['costing_inputs']) ?? {}) as Record<string, unknown>;
      const reopened = reopenedInputs(ci);
      setAbnormalLoad(reopened.abnormalLoad);
      setAgentFee(reopened.agentFee);
      setBorderOverride(reopened.borderOverride);
      rateTouchedRef.current = true;
      const fuelUsed = num(pick(q, ['fuel_price_used'])) || num(snap.fuel_price_per_litre_used);
      savedPricingRef.current = {
        total: num(pick(q, ['total_amount'])),
        // The backend's own snapshot first (Quote.cost_floor), else the copy
        // in route_snapshot (older backends).
        floor:
          pick(q, ['cost_floor']) != null
            ? num(pick(q, ['cost_floor']))
            : snap.cost_floor != null
              ? num(snap.cost_floor)
              : null,
        fuelLitres: num(pick(q, ['fuel_litres'])) || num(snap.fuel_litres) || null,
        fuelPrice: fuelUsed || null,
        pricedAt:
          str(pick(q, ['priced_at'])) || str(snap.priced_at) || str(pick(q, ['updated_at', 'created_at'])) || null,
      };
      const fromMarket = (v: unknown) => ['market_check', 'ai_market'].includes(str(v));
      setAiFuel(
        fromMarket(snap.fuel_price_source) && num(snap.fuel_price_per_litre_used) > 0
          ? {
              pricePerL: num(snap.fuel_price_per_litre_used),
              fuelType: str(snap.fuel_type_used) || 'Diesel',
            }
          : null,
      );
      const savedNights = num(pick(ci, ['driver_nights']));
      setSpokenNights(savedNights > 0 ? Math.round(savedNights) : null);
      // A diesel price given for this quote (not a market figure) comes back too.
      const savedOverride = num(pick(ci, ['fuel_price_override']));
      setQuoteFuel(
        !fromMarket(snap.fuel_price_source) && savedOverride > 0
          ? { pricePerL: savedOverride, fuelType: str(snap.fuel_type_used) || 'Diesel' }
          : null,
      );
      setTollEdited(
        str(snap.toll_charges_source) === 'manual' && pick(q, ['toll_charges']) != null,
      );
      setAiToll(
        fromMarket(snap.toll_charges_source) &&
          num(snap.ai_toll_one_way) > 0 &&
          str(snap.ai_toll_route_key)
          ? { oneWay: num(snap.ai_toll_one_way), routeKey: str(snap.ai_toll_route_key) }
          : null,
      );
      const trip = (str(pick(q, ['trip_type'])) as 'ONE_WAY' | 'ROUND_TRIP') || 'ROUND_TRIP';
      setTripType(trip);
      const dist = num(pick(q, ['distance']));
      const baseRate = num(pick(q, ['base_rate']));
      const legs = trip === 'ROUND_TRIP' ? 2 : 1;
      // Full precision: base_rate ÷ the saved km gives back the saved base
      // rate to the cent (the stored rate per km is 2 dp, which drifted it,
      // and with it the "Kept from saved price" adjustment).
      const savedRate = num(pick(q, ['base_rate_per_km']));
      if (dist && baseRate) setBaseRatePerKm(String(baseRate / (dist * legs)).replace('.', ','));
      else if (savedRate > 0) setBaseRatePerKm(formatPlain(savedRate));
      // The route as it was priced: while collection, delivery, stops, truck
      // and weight are unchanged, the quote keeps its saved distance and
      // driving time (a fresh TomTom run differs by a few km with traffic),
      // so the builder and the quote detail show the same figures.
      savedRouteRef.current = {
        key: routeKeyOf(
          { label: '', lat: num(pick(q, ['pickup_lat'])), lon: num(pick(q, ['pickup_lng'])) },
          { label: '', lat: num(pick(q, ['delivery_lat'])), lon: num(pick(q, ['delivery_lng'])) },
          savedStops.map((st, i) => ({
            id: `saved-${i}`,
            loc: { label: '', lat: num(pick(st, ['lat'])), lon: num(pick(st, ['lon'])) },
          })),
          str(pick(q, ['vehicle_type'])),
          round2(num(pick(q, ['weight']))),
        ),
        distance: dist,
        duration: num(pick(q, ['estimated_duration_minutes'])),
      };
      setValidUntil(str(pick(q, ['valid_until'])) || plusDays(7));
      setPickupDate(str(pick(q, ['pickup_date'])));
      setDeliveryDate(str(pick(q, ['delivery_date'])));
      savedId.current = editId ?? null;
      // toll_charges is all legs; the route figure is one direction.
      const tollOneWay = num(pick(q, ['toll_charges'])) / legs;
      setRouteData({
        distance_km: dist,
        toll_cost_zar: tollOneWay,
        routes: [{ distance_km: dist, toll_cost_zar: tollOneWay }],
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
  // Every quote is priced on a real truck (§3). With none chosen, the
  // suggested one for the load is used: smallest capacity that carries it,
  // tie → lowest rated burn. The person can change it.
  // The server's suggestion wins when it has one (newer backends).
  // Kept with the load and cargo it was given for, so a stale answer never
  // overrides the local pick for a new load. The local pick mirrors the
  // backend rule exactly (same eligibility, most-quoted from the quotes list
  // already downloaded), so the server's answer normally agrees: no jump.
  const [serverSuggested, setServerSuggested] = useState<{ id: string; key: string } | null>(null);
  const suggestKey = `${weightKg}|${cargo.trim().toLowerCase()}`;
  const quoteUsage = useMemo(() => {
    const rows =
      qc.getQueryData<{ rows?: Record<string, unknown>[] }>(['ledger-quotes'])?.rows ?? [];
    const out: Record<string, number> = {};
    for (const r of rows) {
      const n = str(pick(r, ['vehicle_type'])).trim().toLowerCase();
      if (n) out[n] = (out[n] ?? 0) + 1;
    }
    return out;
    // Read once per truck list: the counts only break capacity ties.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vtypes]);
  const suggestedTruck = useMemo(() => {
    const local = suggestTruck(vtypes ?? [], weightTons ?? 0, { cargo, usage: quoteUsage });
    const fromServer =
      serverSuggested && serverSuggested.key === suggestKey
        ? (vtypes ?? []).find((v) => String(v.id) === serverSuggested.id)
        : null;
    return fromServer ?? local;
  }, [vtypes, weightTons, cargo, quoteUsage, serverSuggested, suggestKey]);
  const pricedTruckName = vehicleType || (perTonne ? autoBasisName : null) || suggestedTruck?.name || '';
  const pricedTruckId = (vtypes ?? []).find((v) => v.name === pricedTruckName)?.id ?? null;

  // The rate follows the suggested truck until the person types a rate.
  useEffect(() => {
    if (vehicleType || editing || rateTouchedRef.current || !suggestedTruck) return;
    const vtRate = Number(suggestedTruck.base_rate) || 0;
    const def = num(pick(company ?? {}, ['default_base_rate_per_km']));
    const next = vtRate > 0 ? vtRate : def;
    if (next > 0) setBaseRatePerKm(String(next));
  }, [suggestedTruck, vehicleType, editing, company]);

  const vtypeOptions = useMemo(() => {
    const seen = new Set<string>();
    const base = (vtypes ?? [])
      .filter((v) => (v.available_vehicle_count ?? 1) > 0 || v.name === pricedTruckName)
      .filter((v) => (seen.has(v.name) ? false : (seen.add(v.name), true)))
      .map((v) => {
        const cap = capacityTons(v.capacity);
        // No "(30 t)" when the name already says the tonnes ("8 ton rigid").
        const named = /\d\s*(t|ton|tons|tonne|tonnes)\b/i.test(v.name);
        return { label: cap && !named ? `${v.name} (${formatPlain(cap)} t)` : v.name, value: v.name };
      });
    // A saved type that's no longer in the list still has to show.
    if (pricedTruckName && !seen.has(pricedTruckName)) base.push({ label: pricedTruckName, value: pricedTruckName });
    return base;
  }, [vtypes, pricedTruckName]);

  // Same four prerequisites as before, but as a list rather than a boolean, so
  // the footer and the Price section can name the one that's actually missing
  // instead of both saying "a route" whatever the user has left blank.
  const priceGaps = useMemo(
    () => missingPriceInputs({ customerId, pickup, delivery, weightKg }),
    [customerId, pickup, delivery, weightKg],
  );
  const ready = priceGaps.length === 0;

  // Route calc (debounced 500ms, stale-guarded).
  useEffect(() => {
    if (!ready || !pickup || !delivery) return;
    const id = ++routeReq.current;
    const calcKey = routeKeyOf(pickup, delivery, stops, pricedTruckName, weightKg);
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
          // The truck sets the toll class. 'Flatbed' only stands in while the
          // fleet has no truck at all, and then the quote can't be priced.
          vehicle_type: pricedTruckName || 'Flatbed',
          // The id pins the exact type (toll class, fuel) when names repeat.
          ...(pricedTruckId != null ? { vehicle_type_id: pricedTruckId } : {}),
          // Tariffs in force on the collection date (newer backends warn when
          // it's past the published year); today when not set.
          ...(pickupDate ? { pickup_date: pickupDate, trip_date: pickupDate } : {}),
          // The way home on its own route: round trip, or a one-way trip that
          // may come back empty. Older backends ignore these.
          trip_type: tripType,
          include_return: tripType === 'ONE_WAY' && !returnLoadBooked,
          // The agent's fee typed on this quote (priced into the border lines).
          // Zimbabwe charges an abnormal load its own access toll.
          ...(abnormalLoad ? { abnormal_load: true } : {}),
          // No fallback needed: this effect only runs once `ready`, and
          // weight is one of the priceGaps, so weightKg is guaranteed
          // positive here.
          weight_kg: weightKg,
          // Unresolved rows (no coords yet) are omitted rather than blocking
          // the calc — same shape RouteCalculatorView already parses for web.
          stops: stops.filter((s) => s.loc).map((s) => ({ lat: s.loc!.lat, lon: s.loc!.lon })),
        });
        if (id === routeReq.current && (res as { success?: boolean }).success !== false) {
          setRouteBlockedMessage('');
          setRouteData(res);
          setRouteCalcKey(calcKey);
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
    // abnormalLoad changes the border lines the route prices. The agent's fee
    // does not re-route (every lookup costs): it's applied to the border
    // lines already here, and sent with the costing and the save.
  }, [ready, pickup, delivery, stops, pricedTruckName, pricedTruckId, weightKg, routeNonce, pickupDate, tripType, returnLoadBooked, abnormalLoad]);

  // A confirmation ("no tolls", "distance is right") belongs to the route it
  // was given for: a new route asks again.
  const confirmedForKey = useRef<string | null>(null);
  useEffect(() => {
    if (!routeCalcKey) return;
    if (confirmedForKey.current && confirmedForKey.current !== routeCalcKey) {
      setTollsConfirmedNone(false);
      setDistanceConfirmed(false);
    }
    confirmedForKey.current = routeCalcKey;
  }, [routeCalcKey]);

  const routes = useMemo(
    () => asArray(pick(routeData ?? {}, ['routes'])) as Record<string, unknown>[],
    [routeData],
  );
  const currentRoute = useMemo(() => {
    const r = (routes[selectedRouteIndex] ?? routes[0] ?? {}) as Record<string, unknown>;
    const saved = savedRouteRef.current;
    // A reopened quote on its own route keeps the distance and time it was
    // priced on (see hydration); any change to the trip prices it afresh.
    if (
      saved &&
      saved.distance > 0 &&
      selectedRouteIndex === num(pick(routeData ?? {}, ['best_index'])) &&
      routeCalcKey === saved.key
    ) {
      return { ...r, distance_km: saved.distance, ...(saved.duration > 0 ? { duration_minutes: saved.duration } : {}) };
    }
    return r;
  }, [routes, selectedRouteIndex, routeCalcKey, routeData]);
  // The response's own pick — RouteOptionChips' RECOMMENDED tag (Phase 5).
  const bestIndex = num(pick(routeData ?? {}, ['best_index']));

  // The plazas on the selected route, and the key an applied market toll figure
  // is tied to: it only applies while the route still has the same plazas on the
  // same truck.
  const tollRouteKey = useMemo(() => {
    const breakdown = asArray(pick(currentRoute, ['toll_breakdown'])).length
      ? asArray(pick(currentRoute, ['toll_breakdown']))
      : asArray(pick(routeData ?? {}, ['toll_breakdown']));
    return JSON.stringify([
      pricedTruckName,
      (breakdown as Record<string, unknown>[]).map((b) => str(pick(b, ['plaza']))),
    ]);
  }, [currentRoute, routeData, pricedTruckName]);
  const aiTollOneWay = aiToll && aiToll.routeKey === tollRouteKey ? aiToll.oneWay : null;
  const fuelTypeNow = str((vtypes ?? []).find((v) => v.name === pricedTruckName)?.fuel_type, 'Diesel');
  const aiFuelPrice = aiFuel && aiFuel.fuelType === fuelTypeNow ? aiFuel.pricePerL : null;
  // The person's own price for this quote (backend fuel_price_override, R5–R100).
  const quoteFuelPrice = quoteFuel && quoteFuel.fuelType === fuelTypeNow ? quoteFuel.pricePerL : null;

  // A border schedule that depends on an abnormal load: Zimbabwe's access toll.
  const routeCrossesZimbabwe = [
    ...asArray<string>(pick(routeData ?? {}, ['countries'])),
    ...asArray<string>(pick(currentRoute, ['countries'])),
    pickup?.cc,
    delivery?.cc,
    ...stops.map((st) => st.loc?.cc),
  ].some((c) => /^(ZW|ZWE|Zimbabwe)$/i.test(String(c ?? '')));
  // An abnormal load is kept on the quote, but only prices on a Zimbabwe route.
  const abnormalApplies = abnormalLoad && routeCrossesZimbabwe;

  // The trip leaves South Africa (route flag, a foreign country on the route,
  // or a foreign point): its floor then needs border costs.
  const routeCountriesKnown =
    asArray<string>(pick(routeData ?? {}, ['countries'])).length > 0 ||
    [pickup?.cc, delivery?.cc, ...stops.map((st) => st.loc?.cc)].some((c) => !!c);
  const crossesBorder =
    !!pick(routeData ?? {}, ['cross_border']) ||
    asArray<string>(pick(routeData ?? {}, ['countries'])).some((c) => isForeignCc(c)) ||
    [pickup?.cc, delivery?.cc, ...stops.map((st) => st.loc?.cc)].some((c) => isForeignCc(c)) ||
    // The description said cross-border, and no country is known yet to say otherwise.
    (!routeCountriesKnown && aiBorder?.international === true);

  // The backend's costing for these inputs (newer backends only): supplies
  // the approved driver allowance, the fleet's operating cost and the diesel
  // resolution, so the figures here are the server's to the cent.
  const pricedTruck = useMemo(
    () => (vtypes ?? []).find((v) => v.name === pricedTruckName) ?? null,
    [vtypes, pricedTruckName],
  );
  const routeOneWayKm = num(pick(currentRoute, ['distance_km'])) || num(pick(routeData ?? {}, ['distance_km']));
  const routeMinutes =
    num(pick(currentRoute, ['duration_minutes'])) ||
    num(pick(currentRoute, ['duration_min'])) ||
    num(pick(routeData ?? {}, ['duration_minutes']));
  const serverPayload = useMemo<Record<string, unknown> | null>(
    () =>
      ready && routeData && pricedTruck && routeOneWayKm > 0
        ? {
            trip_type: tripType,
            one_way_distance_km: routeOneWayKm,
            duration_minutes: routeMinutes || null,
            // No weight yet = unknown (server warns load_missing), never 0 t.
            load_kg: weightKg > 0 ? weightKg : null,
            vehicle_type_id: pricedTruck.id,
            vehicle_type: pricedTruck.name,
            include_empty_return: returnLoadBooked ? false : null,
            use_official_fuel: useOfficialDiesel,
            fuel_price_override: aiFuelPrice ?? quoteFuelPrice ?? null,
            is_international: crossesBorder,
            cargo_description: cargo || null,
            ...(pickupDate ? { pickup_date: pickupDate } : {}),
            ...(parseNum(agentFee) != null ? { clearing_agent_fee_zar: parseNum(agentFee) } : {}),
            ...(abnormalApplies ? { abnormal_load: true } : {}),
            // Nights said for this trip; a typed driver amount still wins.
            ...(spokenNights != null && !driverEdited ? { driver_nights: spokenNights } : {}),
            // The route's own border data: the server works out what's unknown.
            route: {
              cross_border: !!pick(routeData ?? {}, ['cross_border']),
              border_costs_unknown: pick(routeData ?? {}, ['border_costs_unknown']) ?? null,
              cross_border_breakdown: pick(routeData ?? {}, ['cross_border_breakdown']) ?? null,
            },
            ...(parseNum(borderOverride) != null
              ? { cross_border_cost: parseNum(borderOverride), border_cost_is_override: true }
              : {}),
            // Echoed back with the answer: which load the suggestion is for.
            _suggest_key: suggestKey,
          }
        : null,
    [ready, routeData, pricedTruck, routeOneWayKm, routeMinutes, tripType, weightKg, returnLoadBooked, useOfficialDiesel, aiFuelPrice, quoteFuelPrice, crossesBorder, cargo, suggestKey, borderOverride, pickupDate, agentFee, abnormalApplies, spokenNights, driverEdited],
  );
  const serverCosting = useServerCosting(serverPayload);
  const nextServerSuggested =
    serverCosting?.suggestedVehicleTypeId != null && serverCosting.forKey
      ? `${serverCosting.suggestedVehicleTypeId}@${serverCosting.forKey}`
      : null;
  useEffect(() => {
    if (!nextServerSuggested) return;
    const at = nextServerSuggested.indexOf('@');
    setServerSuggested({ id: nextServerSuggested.slice(0, at), key: nextServerSuggested.slice(at + 1) });
  }, [nextServerSuggested]);


  // ── Cost breakdown ──────────────────────────────────────────────────────
  // quote/costs.ts: the price lines, and the cost floor, margin and warnings
  // from the quote rules (quote/rules.ts, mirrored from the backend).
  const costs = useMemo(
    () =>
      computeCosts({
        currentRoute,
        routeData,
        tripType,
        vtypes,
        vehicleType: pricedTruckName,
        company,
        weightKg,
        baseRateNum,
        useDefaultPrice,
        tollEdited: tollTyped,
        tollOverrideNum,
        driverOverride,
        serviceCharge,
        liveFuel,
        aiFuelPrice,
        quoteFuelPrice,
        // Applied nights out; a typed driver amount still wins.
        driverNights: spokenNights,
        useOfficialDiesel,
        aiTollOneWay,
        returnLoadBooked,
        international: crossesBorder,
        borderOverride: parseNum(borderOverride),
        agentFeeOverride: parseNum(agentFee),
        tollsConfirmedNone,
        distanceConfirmed,
        serverInputs: serverCosting?.inputs ?? null,
      }),
    [
      currentRoute,
      routeData,
      tripType,
      vtypes,
      pricedTruckName,
      company,
      weightKg,
      baseRateNum,
      useDefaultPrice,
      tollTyped,
      tollOverrideNum,
      driverOverride,
      serviceCharge,
      liveFuel,
      aiFuelPrice,
      quoteFuelPrice,
      spokenNights,
      useOfficialDiesel,
      aiTollOneWay,
      returnLoadBooked,
      crossesBorder,
      borderOverride,
      agentFee,
      tollsConfirmedNone,
      distanceConfirmed,
      serverCosting,
    ],
  );

  // ── Per tonne ────────────────────────────────────────────────────────────
  // Every truck in the fleet that can carry it, priced on the safest unless one
  // is chosen (QUOTE-RULES "Tonnage quotes"). The server's answer when in, the
  // same rules locally until then.
  const tonnesNum = (v: string) => {
    const n = parseNum(v);
    return n != null && n > 0 ? n : null;
  };
  const rateNum = tonnesNum(ratePerTonne);
  const totalTonnesNum = isContract ? tonnesNum(totalTonnes) : null;
  const minTonnesNum = tonnesNum(minTonnes);
  const chosenTruckId = vehicleType ? ((vtypes ?? []).find((v) => v.name === vehicleType)?.id ?? null) : null;
  const localTonnage = useMemo<TonnageCosting | null>(() => {
    if (!perTonne || !(weightTons && weightTons > 0) || !routeData) return null;
    const lane: TonnageLane = { ...costs.costingInputs };
    const trucks = (vtypes ?? [])
      .filter((v) => (v.available_vehicle_count ?? 1) > 0)
      .map((v) => {
        const op = operatingCostPerKm(company ?? {}, v, vtypes ?? []);
        return {
          vehicle: { id: Number(v.id), name: v.name, capacity: v.capacity, rated_burn_l_per_100km: v.fuel_consumption_l_per_100km },
          operating_cost_per_km: op.perKm,
          operating_cost_source: op.source,
        };
      });
    return computeTonnage({
      lane,
      trucks,
      tonnes_per_load: weightTons,
      total_tonnes: totalTonnesNum,
      min_tonnes_per_load: minTonnesNum,
      vehicle_type_id: chosenTruckId != null ? Number(chosenTruckId) : null,
      rate_per_tonne: rateNum,
    });
  }, [perTonne, weightTons, routeData, costs.costingInputs, vtypes, company, totalTonnesNum, minTonnesNum, chosenTruckId, rateNum]);
  const tonnagePayload = useMemo<Record<string, unknown> | null>(
    () =>
      perTonne && ready && routeData && routeOneWayKm > 0 && weightTons
        ? {
            pricing_basis: 'per_tonne',
            customer_id: Number(customerId) || null,
            pickup_location: pickup?.label ?? '',
            delivery_location: delivery?.label ?? '',
            cargo_description: cargo || null,
            trip_type: tripType,
            one_way_distance_km: routeOneWayKm,
            duration_minutes: routeMinutes || null,
            is_international: crossesBorder,
            tonnes_per_load: weightTons,
            total_tonnes: totalTonnesNum,
            min_tonnes_per_load: minTonnesNum,
            vehicle_type_id: chosenTruckId,
            rate_per_tonne: rateNum,
            toll_cost_one_way: costs.tollKnown ? (costs.costingInputs.tolls?.one_way ?? null) : null,
            tolls_unknown: !costs.tollKnown,
            tolls_confirmed_none: tollsConfirmedNone,
            include_empty_return: returnLoadBooked ? false : null,
            distance_confirmed: distanceConfirmed,
            use_official_fuel: useOfficialDiesel,
            ...(parseNum(borderOverride) != null ? { cross_border_cost: parseNum(borderOverride) } : {}),
            ...(driverEdited && parseNum(driverAllowance) != null
              ? { driver_cost: parseNum(driverAllowance), driver_cost_is_override: true }
              : {}),
          }
        : null,
    [perTonne, ready, routeData, routeOneWayKm, routeMinutes, weightTons, customerId, pickup?.label, delivery?.label, cargo, tripType, crossesBorder, totalTonnesNum, minTonnesNum, chosenTruckId, rateNum, costs.tollKnown, costs.costingInputs.tolls?.one_way, tollsConfirmedNone, returnLoadBooked, distanceConfirmed, useOfficialDiesel, borderOverride, driverEdited, driverAllowance],
  );
  const tonnageServer = useTonnageAnalysis(tonnagePayload);
  const tonnageView = perTonne ? (tonnageServer?.costing ?? localTonnage) : null;
  const tonnage = tonnageView?.tonnage ?? null;
  // The rate saved: the person's, else the default (target margin, minimum charge).
  const rateToSave = rateNum ?? tonnage?.default_rate_per_tonne ?? null;
  const tonnageTotal = tonnage?.estimated_revenue ?? 0;
  useEffect(() => {
    if (!perTonne || vehicleType) return;
    const id = tonnage?.basis_vehicle_type_id;
    const name = id != null ? ((vtypes ?? []).find((v) => String(v.id) === String(id))?.name ?? null) : null;
    if (!name || name === autoBasisName) return;
    const h = basisHistoryRef.current;
    if (h.length >= 2 && h[h.length - 2] === name) return; // never flip back and forth
    basisHistoryRef.current = [...h.slice(-3), name];
    setAutoBasisName(name);
  }, [perTonne, vehicleType, tonnage?.basis_vehicle_type_id, vtypes, autoBasisName]);

  // The quote rules' inputs for the analysis and the market check (§8).
  const costingPayload = analysisPayload({
    tripType,
    legs: costs.legs,
    oneWayKm: costs.distance,
    durationMinutes: costs.duration,
    truckId: costs.truckId,
    returnLoadBooked,
    tollKnown: costs.tollKnown,
    tollCost: costs.tollCost,
    tollsConfirmedNone,
    driverEdited,
    international: crossesBorder,
    borderCost: costs.crossBorderCost,
    distanceEstimated: costs.distanceEstimated,
    distanceConfirmed,
    useOfficialFuel: useOfficialDiesel,
    borderCostsUnknown: costs.costingInputs.border_costs_unknown ?? null,
    borderCostIsOverride: !!costs.costingInputs.border_cost_is_override,
  });

  // The rate the price works out to (the default price's, or the typed one).
  const effectiveRateNum = costs.priceIsDefault ? costs.ratePerKmShown : baseRateNum;

  // An overloaded truck has no legitimate price: the cost card gives way to
  // the warning.
  // Delivery = collection + the nights the trip takes (9 driving hours a day).
  const transitNights = costs.duration > 0 ? Math.max(Math.ceil(costs.duration / 60 / 9) - 1, 0) : null;
  useEffect(() => {
    if (deliveryTouchedRef.current || !pickupDate || transitNights === null) return;
    const d = new Date(`${pickupDate}T00:00:00`);
    if (Number.isNaN(d.getTime())) return;
    d.setDate(d.getDate() + transitNights);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setDeliveryDate(iso);
  }, [pickupDate, transitNights]);

  const overloadWarning = costs.warnings.find((w) => w.code === 'overload');
  // A tonnage quote heavier than a truck is split into loads, never blocked.
  const weightBlockedMessage = overloadWarning && !perTonne ? overloadWarning.title : '';

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
    // Straight into the loading state, so the gap before the debounce fires
    // can't render the bare cost total under a "Recommended price" label.
    // Conditioned exactly as the analyze effect below, so a pass that bails
    // can't leave the card stuck on a skeleton.
    if (routeData && costs.total > 0 && pickup && delivery) setAiBusy(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [costs.directCost, pricedTruckName, weightKg, selectedRouteIndex]);

  // AI analyze + guard (debounced 700ms, stale-guarded).
  useEffect(() => {
    // No point spending an AI-pricing call on a quote that cannot be saved.
    if (subscription.blocked) return;
    if (!routeData || costs.total <= 0 || !pickup || !delivery) return;
    const id = ++aiReq.current;
    const t = setTimeout(async () => {
      setAiBusy(true);
      // Below-cost is said once, by the rules' below_floor warning: the old
      // revenue-guard call is gone.
      const [a] = await Promise.all([
        analyzeQuote({
          quote_total: costs.total,
          // The cost floor (§7), so the analysis judges margin on real costs.
          direct_cost: costs.floor ?? costs.directCost,
          distance_km: costs.chargeDistance,
          origin: extractCode(pickup.label),
          destination: extractCode(delivery.label),
          vehicle_type: pricedTruckName,
          weight: weightKg,
          fuel_cost: costs.fuelCost,
          toll_cost: costs.tollCost,
          driver_cost: costs.driver,
          fuel_usage_litres: costs.fuelUsage,
          fuel_price_used: costs.fuelPrice,
          // The lane market median (rounded); null when there is no market,
          // never 0.
          market_rate: num(pick(benchmark ?? {}, ['market_avg_rate'])) || null,
          client_tier: 'standard',
          // Lets the server derive the real client tier and historical
          // acceptance rate instead of reusing whatever the last customer's
          // analysis resolved — see the customerId dep below.
          customer_id: customerId ? parseInt(customerId, 10) : null,
          skip_narrative: true,
          // The full costing payload (quote/analysisPayload.ts): trip_type,
          // legs, one_way_distance_km, duration_minutes, vehicle_type_id,
          // include_empty_return, toll flags, driver_cost_is_override,
          // is_international and border costs. Older backends ignore them.
          ...costingPayload,
        }).catch(() => null),
      ]);
      if (id === aiReq.current) {
        setAnalysis(a);
        setAiBusy(false);
      }
      // The endpoint requires a vehicle type (QuoteBenchmarkView 400s without
      // one) — with none picked there is no lane benchmark to fetch, so skip
      // the call instead of sending one guaranteed to fail. Resetting
      // benchKey lets a type picked later refetch immediately rather than
      // matching a stale lane key from before it was cleared.
      if (!pricedTruckName) {
        benchKey.current = '';
        setBenchmark(null);
      } else {
        // Same lane (origin/destination/vehicle) as the last fetch → the
        // benchmark can't have changed, so skip it. Without this, every Apply
        // recommended and every keystroke in Tolls/Driver/Rate — none of which
        // touch origin/destination/vehicleType — re-fired this network call.
        const lane = `${extractCode(pickup.label)}|${extractCode(delivery.label)}|${pricedTruckName}`;
        if (benchKey.current !== lane) {
          benchKey.current = lane;
          benchmarkQuote(extractCode(pickup.label), extractCode(delivery.label), pricedTruckName)
            .then((b) => id === aiReq.current && setBenchmark(b))
            .catch(() => null);
        }
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
    costs.crossBorderCost,
    costs.driver,
    costs.fuelUsage,
    costs.fuelPrice,
    costs.floor,
    costs.tollKnown,
    returnLoadBooked,
    crossesBorder,
    driverEdited,
    pickup,
    delivery,
    pricedTruckName,
    weightKg,
    selectedRouteIndex,
    // Switching client alone should re-run analysis — the server derives a
    // real client tier / historical acceptance rate from customer_id.
    customerId,
  ]);

  // The analysis still feeds the revenue guard and the win chance that is saved
  // with the quote. The win-model "recommended price" it used to drive is gone:
  // the market price check below replaced it.
  const opt = useMemo(
    () => (pick(analysis ?? {}, ['price_optimization']) ?? {}) as Record<string, unknown>,
    [analysis],
  );
  const winProb = num(pick(opt, ['win_probability_at_optimal']));
  // ── Describe the load (typed or voice) ────────────────────────────────────
  // The form as the Fill rule compares it (nlFill.planFill): value '' = empty.
  const fillCurrent = (lang: UiLang): Partial<Record<FillKey, FieldVal>> => {
    const loc = (l: Loc | null): FieldVal =>
      l ? { value: l.label, display: placeShort(l.label), lat: l.lat, lon: l.lon } : { value: '', display: '' };
    const yesNo = (b: boolean) => (b ? (lang === 'af' ? 'Ja' : 'Yes') : lang === 'af' ? 'Nee' : 'No');
    return {
      pickup: loc(pickup),
      delivery: loc(delivery),
      weight:
        weightTons != null
          ? { value: plainNumber(weightTons), display: tonsLabel(weightTons) }
          : { value: weight.trim(), display: weight.trim() },
      cargo: { value: cargo.trim(), display: cargo.trim() },
      vehicle: { value: vehicleType, display: vehicleType },
      client: {
        value: customerId,
        display: customerOptions.find((o) => o.value === customerId)?.label ?? '',
      },
      pickupDate: { value: pickupDate, display: shortDate(pickupDate, lang) },
      deliveryDate: { value: deliveryDate, display: shortDate(deliveryDate, lang) },
      validUntil: { value: validUntil, display: shortDate(validUntil, lang) },
      tripType: {
        value: tripType,
        display: tripType === 'ROUND_TRIP' ? t(lang, 'round_trip') : t(lang, 'one_way'),
      },
      returnLoad: { value: returnLoadBooked ? 'yes' : 'no', display: yesNo(returnLoadBooked) },
      abnormal: { value: abnormalLoad ? 'yes' : 'no', display: yesNo(abnormalLoad) },
    };
  };

  const geocodeFirst = async (q: string): Promise<Loc | null> => {
    try {
      const first = asArray(await suggestLocations(q))[0] as Record<string, unknown> | undefined;
      if (!first) return null;
      return {
        label: str(pick(first, ['label', 'name', 'description'])),
        lat: num(pick(first, ['lat', 'latitude'])),
        lon: num(pick(first, ['lon', 'lng', 'longitude'])),
        cc: str(pick(first, ['country_code'])) || undefined,
      };
    } catch {
      return null;
    }
  };

  // Writes one change into the form and returns how to put the old value back.
  const applyFillChange = (c: FieldChange, locs: Partial<Record<FillKey, Loc>>): (() => void) => {
    switch (c.key) {
      case 'pickup': {
        const prev = pickup;
        const l = locs.pickup;
        if (l) setPickup(l);
        return () => setPickup(prev);
      }
      case 'delivery': {
        const prev = delivery;
        const l = locs.delivery;
        if (l) setDelivery(l);
        return () => setDelivery(prev);
      }
      case 'weight': {
        const prev = weight;
        setWeight(c.to.value);
        return () => setWeight(prev);
      }
      case 'cargo': {
        const prev = cargo;
        setCargo(c.to.display);
        return () => setCargo(prev);
      }
      case 'vehicle': {
        const prev = vehicleType;
        const prevRate = baseRatePerKm;
        const resolved = resolveVehicleTypeName(c.to.value);
        // Through the dropdown's own handler, so a resolved type gets its rate
        // exactly like a manual pick. An unresolved type is shown as-is for the
        // person to correct, rate untouched.
        if (resolved) handleVehicleTypeSelect(resolved);
        else setVehicleType(c.to.value);
        return () => {
          setVehicleType(prev);
          setBaseRatePerKm(prevRate);
        };
      }
      case 'client': {
        const prev = customerId;
        // The backend already matched the spoken name to a real customer.
        setCustomerId(c.to.value);
        // A client created mid-conversation isn't in the cached picker yet.
        invalidateFor(qc, 'customer');
        return () => setCustomerId(prev);
      }
      case 'pickupDate': {
        const prev = pickupDate;
        setPickupDate(c.to.value);
        return () => setPickupDate(prev);
      }
      case 'deliveryDate': {
        const prev = deliveryDate;
        const prevTouched = deliveryTouchedRef.current;
        deliveryTouchedRef.current = true;
        setDeliveryDate(c.to.value);
        return () => {
          deliveryTouchedRef.current = prevTouched;
          setDeliveryDate(prev);
        };
      }
      case 'validUntil': {
        const prev = validUntil;
        setValidUntil(c.to.value);
        return () => setValidUntil(prev);
      }
      case 'tripType': {
        const prev = tripType;
        setTripType(c.to.value as 'ONE_WAY' | 'ROUND_TRIP');
        return () => setTripType(prev);
      }
      case 'returnLoad': {
        const prev = returnLoadBooked;
        setReturnLoadBooked(c.to.value === 'yes');
        return () => setReturnLoadBooked(prev);
      }
      case 'abnormal': {
        const prev = abnormalLoad;
        setAbnormalLoad(c.to.value === 'yes');
        return () => setAbnormalLoad(prev);
      }
    }
  };

  // Applies changes, records them as the Fill's own, and opens (or extends) the
  // 8 s Undo window.
  const commitFill = (
    changes: FieldChange[],
    locs: Partial<Record<FillKey, Loc>>,
    extraRestores: (() => void)[] = [],
    extend = false,
  ) => {
    const restores = changes.map((c) => applyFillChange(c, locs));
    const aiPrev: Partial<Record<FillKey, string | undefined>> = {};
    for (const c of changes) {
      aiPrev[c.key] = aiWrittenRef.current[c.key];
      aiWrittenRef.current[c.key] = c.to.value;
    }
    const all = [...restores, ...extraRestores];
    // A new Fill closes the previous one's Undo, even when it applied nothing
    // itself (only conflicts): Undo never reaches back past the latest Fill.
    if (!extend) {
      undoRef.current = null;
      if (undoTimer.current) clearTimeout(undoTimer.current);
      setCanUndo(false);
    }
    if (!all.length) return;
    const prev = extend ? undoRef.current : null;
    undoRef.current = {
      restores: [...(prev?.restores ?? []), ...all],
      aiPrev: { ...aiPrev, ...(prev?.aiPrev ?? {}) },
    };
    setCanUndo(true);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => {
      undoRef.current = null;
      setCanUndo(false);
    }, UNDO_MS);
  };
  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, []);

  const undoFill = () => {
    const snap = undoRef.current;
    if (!snap) return;
    // Latest first, so a field changed twice ends on its earliest value.
    [...snap.restores].reverse().forEach((r) => r());
    for (const [k, v] of Object.entries(snap.aiPrev) as [FillKey, string | undefined][]) {
      if (v === undefined) delete aiWrittenRef.current[k];
      else aiWrittenRef.current[k] = v;
    }
    undoRef.current = null;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setCanUndo(false);
    setPendingFill(null);
    setFillView(null);
    setNlReply('');
    toast.info(t(nlLang, 'undone'));
  };

  const submitNL = async (
    text: string,
    voice: { detectedLanguage?: string | null; alternateText?: string | null } = {},
  ) => {
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
        voice,
      );

      // Carry the entity conversation forward: without this the backend's
      // "that client doesn't exist — create it?" question can never be
      // answered, and replying just sends a fresh contextless message.
      const nextPending = pick(res, ['pending_entity']) ?? null;
      setPendingEntity(nextPending);
      const declined = str(pick(res, ['declined_entity']));
      if (declined) setDeclinedEntities((prev) => [...prev, declined.toLowerCase()]);
      setNlHistory((prev) => [
        ...prev,
        { role: 'user' as const, content: message },
        { role: 'assistant' as const, content: str(pick(res, ['reply'])) },
      ]);

      const r = readChatResult(res);
      const ex = r.extracted;
      const lang = r.language ? uiLangOf(r.language) : voice.detectedLanguage ? uiLangOf(voice.detectedLanguage) : nlLang;
      setNlLang(lang);

      // Places first: two spellings of one place compare by where they land.
      const [pickLoc, delLoc, stopLocs] = await Promise.all([
        ex.pickupLocation ? geocodeFirst(ex.pickupLocation) : Promise.resolve(null),
        ex.deliveryLocation ? geocodeFirst(ex.deliveryLocation) : Promise.resolve(null),
        Promise.all((ex.stops ?? []).map((q) => geocodeFirst(q))),
      ]);
      const locs: Partial<Record<FillKey, Loc>> = {};
      const proposed: Partial<Record<FillKey, FieldVal>> = {};
      // The field gets the geocodable name (Cape Town); the chip says what was said (Kaapstad).
      const locVal = (l: Loc, said?: string): FieldVal => ({
        value: l.label,
        display: said || placeShort(l.label),
        lat: l.lat,
        lon: l.lon,
      });
      if (pickLoc) {
        locs.pickup = pickLoc;
        proposed.pickup = locVal(pickLoc, r.spokenPlaces.pickup);
      }
      if (delLoc) {
        locs.delivery = delLoc;
        proposed.delivery = locVal(delLoc, r.spokenPlaces.delivery);
      }
      if (ex.weightTons != null)
        proposed.weight = { value: plainNumber(ex.weightTons), display: tonsLabel(ex.weightTons) };
      if (ex.cargo) proposed.cargo = { value: ex.cargo, display: ex.cargo };
      if (ex.vehicleType) {
        const name = resolveVehicleTypeName(ex.vehicleType) ?? ex.vehicleType;
        proposed.vehicle = { value: name, display: name };
      }
      if (ex.customerId)
        proposed.client = {
          value: ex.customerId,
          display:
            customerOptions.find((o) => o.value === ex.customerId)?.label ?? ex.customerName ?? '',
        };
      if (ex.pickupDate) proposed.pickupDate = { value: ex.pickupDate, display: shortDate(ex.pickupDate, lang) };
      if (ex.deliveryDate)
        proposed.deliveryDate = { value: ex.deliveryDate, display: shortDate(ex.deliveryDate, lang) };
      if (ex.validUntil) proposed.validUntil = { value: ex.validUntil, display: shortDate(ex.validUntil, lang) };
      if (ex.tripType)
        proposed.tripType = {
          value: ex.tripType,
          display: ex.tripType === 'ROUND_TRIP' ? t(lang, 'round_trip') : t(lang, 'one_way'),
        };
      // A booked return load only means something on a one-way trip.
      if (ex.returnLoadBooked != null && (ex.tripType ?? tripType) === 'ONE_WAY')
        proposed.returnLoad = {
          value: ex.returnLoadBooked ? 'yes' : 'no',
          display: ex.returnLoadBooked ? (lang === 'af' ? 'Gelaai' : 'Loaded') : lang === 'af' ? 'Leeg' : 'Empty',
        };
      if (ex.abnormalLoad != null)
        proposed.abnormal = {
          value: ex.abnormalLoad ? 'yes' : 'no',
          display: ex.abnormalLoad ? (lang === 'af' ? 'Ja' : 'Yes') : lang === 'af' ? 'Nee' : 'No',
        };

      const plan = planFill({
        proposed,
        current: fillCurrent(lang),
        aiWritten: aiWrittenRef.current,
        defaults: {
          pickupDate: fillDefaultsRef.current.pickupDate || undefined,
          validUntil: fillDefaultsRef.current.validUntil,
          // Delivery follows the driving days until someone sets it.
          ...(deliveryTouchedRef.current ? {} : { deliveryDate }),
          tripType: 'ONE_WAY',
          returnLoad: 'no',
          abnormal: 'no',
        },
        confidence: r.confidence,
      });

      // Stops are only ever added, never replace what the person entered.
      const have = [pickup, delivery, pickLoc, delLoc, ...stops.map((st) => st.loc)].filter(
        (l): l is Loc => !!l,
      );
      const near = (a: Loc, b: Loc) => Math.abs(a.lat - b.lat) < 0.01 && Math.abs(a.lon - b.lon) < 0.01;
      const newStops: StopEntry[] = [];
      for (const l of stopLocs) {
        if (!l || have.some((h) => near(h, l))) continue;
        have.push(l);
        newStops.push({ id: `stop-${++stopSeq.current}`, loc: l });
      }
      const extraRestores: (() => void)[] = [];
      if (newStops.length) {
        const ids = new Set(newStops.map((st) => st.id));
        setStops((prev) => [...prev, ...newStops]);
        extraRestores.push(() => setStops((prev) => prev.filter((st) => !ids.has(st.id))));
      }
      if (ex.international != null || ex.borderPost) {
        const prevBorder = aiBorder;
        setAiBorder({ international: ex.international, borderPost: ex.borderPost });
        extraRestores.push(() => setAiBorder(prevBorder));
      }

      commitFill(plan.apply, locs, extraRestores);
      setPendingFill(plan.conflicts.length ? { plan, locs } : null);
      setFillView({
        applied: plan.apply,
        stops: newStops.map((st) => st.loc!.label),
        stopsLow: isLow('stops', r.confidence),
        notUnderstood: r.notUnderstood,
        vehicleHint: r.vehicleHint && !ex.vehicleType && !nextPending ? r.vehicleHint : null,
        vehicleHintLabel: r.vehicleHintLabel,
        driverNights: ex.driverNights ?? null,
        fuelPrice: ex.fuelPriceOverride ?? null,
        borderPost: ex.borderPost ?? null,
        international: ex.international ?? null,
        stated: plan.unchanged,
      });

      nlBarRef.current?.setText('');
      const reply = r.reply || t(lang, 'filled_default');
      setNlReply(reply);
      // Said once, for a screen reader; the bar's note is a polite live region too.
      AccessibilityInfo.announceForAccessibility(reply);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not parse');
    } finally {
      setNlBusy(false);
    }
  };

  // Replace / Keep mine on the fields the person had typed.
  const resolvePendingFill = (choice: 'replace' | 'keep') => {
    const p = pendingFill;
    setPendingFill(null);
    if (p && choice === 'replace') {
      commitFill(p.plan.conflicts, p.locs, [], true);
      setFillView((v) => (v ? { ...v, applied: [...v.applied, ...p.plan.conflicts] } : v));
    }
    setTimeout(() => nlBarRef.current?.focusA11y(), 100);
  };

  const fillChips = useMemo<FillChip[]>(
    () =>
      fillView
        ? buildChips(fillView.applied, nlLang, {
            stops: fillView.stops,
            stopsLow: fillView.stopsLow,
            borderPost: fillView.borderPost ?? undefined,
            international: fillView.international ?? undefined,
            zimbabwe: routeCrossesZimbabwe,
            stated: fillView.stated,
          })
        : [],
    [fillView, nlLang, routeCrossesZimbabwe],
  );
  // Fields the last Fill was unsure about: "Check this" under each.
  const lowFields = useMemo(
    () => new Set<FillKey>((fillView?.applied ?? []).filter((c) => c.low).map((c) => c.key)),
    [fillView],
  );

  // Driver nights and a diesel price change the price basis: offered, never applied silently.
  const fillSuggestions: FillSuggestion[] = [];
  if (fillView?.driverNights && fillView.driverNights !== spokenNights) {
    const nights = fillView.driverNights;
    fillSuggestions.push({
      id: 'nights',
      label: nightsLabel(nights, nlLang),
      onPress: () => {
        // Nights, not an amount: the driver line becomes allowance × nights.
        setSpokenNights(nights);
        setFillView((v) => (v ? { ...v, driverNights: null } : v));
      },
    });
  }
  if (fillView?.fuelPrice) {
    const price = fillView.fuelPrice;
    fillSuggestions.push({
      id: 'fuel',
      label: dieselLabel(price, costs.fuelType, nlLang),
      onPress: () => {
        setQuoteFuel({ pricePerL: price, fuelType: costs.fuelType });
        setFillView((v) => (v ? { ...v, fuelPrice: null } : v));
      },
    });
  }

  const onFillChipPress = (chip: FillChip) => {
    const section: SectionId =
      chip.group === 'load' || chip.group === 'truck'
        ? 'load'
        : chip.group === 'client'
          ? 'client'
          : chip.group === 'dates'
            ? 'schedule'
            : 'route';
    jumpTo(section);
    // Text fields take keyboard focus; the rest take the screen reader's.
    const first: FillKey | undefined =
      chip.group === 'trip' || chip.group === 'border'
        ? 'tripType'
        : (chip.keys[0] ?? (chip.group === 'route' ? 'pickup' : undefined));
    setTimeout(() => {
      if (first === 'weight') return weightInputRef.current?.focus();
      if (first === 'cargo') return cargoInputRef.current?.focus();
      const box = first ? fieldRefs.current[first] : null;
      if (box) AccessibilityInfo.sendAccessibilityEvent(box, 'focus');
    }, 350);
  };

  const onVoiceCaptured = async (uri: string, language: VoiceLangPref = 'auto') => {
    setVoiceOpen(false);
    setVoiceBusy(true);
    AccessibilityInfo.announceForAccessibility(t(nlLang, 'reading'));
    try {
      const res = await aiVoiceQuote(
        { uri, name: 'quote.m4a', type: 'audio/m4a' },
        language === 'auto' ? undefined : language,
      );
      const v = readVoiceResult(res);
      const lang = v.detectedLanguage ? uiLangOf(v.detectedLanguage) : nlLang;
      if (!v.text) {
        toast.error(t(lang, 'no_speech'));
        return;
      }
      setNlLang(lang);
      nlBarRef.current?.setText(v.text);
      setHeard(heardBadge(v, lang));
      await submitNL(v.text, { detectedLanguage: v.detectedLanguage, alternateText: v.alternateText });
    } catch (e) {
      const status = (e as { status?: number }).status;
      toast.error(voiceErrorText(status, e instanceof Error ? e.message : '', nlLang));
    } finally {
      setVoiceBusy(false);
    }
  };

  // ── Market price check ───────────────────────────────────────────────────
  // True only for a route calculated for the CURRENT inputs: never a paid check
  // on a route that belongs to the previous ones (the stub an edited quote starts
  // with does not count either).
  const routeIsCurrent =
    !!routeData &&
    !routeBusy &&
    routeCalcKey === routeKeyOf(pickup, delivery, stops, pricedTruckName, weightKg);
  const pc = usePriceCheck({
    active:
      ready &&
      !routeBlockedMessage &&
      !weightBlockedMessage &&
      // Never a market check on an unknown cost (tolls, diesel, distance).
      !costs.blocked &&
      costs.total > 0 &&
      !(demo.quotaExceeded && !savedId.current),
    routeReady: routeIsCurrent,
    routeError: ready && !routeBusy && !routeData && !routeBlockedMessage,
    routeData,
    route: currentRoute,
    total: costs.total,
    chargeDistance: costs.chargeDistance,
    oneWayDistance: costs.distance,
    legs: costs.legs,
    tripType,
    durationMinutes: costs.duration || null,
    origin: pickup?.label ?? '',
    destination: delivery?.label ?? '',
    vehicleType: pricedTruckName,
    weightKg,
    customerId: customerId || null,
    costFloor: costs.floor,
    emptyReturnIncluded: costs.emptyReturnIncluded,
    costingPayload,
    fuelCost: costs.fuelCost,
    fuelLitres: costs.fuelLitres,
    fuelConsumption: costs.consumption,
    fuelPricePerL: costs.fuelPrice,
    fuelType: costs.fuelType,
    fuelZone: costs.fuelZone,
    tollCost: costs.tollCost,
    driverAllowance: costs.driver,
    crossBorderCost: costs.crossBorderCost,
    baseRatePerKm: effectiveRateNum,
    pickupDate: pickupDate || null,
    marketAvgRate: num(pick(benchmark ?? {}, ['market_avg_rate'])),
    billingBlocked: subscription.blocked,
    quoteId: savedId.current ?? editId ?? null,
  });

  const aiInputsNow = (): AiInputs => ({
    aiFuel,
    aiToll,
    tollOverride,
    tollEdited,
    driverAllowance,
    driverEdited,
    baseRatePerKm,
    serviceCharge,
  });

  // Applies the market price check by writing the chosen figures into the real
  // cost inputs (fuel price, tolls, driver, R/km), so the quote total becomes
  // exactly the price the check showed. Items kept as "mine" get the figure the
  // check saw as yours. Nothing goes into the hidden service charge. The first
  // Apply snapshots every input it touches; Undo restores that snapshot.
  const applyMarket = (review: Review, key: string) => {
    const combo = review.combinations?.[key];
    const items = review.cost_breakdown;
    if (!combo || !items) return;
    const current = aiInputsNow();
    // A field the person changed since the last Apply is theirs now: that value,
    // not the older one, is what Undo must put back.
    const prev = preAiRef.current;
    const keep = (...keys: (keyof AiInputs)[]) =>
      !!prev && keys.every((k) => sameValue(current[k], prev.applied[k]));
    const before: AiInputs = !prev
      ? current
      : {
          aiFuel: keep('aiFuel') ? prev.before.aiFuel : current.aiFuel,
          ...(keep('aiToll', 'tollOverride', 'tollEdited')
            ? {
                aiToll: prev.before.aiToll,
                tollOverride: prev.before.tollOverride,
                tollEdited: prev.before.tollEdited,
              }
            : {
                aiToll: current.aiToll,
                tollOverride: current.tollOverride,
                tollEdited: current.tollEdited,
              }),
          ...(keep('driverAllowance', 'driverEdited')
            ? { driverAllowance: prev.before.driverAllowance, driverEdited: prev.before.driverEdited }
            : { driverAllowance: current.driverAllowance, driverEdited: current.driverEdited }),
          baseRatePerKm: keep('baseRatePerKm') ? prev.before.baseRatePerKm : current.baseRatePerKm,
          serviceCharge: keep('serviceCharge') ? prev.before.serviceCharge : current.serviceCharge,
        };
    const pickAi = (t: ItemKey) => combo.choices[t] === 'ai';

    const fuelRate = Number(
      pickAi('fuel')
        ? items.fuel.detail?.market_price_per_litre
        : items.fuel.detail?.your_price_per_litre,
    );
    const rateDetail = Number(
      pickAi('base_rate')
        ? items.base_rate.detail?.ai_rate_per_km
        : items.base_rate.detail?.your_rate_per_km,
    );
    const rate =
      Number.isFinite(rateDetail) && rateDetail > 0 ? rateDetail : combo.base_rate_per_km;
    const next: AiInputs = {
      ...current,
      aiFuel:
        fuelRate > 0 && Math.abs(fuelRate - costs.fuelCompanyPrice) > 1e-9
          ? { pricePerL: fuelRate, fuelType: costs.fuelType }
          : null,
      // Unchanged driver figure: leave the suggestion in charge.
      ...(Math.abs(combo.values.driver_allowance - costs.driver) < 0.005
        ? { driverAllowance: current.driverAllowance, driverEdited: current.driverEdited }
        : { driverAllowance: formatPlain(combo.values.driver_allowance), driverEdited: true }),
      baseRatePerKm: formatPlain(rate),
      serviceCharge: 0,
    };
    if (pickAi('tolls')) {
      const oneWay =
        Number(items.tolls.detail?.market_one_way_zar) || combo.values.tolls / costs.legs;
      Object.assign(next, {
        aiToll: { oneWay, routeKey: tollRouteKey },
        tollEdited: false,
        tollOverride: '',
      });
    } else if (Math.abs(combo.values.tolls - costs.tollCost) >= 0.005) {
      // Back to the figure the check saw as yours: the route's own tolls, or the
      // amount that was typed in.
      Object.assign(
        next,
        Math.abs(combo.values.tolls - costs.tollCalculated) < 0.005
          ? { aiToll: null, tollEdited: false, tollOverride: '' }
          : { tollOverride: formatPlain(combo.values.tolls), tollEdited: true },
      );
    }
    setAiFuel(next.aiFuel);
    setAiToll(next.aiToll);
    setTollOverride(next.tollOverride);
    setTollEdited(next.tollEdited);
    setDriverAllowance(next.driverAllowance);
    setDriverEdited(next.driverEdited);
    setBaseRatePerKm(next.baseRatePerKm);
    setUseDefaultPrice(false);
    setServiceCharge(next.serviceCharge);
    preAiRef.current = { before, applied: next };
    setAiApplied({
      logId: review.usage_log_id ?? null,
      key,
      winProbability: combo.win_probability ?? null,
    });
  };

  // Restores each field only if it still holds what Apply wrote: anything
  // changed since (e.g. a new vehicle's rate) is the person's and is kept.
  // Returns whether it had to keep a field the person changed since.
  const restoreMarket = (): boolean => {
    const snap = preAiRef.current;
    let keptSome = false;
    if (snap) {
      const { before, applied } = snap;
      if (sameValue(aiFuel, applied.aiFuel)) setAiFuel(before.aiFuel);
      else keptSome = true;
      if (
        sameValue(
          [aiToll, tollOverride, tollEdited],
          [applied.aiToll, applied.tollOverride, applied.tollEdited],
        )
      ) {
        setAiToll(before.aiToll);
        setTollOverride(before.tollOverride);
        setTollEdited(before.tollEdited);
      } else keptSome = true;
      if (driverAllowance === applied.driverAllowance && driverEdited === applied.driverEdited) {
        setDriverAllowance(before.driverAllowance);
        setDriverEdited(before.driverEdited);
      } else keptSome = true;
      if (baseRatePerKm === applied.baseRatePerKm) setBaseRatePerKm(before.baseRatePerKm);
      else keptSome = true;
      if (serviceCharge === applied.serviceCharge) setServiceCharge(before.serviceCharge);
    }
    preAiRef.current = null;
    setAiApplied(null);
    return keptSome;
  };

  const undoMarket = () => {
    const keptSome = restoreMarket();
    toast.info(keptSome ? 'Market undone. Your later edits kept.' : 'Back to your figures');
  };

  // A tap on one item's Mine / Market switch in the price check: the quote moves
  // to that combination straight away. Back on all "mine" is a restore, so the
  // fields get exactly what they held before the first Apply.
  const chooseMarket = (t: ItemKey, c: Choice) => {
    const review = pc.review;
    if (!review) return;
    const key = pc.keyWith(t, c);
    if (!key.includes('=ai')) {
      if (preAiRef.current) restoreMarket();
      return;
    }
    applyMarket(review, key);
  };

  // serviceCharge is only ever written by this / the market price check's Apply
  // / the form reset, so zeroing it drops the total back to true cost.
  //
  // Named without a "use" prefix (it was "useActualPrice") — resetAllOverrides
  // below calls it directly, and eslint's react-hooks/rules-of-hooks treats
  // any called `useXxx` identifier as a hook regardless of what it actually
  // is, which flagged this as a hook invoked from a plain function.
  const resetPriceToActual = () => {
    setServiceCharge(0);
    setAdjustmentSource(null);
  };

  // ── Cost overrides: a way back to the worked-out figure ──────────────────
  const companyDefaultRate = num(pick(company ?? {}, ['default_base_rate_per_km']));
  // The truck's own rate wins over the company default, as on selection.
  const selectedVtRate = Number((vtypes ?? []).find((v) => v.name === pricedTruckName)?.base_rate) || 0;
  // Where the Rate/km figure came from, for the haulage breakdown.
  const rateSource: string | null = !(baseRateNum > 0)
    ? null
    : selectedVtRate > 0 && baseRateNum === selectedVtRate
      ? 'truck'
      : companyDefaultRate > 0 && baseRateNum === companyDefaultRate
        ? 'company default'
        : 'yours';
  const resetTollToCalculated = () => {
    setTollEdited(false);
    setTollOverride('');
  };
  const backToSuggestedDriver = () => {
    setDriverEdited(false);
    setDriverAllowance('');
  };

  // ── Reopening a saved quote (§11) ────────────────────────────────────────
  // The saved price is kept: the difference between it and today's price lines
  // goes into the adjustment, so nothing changes silently. If the costs moved
  // since it was priced, one notice offers Keep price / Re-price (keeps margin).
  useEffect(() => {
    if (!editing || !hydrated || reopen.state !== 'init' || !routeIsCurrent || !fuelAlertDone) return;
    const saved = savedPricingRef.current;
    if (!saved || !(saved.total > 0)) {
      setReopen({ state: 'done' });
      return;
    }
    const adjust = Math.round((saved.total - costs.directCost) * 100) / 100;
    if (Math.abs(adjust) >= 0.01) {
      setServiceCharge(adjust);
      setAdjustmentSource('saved');
    }
    const earlierPeriod = pricedInEarlierPeriod(saved.pricedAt);
    // What the costs were then: the saved floor, else (older quotes) today's
    // floor less the diesel change on the saved litres.
    const floorThen =
      saved.floor !== null
        ? saved.floor
        : costs.floor !== null && saved.fuelLitres && saved.fuelPrice && costs.fuelPrice
          ? costs.floor - saved.fuelLitres * (costs.fuelPrice - saved.fuelPrice)
          : costs.floor !== null && fuelAlert && Number.isFinite(Number(fuelAlert.estimated_cost_impact))
            ? costs.floor - Number(fuelAlert.estimated_cost_impact)
            : null;
    const change = changesSincePriced(saved.total, floorThen, costs.floor, saved.pricedAt);
    setReopen(change.changed ? { state: 'notice', change } : { state: 'kept', earlierPeriod });
    // Runs once, on the first current route after hydrating.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, hydrated, reopen.state, routeIsCurrent, fuelAlertDone]);

  // Port of the backend's changes_since_priced (golden reopen cases).
  const reopenWarning = useMemo<QuoteWarning | null>(() => {
    if (reopen.state !== 'notice' || !reopen.change.notice) return null;
    const [title, detail] = reopen.change.notice.split(/(?<=\.) /);
    return {
      code: 'costs_changed',
      severity: 'warn',
      title: (title ?? '').replace(/\.$/, ''),
      detail: detail ?? '',
      impact_zar: reopen.change.delta_zar,
      actions: [...reopen.change.actions].reverse(),
    };
  }, [reopen]);

  const repriceKeepingMargin = () => {
    if (reopen.state !== 'notice') return;
    const price = reopen.change.repriced_price_keep_margin;
    if (price === null) return;
    setServiceCharge(Math.round((price - costs.directCost) * 100) / 100);
    setAdjustmentSource(null);
    setReopen({ state: 'done' });
  };

  // "Try again" on a stale or missing fuel price: re-check it, then reprice.
  const retryFuel = () => {
    refreshFuelPrices()
      .then((r) => {
        // The server's own words ("Checked: no newer price yet", …).
        if (r.message) (r.ok ? toast.info : toast.error)(r.message);
      })
      .catch(() => toast.error("Couldn't check the fuel price"))
      .finally(() => {
        void qc.invalidateQueries({ queryKey: ['fuel-prices'] });
        void qc.invalidateQueries({ queryKey: ['company-profile'] });
      });
  };

  // ── Warning actions (§10) ────────────────────────────────────────────────
  const onWarningAction = (id: string, w: QuoteWarning) => {
    switch (id) {
      case 'use_official':
        setUseOfficialDiesel(true);
        setAiFuel(null);
        setQuoteFuel(null);
        break;
      case 'use_own':
        setUseOfficialDiesel(false);
        setAiFuel(null);
        setQuoteFuel(null);
        break;
      case 'use_target': {
        // The price at the company target margin, as an adjustment the person
        // can see and undo; their rate per km is left alone.
        const tp = costs.targetPrice;
        if (tp !== null) {
          setServiceCharge(Math.round((tp - costs.directCost) * 100) / 100);
          setAdjustmentSource('target');
        }
        break;
      }
      case 'update_own':
      case 'update_allowance':
        navigation.navigate('Settings', { section: 'company' });
        break;
      case 'retry_diesel':
        retryFuel();
        break;
      case 'choose_vehicle':
      case 'enter_weight':
        jumpTo('load');
        break;
      case 'add_vehicle':
        navigation.navigate('AddVehicleType');
        break;
      case 'edit_vehicle': {
        const vt = (vtypes ?? []).find((v) => v.name === pricedTruckName);
        navigation.navigate('AddVehicleType', vt ? { id: vt.id } : undefined);
        break;
      }
      case 'enter_tolls':
        setTollEdited(true);
        setTollOverride('');
        setTollModal(true);
        break;
      case 'confirm_no_tolls':
        setTollsConfirmedNone(true);
        break;
      case 'recalculate_route':
        setRouteNonce((n) => n + 1);
        break;
      case 'enter_border_costs':
        setBorderModal(true);
        break;
      case 'confirm_distance':
        setDistanceConfirmed(true);
        break;
      case 'enter_route':
        jumpTo('route');
        break;
      case 'enter_driver_cost':
        setDriverEdited(true);
        setDriverModal(true);
        break;
      case 'use_target_rate':
        if (tonnage?.target_rate_per_tonne != null) setRatePerTonne(String(tonnage.target_rate_per_tonne));
        break;
      case 'use_minimum': {
        if (perTonne) {
          if (tonnage?.minimum_charge_rate_per_tonne != null) setRatePerTonne(String(tonnage.minimum_charge_rate_per_tonne));
          break;
        }
        const min = costs.costing.minimum_charge;
        if (min !== null) {
          setServiceCharge((sc) => Math.round((sc + (min - costs.total)) * 100) / 100);
          setAdjustmentSource('minimum');
        }
        break;
      }
      case 'reprice':
        repriceKeepingMargin();
        break;
      case 'keep_price':
        if (reopen.state === 'notice')
          setReopen({ state: 'kept', earlierPeriod: pricedInEarlierPeriod(savedPricingRef.current?.pricedAt) });
        break;
      default:
        if (w.severity === 'block') jumpTo('price');
    }
  };

  // What the Price section shows: the rules' warnings once there's something
  // to price, plus the reopen notice.
  // A diesel price given for this quote: named on the fuel line, and the usual
  // own-vs-official check (rules.ts runs it for the company's own price only).
  const quoteFuelOn = quoteFuelPrice != null && costs.fuelSource === 'override' && !costs.fuelFromMarketCheck;
  const quoteFuelLabel = quoteFuelOn
    ? `Your ${costs.fuelType.toLowerCase()} price for this quote ${formatCurrency(quoteFuelPrice, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/L`
    : null;
  const quoteFuelWarning = useMemo<QuoteWarning | null>(() => {
    if (!quoteFuelOn || quoteFuelPrice == null) return null;
    const official = costs.diesel.official_price;
    if (!official || Math.abs(quoteFuelPrice - official) / official <= 0.03) return null;
    const r2 = (n: number) => formatCurrency(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const zone = costs.fuelZone === 'COASTAL' ? 'coastal' : 'inland';
    return {
      code: 'diesel_quote_off',
      severity: 'warn',
      title: `Your ${costs.fuelType.toLowerCase()} price differs from official`,
      detail: `Yours ${r2(quoteFuelPrice)}/L, official ${r2(official)}/L (${zone}).`,
      impact_zar:
        costs.fuelLitresTotal > 0
          ? Math.round((quoteFuelPrice - official) * costs.fuelLitresTotal * 100) / 100
          : null,
      actions: [{ id: 'use_official', label: ACTION_LABELS.use_official ?? 'Use official price' }],
    };
  }, [quoteFuelOn, quoteFuelPrice, costs.diesel.official_price, costs.fuelType, costs.fuelZone, costs.fuelLitresTotal]);

  const visibleWarnings = useMemo<QuoteWarning[]>(() => {
    if (!ready || routeBlockedMessage || !vtypes) return [];
    // Stale diesel and a missing allowance rate sit on their own cost lines.
    const onLines = ['diesel_stale', 'driver_allowance_missing'];
    const base = perTonne
      ? // A rate under cost leads the list (after any block): impossible to miss.
        [...(tonnageView?.warnings ?? [])]
          .filter((w) => w.code !== 'load_missing')
          .sort((a, b) => Number(b.code === 'rate_below_cost') - Number(a.code === 'rate_below_cost'))
      : costs.warnings;
    const list = routeBusy && !routeData ? [] : base.filter((w) => !onLines.includes(w.code));
    if (quoteFuelWarning) list.unshift(quoteFuelWarning);
    return reopenWarning ? [reopenWarning, ...list] : list;
  }, [ready, routeBlockedMessage, vtypes, routeBusy, routeData, costs.warnings, reopenWarning, quoteFuelWarning, perTonne, tonnageView?.warnings]);
  const firstBlock = visibleWarnings.find((w) => w.severity === 'block') ?? null;

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
        pickup,
        delivery,
        weightInvalid,
        weightTooLarge,
        weightKg,
        pickupDate,
        deliveryDate,
      }),
    [
      subscription.blocked,
      subscription.notice,
      customerId,
      routeBlockedMessage,
      pickup,
      delivery,
      weightInvalid,
      weightTooLarge,
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
    // (weight, dates) aren't required for a draft, so flagging them here
    // would be misleading.
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
      { id: 'client', label: 'Client', complete: !!customerId },
      { id: 'route', label: 'Route', complete: !!(pickup?.lat && delivery?.lat) },
      { id: 'load', label: 'Load', complete: weightKg > 0 && !weightInvalid },
      { id: 'schedule', label: 'Schedule', complete: !!(pickupDate && deliveryDate) },
      { id: 'price', label: 'Price', complete: costs.total > 0 },
    ];
    return base.map((s) => ({ ...s, hasIssue: issueSections?.has(s.id) }));
  }, [
    customerId,
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
  // How this quote's fuel and toll figures were arrived at, saved with it so an
  // applied market figure survives a reload. Merged into whatever is already
  // stored (a PATCH replaces the field wholesale, and the web keeps the raw
  // route request and response in it). Only for a route calculated for these
  // inputs. The stored copy is slimmed first: the API caps the field at 200 KB
  // and a web-made quote can carry every route's full map path.
  const existingSnapshot = pick(existing ?? {}, ['route_snapshot']);
  const routeSnapshot: Record<string, unknown> | null = routeIsCurrent
    ? (() => {
        const base =
          existingSnapshot &&
          typeof existingSnapshot === 'object' &&
          !Array.isArray(existingSnapshot)
            ? compactStoredSnapshot(existingSnapshot as Record<string, unknown>)
            : {};
        // The previous market toll figure no longer applies unless set again below.
        delete base.ai_toll_one_way;
        delete base.ai_toll_route_key;
        return {
          ...base,
          selected_route_index: selectedRouteIndex,
          fuel_price_per_litre_used: costs.fuelPrice,
          fuel_type_used: costs.fuelType,
          fuel_price_source: costs.fuelFromMarketCheck ? 'market_check' : costs.fuelSource,
          // What the builder needs to reopen this quote as it was priced (§11).
          cost_floor: costs.floor,
          fuel_litres: costs.fuelLitresTotal,
          driver_source: driverEdited ? 'user' : 'suggested',
          return_load_booked: returnLoadBooked,
          tolls_confirmed_none: tollsConfirmedNone,
          distance_confirmed: distanceConfirmed,
          use_official: useOfficialDiesel,
          costing_version: costs.costing.version,
          toll_charges_source: tollEdited
            ? 'manual'
            : costs.tollFromMarketCheck
              ? 'market_check'
              : 'route',
          ...(costs.tollFromMarketCheck && aiToll && !tollEdited
            ? { ai_toll_one_way: aiToll.oneWay, ai_toll_route_key: aiToll.routeKey }
            : {}),
          ai_price_analysis: aiApplied
            ? { log_id: aiApplied.logId, choice_key: aiApplied.key }
            : null,
        };
      })()
    : null;

  // The trip leaves South Africa: the route crossed a border or names a foreign
  // country, or the pickup, delivery or a stop is outside SA. Known only once a
  // calculated route or a point's country is in hand (an edited quote's route is
  // a stub until recalculated), else the saved quote keeps whatever it had.
  const international = (() => {
    const pointCodes = [pickup?.cc, delivery?.cc, ...stops.map((s) => s.loc?.cc)];
    const hasRouteFlags = routeData != null && ('cross_border' in routeData || 'countries' in routeData);
    const value =
      !!pick(routeData ?? {}, ['cross_border']) ||
      asArray<string>(pick(routeData ?? {}, ['countries'])).some((c) => isForeignCc(c)) ||
      pointCodes.some((c) => isForeignCc(c));
    return { known: hasRouteFlags || pointCodes.some(Boolean), value };
  })();

  const existingInternational = pick(existing ?? {}, ['is_international']) === true;

  // What the saved quote's own fields don't say, for the backend's costing and
  // send check (quote_costing COSTING_INPUT_KEYS; nulls are left out).
  const costingInputs = (() => {
    const out: Record<string, number | boolean | object> = {
      distance_estimated: costs.distanceEstimated,
      distance_confirmed: distanceConfirmed,
      tolls_unknown: !costs.tollKnown,
      tolls_confirmed_none: tollsConfirmedNone,
      use_official_fuel: useOfficialDiesel,
      // The saved driver figure is the person's only when they typed it.
      driver_cost_is_override: driverEdited,
    };
    // A typed border figure is saved even at R 0, so a reopen restores it.
    if (costs.crossBorderCost > 0 || costs.costingInputs.border_cost_is_override) out.border_cost = costs.crossBorderCost;
    if (costs.costingInputs.border_cost_is_override) out.border_cost_is_override = true;
    // The way home and border figures the route gave, so the backend re-prices
    // the saved quote the same way (newer backends keep them).
    for (const [k, v] of Object.entries(costs.savedCostingExtras)) if (v != null && v >= 0) out[k] = v;
    if (abnormalLoad) out.abnormal_load = true;
    if (spokenNights != null) out.driver_nights = spokenNights;
    // Saved so the send check knows which border costs aren't on file.
    if (costs.costingInputs.border_costs_unknown) out.border_costs_unknown = costs.costingInputs.border_costs_unknown;
    if (returnLoadBooked) out.include_empty_return = false;
    const override = costs.costingInputs.diesel?.override_price;
    if (override != null && override > 0) out.fuel_price_override = override;
    if (costs.truckId != null && Number.isFinite(Number(costs.truckId))) out.vehicle_type_id = Number(costs.truckId);
    if (costs.duration > 0) out.duration_minutes = costs.duration;
    const oneWay = costs.costingInputs.tolls?.one_way;
    if (costs.tollKnown && oneWay != null && oneWay >= 0) out.toll_cost_one_way = oneWay;
    return out;
  })();

  const buildPayload = (status: 'DRAFT' | 'SENT') => {
    const base = buildBasePayload(status);
    if (!perTonne) return { ...base, pricing_basis: 'per_load' };
    // Rate per tonne: the server re-prices it and sets the total.
    return {
      ...base,
      total_amount: Math.round(tonnageTotal * 100) / 100,
      pricing_basis: 'per_tonne',
      rate_per_tonne: rateToSave,
      tonnes_per_load: weightTons,
      total_tonnes: totalTonnesNum,
      min_tonnes_per_load: minTonnesNum,
      basis_vehicle_type: chosenTruckId != null ? Number(chosenTruckId) : null,
      contract_start: isContract && contractStart ? contractStart : null,
      contract_end: isContract && contractEnd ? contractEnd : null,
    };
  };
  const buildBasePayload = (status: 'DRAFT' | 'SENT') =>
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
        vehicleType: pricedTruckName,
        costs,
        serviceCharge,
        notes,
        company,
        validUntil,
        tripType,
        winProb,
        stops,
        routeGeometry: mapGeometry,
        baseRateNum: effectiveRateNum,
        aiApplied,
        // §9: the pricing snapshot, on every create and update, only for a
        // route worked out for these inputs (never the reopened stub).
        routeSnapshot: routeSnapshot ? { ...routeSnapshot, priced_at: new Date().toISOString() } : null,
        pricing: routeIsCurrent && costs.fuelKnown ? costs : null,
        costingInputs: routeIsCurrent ? costingInputs : null,
        international: international.known ? international.value : null,
      },
      status,
    );

  // Everything that stops a save or send, as a message (null when it can go).
  // Used by save() and, before the preview opens, by Send.
  const precheck = (send: boolean): string | null => {
    if (subscription.blocked) return subscription.notice ?? 'Subscription inactive';
    // Draft can be saved any time (just needs a client to attach to) — except
    // pickup/dropoff, which the backend requires unconditionally (no
    // draft-specific relaxation for pickup_location/delivery_location).
    if (!customerId) return 'Select a client';
    if (!pickup?.lat || !delivery?.lat) return 'Set a collection point and delivery first';
    if (routeBlockedMessage) return routeBlockedMessage;
    if (weightBlockedMessage) return weightBlockedMessage;
    if (perTonne && isContract && totalTonnesNum == null) return "Enter the contract's total tonnes";
    if (perTonne && rateToSave == null) return 'The rate per tonne is still being worked out';
    // Unlike weightInvalid (an unparseable weight quietly sends as 0 and only
    // blocks Send), a too-large-but-valid weight WOULD be sent on a draft
    // save too — Quote.weight is NOT NULL, so it's always in the payload —
    // and would fail there with the backend's digit-count error. Block both.
    if (weightTooLarge) {
      return "That's an unusually large weight. Check the unit is tons";
    }
    // Quote.base_rate/total_amount are both DecimalField(max_digits=10,
    // decimal_places=2). Rate/km × distance, or a typed driver/toll override,
    // has no upper bound of its own — this is the one place that catches all
    // of them at once rather than bounding each input separately.
    const QUOTE_MONEY_MAX = decimalMax(10, 2);
    if (costs.baseCost > QUOTE_MONEY_MAX || costs.total > QUOTE_MONEY_MAX) {
      return 'That price is too large. Check the rate and overrides';
    }
    // A negative driver/toll override isn't just an "unexplained discount"
    // (applyRecommended's own comment on serviceCharge) — it can also drag
    // marginPct (costs.ts) past what Quote.margin_percentage
    // (DecimalField(5,2), max 999.99) can store.
    if (driverNum < 0 || (tollEdited && tollOverrideNum < 0)) {
      return "Driver allowance and tolls can't be negative";
    }
    // Only the initial CREATE consumes the session's one quote — patching an
    // already-created quote (savedId.current set) doesn't hit this again.
    if (demo.quotaExceeded && !savedId.current) return DEMO_QUOTA_MESSAGE;
    if (send) {
      if (!ready) return 'Add a pickup and delivery';
      const missing: string[] = [];
      if (weightInvalid) return 'Weight is not a number';
      if (!(weightKg > 0)) missing.push('weight');
      if (!pickupDate) missing.push('pickup date');
      if (!deliveryDate) missing.push('delivery date');
      if (missing.length) return `Add ${missing.join(', ')} before sending`;
      // Never send on a price that isn't worked out for these inputs, or with
      // a blocking warning open (§11).
      if (!routeIsCurrent) return 'Still working out the route';
      if (firstBlock) return firstBlock.title;
    }
    return null;
  };

  const save = async (send: boolean) => {
    // Fire-and-forget: starts the keyboard closing the instant Save/Send is
    // tapped (footer buttons sit in the sheet's pinned footer, outside the
    // scroll view, so a tap on them never blurs whatever field was focused).
    // Also gets validation toasts below out from behind the keyboard, where
    // they were otherwise invisible.
    void dismissKeyboard();
    if (savingRef.current) return;
    const blocker = precheck(send);
    if (blocker) return toast.error(blocker);
    savingRef.current = true;
    setBusy(send ? 'send' : 'draft');
    try {
      // send_to_customer makes the draft-to-sent transition itself, and that is
      // what emails the customer. So a quote that already exists and is not yet
      // SENT is saved as it is; patching it to SENT first would email twice.
      const alreadySent = lastStatusRef.current === 'SENT';
      const payloadStatus: 'DRAFT' | 'SENT' =
        send && (!savedId.current || alreadySent) ? 'SENT' : 'DRAFT';
      const payload = buildPayload(payloadStatus);
      let id = savedId.current;
      if (id) await patchQuote(id, payload);
      else {
        const created = await createQuote(payload);
        id = pick(created, ['id', 'pk']) as string | number;
        savedId.current = id;
        // Demo's one-quote flag flips server-side on this same 201 — refresh
        // now so a second attempt shows "Demo quota reached" proactively
        // instead of only failing reactively on the next save's 403. Web
        // relies on its tab-focus refetch for this; the app has no
        // equivalent while the user stays on this screen.
        if (demo.isDemo) void useAuthStore.getState().refreshUser();
      }
      lastStatusRef.current = payloadStatus;
      let emailSent = false;
      if (send && id) {
        const res = await sendQuote(id);
        emailSent = !!pick(res, ['email_sent']);
        lastStatusRef.current = 'SENT';
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
      savingRef.current = false;
      setBusy(null);
      setSendPreviewOpen(false);
    }
  };

  // Always points at the save() closure from the latest render, so the
  // footer's memoized onPress handlers (below) never validate against
  // stale form state even when renderFooter itself hasn't re-memoized.
  const saveRef = useRef(save);
  saveRef.current = save;
  const precheckRef = useRef(precheck);
  precheckRef.current = precheck;
  const keptOldPriceRef = useRef(false);
  keptOldPriceRef.current = reopen.state === 'kept' && reopen.earlierPeriod && serviceCharge !== 0;

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
      { text: 'Save as draft', onPress: () => saveRef.current(false) },
      { text: 'Discard', style: 'destructive', dispatch: true },
    ],
  });

  const onSaveDraft = useCallback(() => {
    if (savingRef.current) return;
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
    if (savingRef.current) return;
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
    // Nothing that fails a save may surface only after the person confirmed.
    const blocker = precheckRef.current(true);
    if (blocker) {
      void dismissKeyboard();
      toast.error(blocker);
      return;
    }
    // A reopened quote kept at a price set before this diesel period: say so
    // once before it goes out (§11).
    if (keptOldPriceRef.current) {
      void dismissKeyboard();
      Alert.alert('Priced on older diesel', 'The price was set before the latest diesel change.', [
        { text: 'Review', style: 'cancel', onPress: () => jumpTo('price') },
        { text: 'Send anyway', onPress: () => setSendPreviewOpen(true) },
      ]);
      return;
    }
    // Every message that leaves TruckWys is previewed first; the send happens on
    // the second, explicit tap.
    setSendPreviewOpen(true);
    // jumpTo is []-stable (see its own useCallback above), so this never
    // needs to change identity across renders.
  }, [jumpTo]);

  // What the price bar offers beside the total: run the check, apply the market
  // price, or undo it. Never a number before a check has run.
  const priceOffer = useMemo<FooterOffer | null>(() => {
    if (!ready || costs.total <= 0 || weightBlockedMessage || routeBlockedMessage) return null;
    const o = pc.offer;
    // Market figures already in the quote (all or some): the way back comes first.
    if (aiApplied) return { kind: 'applied', onPress: undoMarket };
    // No market evidence for the lane: nothing to recommend.
    if (pc.noMarket) return null;
    if (o?.needsApply) {
      return {
        kind: 'apply',
        label: `Market ${moneyWhole(o.price)}`,
        onPress: () => applyMarket(o.review, o.key),
      };
    }
    if (o) return { kind: 'same' };
    if (pc.unavailable) return null;
    return { kind: 'prompt', onPress: () => jumpTo('price') };
    // applyMarket/undoMarket read the form at call time; the inputs that decide
    // what to offer are listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ready,
    costs.total,
    weightBlockedMessage,
    routeBlockedMessage,
    pc.offer,
    pc.unavailable,
    pc.noMarket,
    aiApplied,
    jumpTo,
  ]);

  // What the customer will be sent, for the preview. The recipient's email is
  // looked up from the customer record.
  const sendPreviewData: QuotePreviewData = {
    id: savedId.current ?? editId ?? null,
    quote_number: str(pick(existing ?? {}, ['quote_number'])) || null,
    customer_id: customerId || null,
    customer_name: customerOptions.find((o) => o.value === customerId)?.label ?? '',
    pickup_location: pickup?.label ?? '',
    delivery_location: delivery?.label ?? '',
    total_amount: costs.total,
    // VAT as the backend will show the customer (core quote_vat), so this
    // matches the email the save sends. International is zero-rated.
    customer_price: previewQuoteVat({
      totalExcl: costs.total,
      vatRegistered: financeSettings?.vat_registered !== false,
      international: international.known ? international.value : !!existingInternational,
    }),
    valid_until: validUntil || null,
    pickup_date: pickupDate || null,
  };

  // The footer's left half while the quote can't be priced yet. Deliberately
  // generic rather than naming each gap: with up to three possible gaps
  // (client, route, weight) the full list got long and truncated on the
  // strip's single 26px line, and implied one field was the last thing needed
  // right after it was filled. The Price section below still names every gap
  // since it has room to wrap. Kept as two primitives + a callback so
  // QuoteFooterActions stays memo-safe. Hidden until a Save/Send attempt, like
  // the field issues: a blank form on first landing isn't something to flag yet.
  const priceHint = submitAttempted && priceGaps.length ? 'Finish the form to price' : '';
  const priceHintSection = priceGaps[0]?.section ?? null;
  const onPriceHintPress = useCallback(() => {
    if (priceHintSection) jumpTo(priceHintSection);
  }, [priceHintSection, jumpTo]);

  // The Price section's empty state. Unlike the footer strip this can wrap, so
  // it names every gap — and it separates the three cases the one old sentence
  // ("Add a route and load details to see pricing.") lumped together, one of
  // which — load details — isn't even a pricing prerequisite.
  const priceEmptyMessage = useMemo(() => {
    if (priceGaps.length) return `Add ${formatGapList(priceGaps)} to price.`;
    if (routeBlockedMessage) return 'Route not allowed.';
    if (routeBusy) return 'Pricing…';
    return 'No route yet.';
  }, [priceGaps, routeBlockedMessage, routeBusy]);

  // Footer status strip, by precedence: a suspended subscription (not
  // tappable — nothing here fixes it) → a route refused by company policy
  // (tap to review) → a load overloaded for the selected vehicle (tap to
  // review) → outstanding field issues once a Send has been attempted (tap
  // to jump to the first one) → nothing, the resting state.
  const footerStrip = useMemo<FooterStrip | null>(() => {
    if (subscription.blocked) {
      return { tone: 'danger', message: subscription.notice ?? 'Subscription inactive' };
    }
    if (routeBlockedMessage) {
      return { tone: 'danger', message: 'Route not allowed', onPress: () => jumpTo('route') };
    }
    // A blocking warning disables Send; its title is the reason, on show.
    if (firstBlock) {
      return { tone: 'danger', message: firstBlock.title, onPress: () => jumpTo('price') };
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
      // Names the first thing to fix, and how many more.
      message: `${blocking[0]!.message}${blocking.length > 1 ? ` (+${blocking.length - 1})` : ''}`,
      onPress: () => jumpTo(blocking[0]!.section),
    };
  }, [
    subscription.blocked,
    subscription.notice,
    routeBlockedMessage,
    firstBlock,
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
            total={perTonne ? tonnageTotal : costs.total}
            offer={priceOffer}
            ready={ready}
            priceHint={priceHint}
            onPriceHintPress={onPriceHintPress}
            calculating={routeBusy || aiBusy}
            strip={footerStrip}
            busy={busy}
            // Each button also yields to the *other* action's save; its own
            // `loading` already disables it without the grey disabled fill.
            saveDisabled={busy === 'send' || subscription.blocked || !!weightBlockedMessage}
            sendDisabled={
              busy === 'draft' ||
              subscription.blocked ||
              !!routeBlockedMessage ||
              !!firstBlock
            }
            onSaveDraft={onSaveDraft}
            onSend={onSend}
          />
        </QuoteFooterBar>
      </BottomSheetFooter>
    ),
    [
      insets.bottom,
      costs.total,
      perTonne,
      tonnageTotal,
      priceOffer,
      ready,
      priceHint,
      onPriceHintPress,
      routeBusy,
      aiBusy,
      footerStrip,
      busy,
      subscription.blocked,
      routeBlockedMessage,
      weightBlockedMessage,
      firstBlock,
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
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          activeOpacity={0.6}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="h-11 w-11 items-center justify-center rounded-pill bg-backdrop"
        >
          <Icon name="chevronLeft" size={24} color="#FFFFFF" strokeWidth={2.4} />
        </TouchableOpacity>
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
        backgroundStyle={{
          backgroundColor: colors.surface,
          borderRadius: radius.panel,
          borderWidth: 1,
          borderColor: colors.line,
          boxShadow: colors.shadowPop,
        }}
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
            // Pinned footer: 44 strip + 4 + 48 buttons + 12 top + 10 bottom
            // padding + border, plus breathing room.
            paddingBottom: insets.bottom + 144,
            gap: 16,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onScrollEndDrag={handleScrollSettled}
          onMomentumScrollEnd={handleScrollSettled}
        >
          <View className="gap-6">
            {subscription.notice && <Banner tone="danger" message={subscription.notice} />}
            {/* AI voice / natural-language quick fill — stays outside the
            sections below and always at the top; it's the fast path and the
            one thing on this screen that fills several sections at once. */}
            <NaturalLanguageBar
              ref={nlBarRef}
              busy={nlBusy}
              onRecord={() => setVoiceOpen(true)}
              onSubmit={(text) => {
                setHeard(null);
                void submitNL(text);
              }}
              note={nlReply || undefined}
              heard={heard}
              lang={nlLang}
              onTyped={() => {
                if (nlReply) setNlReply('');
                if (heard) setHeard(null);
              }}
            >
              <FillSummary
                lang={nlLang}
                chips={fillChips}
                onChipPress={onFillChipPress}
                didntCatch={didntCatchLine(fillView?.notUnderstood ?? [], nlLang)}
                vehicleHint={
                  fillView?.vehicleHint && !vehicleType ? vehicleHintLabel(fillView.vehicleHint, nlLang, fillView.vehicleHintLabel) : null
                }
                onVehicleHint={() => {
                  jumpTo('load');
                  setTruckPickerReq((n) => n + 1);
                }}
                suggestions={fillSuggestions}
                conflict={pendingFill ? conflictSummary(pendingFill.plan.conflicts, nlLang) : null}
                onReplace={() => resolvePendingFill('replace')}
                onKeep={() => resolvePendingFill('keep')}
                canUndo={canUndo}
                onUndo={undoFill}
              />
            </NaturalLanguageBar>

            {/* Five visible groupings (Phase 2) — still one continuous scroll, no
            accordion, no wizard. QuoteJumpBar above scrolls to each; the
            fields themselves keep the exact props/handlers they had before. */}
            <QuoteSection id="client" label="" onLayout={registerSectionY}>
              <View
                ref={(r) => {
                  fieldRefs.current.client = r;
                }}
              >
              <SelectField
                label="Client"
                icon="user"
                placeholder="Select customer"
                options={customerOptions}
                value={customerId}
                onSelect={setCustomerId}
                error={showIssue('client', false)}
              />
              {lowFields.has('client') && <CheckHint lang={nlLang} />}
              </View>
            </QuoteSection>

            <QuoteSection id="route" label="Route" onLayout={registerSectionY}>
              <View
                ref={(r) => {
                  fieldRefs.current.pickup = r;
                }}
              >
              <LocationField
                label="Collection"
                value={pickup}
                onChange={setPickup}
                placeholder="Search origin"
                onPickOnMap={() => beginPick('pickup')}
                error={showIssue('pickup', false)}
              />
              {lowFields.has('pickup') && <CheckHint lang={nlLang} />}
              </View>

              {/* Stops between Collection and Delivery, in visit order — mirrors the
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
                  onPress={addStop}
                />
              )}

              <View
                ref={(r) => {
                  fieldRefs.current.delivery = r;
                }}
              >
              <LocationField
                label="Delivery"
                value={delivery}
                onChange={setDelivery}
                placeholder="Search destination"
                onPickOnMap={() => beginPick('dropoff')}
                error={showIssue('dropoff', false)}
              />
              {lowFields.has('delivery') && <CheckHint lang={nlLang} />}
              </View>

              {/* Early heads-up the moment a picked location is outside SA, before the
              rest of the form is filled in. The real enforcement happens once
              /route/calculate/ runs — see routeBlockedMessage below. */}
              {!allowCrossBorder && (isForeignCc(pickup?.cc) || isForeignCc(delivery?.cc)) && (
                <Banner tone="warning" message="Outside SA. Cross-border is off in Settings." />
              )}

              <View
                ref={(r) => {
                  fieldRefs.current.tripType = r;
                }}
              >
                <Label className="mb-2 text-muted">Trip</Label>
                <SegmentedControl
                  options={[
                    { label: 'One way', value: 'ONE_WAY' },
                    { label: 'Loaded both ways', value: 'ROUND_TRIP' },
                  ]}
                  value={tripType}
                  onChange={(v) => setTripType(v as 'ONE_WAY' | 'ROUND_TRIP')}
                  tall
                />
                {/* §5: a long one-way trip prices the empty run home unless a
                    return load is booked. Reserved height: no layout jump. */}
                {/* Only where a border schedule depends on it (Zimbabwe). */}
                {routeCrossesZimbabwe && (
                  <View className="mt-3">
                    <Label className="mb-2 text-muted">Abnormal load</Label>
                    <SegmentedControl
                      options={[
                        { label: 'No', value: 'NO' },
                        { label: 'Yes', value: 'YES' },
                      ]}
                      value={abnormalLoad ? 'YES' : 'NO'}
                      onChange={(v) => setAbnormalLoad(v === 'YES')}
                      tall
                    />
                  </View>
                )}
                {tripType === 'ONE_WAY' && costs.emptyReturnEligible && (
                  <View className="mt-3">
                    <Label className="mb-2 text-muted">Truck comes back</Label>
                    <SegmentedControl
                      options={[
                        { label: 'Empty', value: 'EMPTY' },
                        { label: 'Loaded', value: 'LOADED' },
                      ]}
                      value={returnLoadBooked ? 'LOADED' : 'EMPTY'}
                      onChange={(v) => setReturnLoadBooked(v === 'LOADED')}
                      tall
                    />
                    {/* The other answer's price at the target margin. */}
                    {costs.altReturnTargetPrice !== null && (
                      <Mono className="mt-1.5 text-caption text-faint">
                        {returnLoadBooked ? 'Back empty' : 'Loaded back'}:{' '}
                        {formatCurrency(costs.altReturnTargetPrice, { maximumFractionDigits: 0 })}
                      </Mono>
                    )}
                  </View>
                )}
              </View>

              {/* Route refused by company policy — replaces the route preview,
              same as web. */}
              {ready && routeBlockedMessage && (
                <View className="mt-5">
                  <Banner tone="danger" message={routeBlockedMessage} />
                </View>
              )}

              {/* Route preview + alternatives sit right under the addresses that
              produced them, not ~1000px below (Phase 2's one field move). */}
              {ready && !routeBlockedMessage && (
                <View className="mt-5 gap-5">
                  {/* The addresses are right above, so only the trip itself:
                      one line, or the route chips when there's a choice. */}
                  {routes.length <= 1 && (
                    <View className="min-h-[24px] flex-row items-center gap-2">
                      <Mono className="text-callout text-fg">
                        {costs.distance
                          ? `${costs.distanceEstimated && !distanceConfirmed ? '≈ ' : ''}${formatNumber(
                              Math.round(costs.chargeDistance),
                            )} km${costs.duration ? ` · ${formatDuration(costs.duration / 60)}` : ''}`
                          : 'Working out the route…'}
                      </Mono>
                      {routeBusy && <ActivityIndicator size="small" color={colors.faint} />}
                    </View>
                  )}
                  <RouteOptionChips
                    routes={routes}
                    selectedRouteIndex={selectedRouteIndex}
                    bestIndex={bestIndex}
                    onSelect={(i) => {
                      setSelectedRouteIndex(i);
                      setAnalysis(null);
                    }}
                  />
                </View>
              )}
            </QuoteSection>

            <QuoteSection id="load" label="Load" onLayout={registerSectionY}>
              <TextField
                ref={weightInputRef}
                label={perTonne ? (isContract ? 'Tonnes per load' : 'Tonnes') : 'Weight (t)'}
                required
                placeholder="e.g. 20"
                keyboardType="decimal-pad"
                error={showIssue('weight', weightTouched)}
                value={weight}
                onChangeText={setWeight}
                onBlur={() => setWeightTouched(true)}
                bottomSheet
              />
              {lowFields.has('weight') && <CheckHint lang={nlLang} />}
              {/* Every quote is priced on a real truck (§3): the suggested one
                  for the load until the person picks another. */}
              <View
                ref={(r) => {
                  fieldRefs.current.vehicle = r;
                }}
              >
              <SelectField
                label={!vehicleType && perTonne ? 'Truck · safest' : !vehicleType && suggestedTruck ? 'Truck · suggested' : 'Truck'}
                icon="truck"
                placeholder={(vtypes ?? []).length ? 'Choose truck' : 'No trucks yet'}
                options={vtypeOptions}
                value={pricedTruckName}
                onSelect={handleVehicleTypeSelect}
                openRequest={truckPickerReq}
              />
              {lowFields.has('vehicle') && <CheckHint lang={nlLang} />}
              </View>
              <TextField
                ref={cargoInputRef}
                label="Cargo"
                placeholder="e.g. Steel coils"
                value={cargo}
                onChangeText={setCargo}
                bottomSheet
              />
              {lowFields.has('cargo') && <CheckHint lang={nlLang} />}
            </QuoteSection>

            <QuoteSection id="schedule" label="Schedule" onLayout={registerSectionY}>
              <View
                ref={(r) => {
                  fieldRefs.current.pickupDate = r;
                }}
              >
              <DateField
                label="Pickup date"
                required
                value={pickupDate}
                onChange={setPickupDate}
                minimumDate={startOfToday()}
                error={showIssue('pickupDate', false)}
              />
              {lowFields.has('pickupDate') && <CheckHint lang={nlLang} />}
              </View>
              <View
                ref={(r) => {
                  fieldRefs.current.deliveryDate = r;
                }}
              >
              <DateField
                label="Delivery date"
                required
                value={deliveryDate}
                onChange={(v) => {
                  deliveryTouchedRef.current = true;
                  setDeliveryDate(v);
                }}
                minimumDate={pickupDate ? new Date(pickupDate) : startOfToday()}
                error={showIssue('deliveryDate', false)}
              />
              {lowFields.has('deliveryDate') && <CheckHint lang={nlLang} />}
              </View>
              <DateField
                label="Valid until"
                value={validUntil}
                onChange={setValidUntil}
                minimumDate={startOfToday()}
              />
              <TextField
                label="Notes"
                placeholder="For the client"
                value={notes}
                onChangeText={setNotes}
                multiline
                bottomSheet
              />
            </QuoteSection>

            <QuoteSection id="price" label="Price" onLayout={registerSectionY}>
              <SegmentedControl
                options={[
                  { label: 'Per load', value: 'per_load' },
                  { label: 'Per tonne', value: 'per_tonne' },
                ]}
                value={pricingBasis}
                onChange={(v) => {
                  setPricingBasis(v);
                  if (v === 'per_load') setIsContract(false);
                }}
              />
              {perTonne && ready && !routeBlockedMessage && !(ready && demo.quotaExceeded && !savedId.current) ? (
                <>
                  <TonnageCard
                    tonnage={tonnage}
                    contract={isContract}
                    onContract={setIsContract}
                    totalTonnes={totalTonnes}
                    onTotalTonnes={setTotalTonnes}
                    minTonnes={minTonnes}
                    onMinTonnes={setMinTonnes}
                    periodStart={contractStart}
                    periodEnd={contractEnd}
                    onPeriod={(a, b) => {
                      setContractStart(a);
                      setContractEnd(b);
                    }}
                    rate={ratePerTonne}
                    onRate={setRatePerTonne}
                    onChooseTruck={(id) => {
                      if (id == null) {
                        setVehicleType('');
                        return;
                      }
                      const vt = (vtypes ?? []).find((v) => Number(v.id) === id);
                      if (vt) setVehicleType(vt.name);
                    }}
                    market={tonnageServer?.market ?? null}
                    choices={tonnageServer?.choices ?? []}
                  />
                  <QuoteWarnings warnings={visibleWarnings} onAction={onWarningAction} />
                </>
              ) : null}
              {/* Demo's one-quote cap outranks route/weight/loading — same
              precedence as web's QuoteBuilder.tsx (billingBlocked → not ready →
              quotaExceeded → route → weight → results). Only applies to a
              fresh quote — editing an already-saved one (savedId.current set)
              never hits this. */}
              {perTonne && ready && !routeBlockedMessage && !(demo.quotaExceeded && !savedId.current) ? null : ready && demo.quotaExceeded && !savedId.current ? (
                <Banner tone="danger" message={DEMO_QUOTA_MESSAGE} />
              ) : ready && !routeBlockedMessage && (costs.total > 0 || visibleWarnings.length > 0) ? (
                <>
                  {/* The cards first, warnings under them: a warning landing
                      after the route loads never pushes the figures down. */}
                  {!weightBlockedMessage && costs.total > 0 && (
                    <CostBreakdownCard
                      costs={costs}
                      serviceCharge={serviceCharge}
                      adjustmentLabel={adjustmentSource === 'saved' ? 'Kept from saved price' : 'Adjustment'}
                      onRatePress={() => setRateModal(true)}
                      onFuelPress={() => setFuelModal(true)}
                      onTollPress={() => setTollModal(true)}
                      onDriverPress={() => setDriverModal(true)}
                      onCrossBorderPress={() => setBorderModal(true)}
                      onCostPress={() => setCostModal(true)}
                      onAdjustmentPress={() => setAdjustModal(true)}
                      fuelNote={
                        costs.warnings.some((w) => w.code === 'diesel_stale')
                          ? `Price from ${saShortDate(costs.diesel.official_effective_from) ?? 'last period'}`
                          : quoteFuelLabel
                      }
                      onFuelRetry={costs.warnings.some((w) => w.code === 'diesel_stale') ? retryFuel : undefined}
                      driverNote={
                        spokenNights != null && !driverEdited
                          ? `${spokenNights} night${spokenNights === 1 ? '' : 's'}${
                              costs.allowancePerNight
                                ? ` × ${formatCurrency(costs.allowancePerNight, { maximumFractionDigits: 0 })}`
                                : ''
                            }`
                          : null
                      }
                      borderHint={
                        aiBorder?.borderPost ? t(nlLang, 'via', { post: borderPostShort(aiBorder.borderPost) }) : null
                      }
                      onSettingsPress={() => navigation.navigate('Settings', { section: 'company' })}
                    />
                  )}
                  <QuoteWarnings warnings={visibleWarnings} onAction={onWarningAction} />
                  {!weightBlockedMessage && costs.total > 0 && (
                    <PriceCheckCard
                      pc={pc}
                      onChoose={chooseMarket}
                      routeError={ready && !routeBusy && !routeData}
                    />
                  )}
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
            edit={{
              label: costs.legs === 2 ? 'Tolls, both legs' : 'Tolls',
              value: tollEdited ? tollOverride : costs.tollKnown ? formatPlain(costs.tollCost) : '',
              onChangeText: (v) => {
                setTollEdited(true);
                setTollOverride(v);
              },
              back:
                tollEdited && !costs.tollsUnavailable && Math.abs(tollOverrideNum - costs.tollCalculated) >= 0.005
                  ? { label: `Route ${formatCurrency(costs.tollCalculated, { maximumFractionDigits: 0 })}`, onPress: resetTollToCalculated }
                  : null,
            }}
          />
          <DriverBreakdownModal
            visible={driverModal}
            onClose={() => setDriverModal(false)}
            costs={costs}
            edit={{
              label: 'Driver allowance',
              value: driverEdited
                ? driverAllowance
                : costs.driverSuggested !== null && !costs.driverMissing
                  ? formatPlain(costs.driverSuggested, 2)
                  : '',
              onChangeText: (v) => {
                setDriverEdited(true);
                setDriverAllowance(v);
              },
              back:
                driverEdited && costs.driverSuggested !== null
                  ? {
                      label: `Suggested ${formatCurrency(costs.driverSuggested, { maximumFractionDigits: 0 })}`,
                      onPress: backToSuggestedDriver,
                    }
                  : null,
            }}
          />
          <BorderBreakdownModal
            visible={borderModal}
            onClose={() => setBorderModal(false)}
            costs={costs}
            agentFeeTyped={parseNum(agentFee) != null}
            agentFeeValue={parseNum(agentFee)}
            agentEdit={
              costs.agentEstimate !== null
                ? {
                    label: "Your agent's fee",
                    value: agentFee !== '' ? agentFee : formatPlain(costs.agentEstimate),
                    onChangeText: setAgentFee,
                    back: agentFee !== '' ? { label: 'Use the estimate', onPress: () => setAgentFee('') } : null,
                  }
                : null
            }
            edit={{
              label: costs.legs === 2 ? 'Border costs, both legs' : 'Border costs',
              value: borderOverride !== '' ? borderOverride : costs.crossBorderCost > 0 ? formatPlain(costs.crossBorderCost) : '',
              onChangeText: setBorderOverride,
              back: borderOverride !== '' ? { label: 'Use the route figure', onPress: () => setBorderOverride('') } : null,
            }}
          />
          <FuelBreakdownModal
            visible={fuelModal}
            onClose={() => setFuelModal(false)}
            costs={costs}
            weightTons={weightTons}
          />
          <RateBreakdownModal
            visible={rateModal}
            onClose={() => setRateModal(false)}
            ratePerKm={effectiveRateNum}
            km={costs.chargeDistance}
            amount={costs.baseCost}
            source={costs.priceIsDefault ? `${pct(costs.costing.target_margin_pct ?? 10)} margin` : rateSource}
            edit={{
              label: 'Rate per km',
              // Shown to the cent until typed in; the price keeps full precision.
              value: rateTypedRef.current ? baseRatePerKm : formatPlain(Math.round(effectiveRateNum * 100) / 100),
              placeholder: 'e.g. 25',
              onChangeText: (v) => {
                rateTouchedRef.current = true;
                rateTypedRef.current = true;
                setUseDefaultPrice(false);
                setBaseRatePerKm(v);
              },
              back:
                !costs.priceIsDefault && costs.defaultPrice !== null
                  ? {
                      label: `Default price ${formatCurrency(costs.defaultPrice, { maximumFractionDigits: 0 })}`,
                      onPress: () => setUseDefaultPrice(true),
                    }
                  : null,
            }}
          />
          <AdjustmentModal
            visible={adjustModal}
            label={adjustmentSource === 'saved' ? 'Kept from saved price' : 'Adjustment'}
            amount={serviceCharge}
            todaysPrice={costs.directCost}
            onKeep={() => setAdjustModal(false)}
            onUseToday={() => {
              setAdjustModal(false);
              resetPriceToActual();
              if (reopen.state === 'notice') setReopen({ state: 'done' });
            }}
          />
          <CostFloorModal visible={costModal} onClose={() => setCostModal(false)} costs={costs} />
          {/* Stays open through the AI step, so the user sees "Building your
          quote" rather than being dropped back on a form that's mid-change. */}
          {voiceOpen && (
            <VoiceQuoteSheet
              onCaptured={(uri, language) => void onVoiceCaptured(uri, language)}
              onClose={() => setVoiceOpen(false)}
              lang={nlLang}
            />
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
      {sendPreviewOpen && (
        <QuoteSendPreview
          quote={sendPreviewData}
          sending={busy === 'send'}
          onEdit={() => {
            setSendPreviewOpen(false);
            jumpTo('schedule');
          }}
          onConfirm={() => void saveRef.current(true)}
          onCancel={() => busy == null && setSendPreviewOpen(false)}
        />
      )}

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
