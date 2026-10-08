import { useRef, useState } from 'react';
import { View, Share, Alert, Modal, TouchableOpacity } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  SheetScreen,
  Group,
  DetailRow,
  RoutePreview,
  StatusPill,
  SelectField,
  TextField,
  RadioRows,
  Badge,
  Banner,
  Button,
  OverflowMenu,
  type OverflowAction,
  type IconName,
  Txt,
  Mono,
} from '@/components/ui';
import { ErrorState, DetailSkeleton, NotFoundState } from '@/components/feedback';
import { RouteMap } from '@/components/RouteMap';
import {
  useQuote,
  useQuoteFuelAlert,
  useQuoteCosting,
  useCompanyProfileData,
  useBookedQuotedMargin,
  sendQuote,
  recordQuoteOutcome,
  deleteQuote,
  downloadQuotePdf,
  patchQuote,
} from './api';
import { num, str, pick, asArray } from '@/lib/api/list';
import { postData } from '@/lib/api/client';
import { bookedLoadOf, quoteLapsed } from '@/lib/quoteStage';
import { STATUS_LABEL as LOAD_STATUS_LABEL } from './constants';
import { QuoteSendPreview, type QuotePreviewData } from './QuoteSendPreview';
import { invalidateFor } from '@/lib/queryInvalidation';
import { quoteShareUrl } from '@/lib/legal';
import { openWhatsApp } from '@/lib/whatsapp';
import {
  formatCurrency,
  formatDate,
  formatNumber,
  parseNum,
  round2,
  decimalMax,
} from '@/lib/formatters';
import { customerPriceLines, type CustomerPrice } from '@/lib/vat';
import { toast } from '@/lib/toast';
import { useSubscription } from '@/hooks/useSubscription';
import { useDemo } from '@/hooks/useDemo';
import { DEMO_EMAIL_SIMULATED } from '@/lib/demoStatus';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import type { AppStackParamList } from '@/navigation/types';
import { useTheme } from '@/theme/ThemeProvider';
import { pricedInEarlierPeriod } from './quote/rules';
import { pct } from './quote/CostBreakdownCard';
import { TonnageTermsGroup } from './TonnageTermsGroup';
import type { VolumeContract } from './quote/tonnage';
import { actualsView, percent } from './trip/economics';
import { useFollowUp, useFuelAdjustment } from './followupsApi';
import { DraftClauseLine, FollowUpCard, FuelAdjustmentGroup } from './FollowUps';
import { showFollowUp } from '@/lib/followups';

type Props = NativeStackScreenProps<AppStackParamList, 'QuoteDetail'>;

// Matches the web quote-detail status dropdown (plain PATCH { status }).
// In-Transit/Completed now belong to the Order created via "Convert to
// booking", not the quote — the backend rejects a direct write to either.
// They're only shown below when a legacy quote already carries that status.
const STATUS_OPTIONS = [
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Sent', value: 'SENT' },
  { label: 'Accepted', value: 'ACCEPTED' },
  { label: 'Declined', value: 'DECLINED' },
];

const LEGACY_STATUS_LABELS: Record<string, string> = {
  IT: 'In-Transit',
  COMPLETED: 'Completed',
};

// Same fixed reasons the web outcome modal offers.
const REJECTION_REASONS = [
  'Price too high',
  'Went with competitor',
  'Job cancelled',
  'Other',
] as const;

export function QuoteDetailScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const subscription = useSubscription();
  const demo = useDemo();
  const { id, preview, followUp } = route.params;
  const { data, error, isError, isPending, refetch } = useQuote(id, preview);
  const q = (data ?? {}) as Record<string, unknown>;
  const status = str(pick(q, ['status']), 'DRAFT').toUpperCase();
  // Diesel moving since a quote was priced matters while it can still change.
  const { data: fuelAlert } = useQuoteFuelAlert(id, !!data && ['DRAFT', 'SENT'].includes(status));
  const { data: costing } = useQuoteCosting(id, !!data);
  // Quote follow-ups: the fuel clause / adjustment, and the follow-up card on a sent quote.
  const { data: fuelAdjustment } = useFuelAdjustment('quotes', id, !!data);
  const { data: followUpState } = useFollowUp(id, !!data && showFollowUp(status));
  const { data: company } = useCompanyProfileData();
  // Once delivered (actuals recorded), the margin it was quoted at, from the job.
  const { data: quotedMarginAtBooking } = useBookedQuotedMargin(
    bookedLoadOf(data as Record<string, unknown> | undefined)?.id ?? null,
    !!data && !!(data as Record<string, unknown>).actuals,
  );
  const qc = useQueryClient();
  const nav = useAppNavigation();
  const [sendBusy, setSendBusy] = useState(false);
  // The pre-send check (§11) is a network call: one at a time, with the Send
  // control showing progress while it runs.
  const [sendChecking, setSendChecking] = useState(false);
  const checkingRef = useRef(false);
  const [sendOpen, setSendOpen] = useState(false);
  // Which channel the preview is for; the send itself runs on confirm.
  const [sendPreview, setSendPreview] = useState<'email' | 'whatsapp' | null>(null);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [outcomeType, setOutcomeType] = useState<'accepted' | 'rejected' | null>(null);
  const [outcomeBusy, setOutcomeBusy] = useState(false);
  const [finalPrice, setFinalPrice] = useState('');
  const finalPriceNum = parseNum(finalPrice);
  // QuoteOutcome.final_price is DecimalField(max_digits=12, decimal_places=2)
  // with no serializer in front of it (services/quote_outcome_capture.py) —
  // an unparseable-by-Decimal value (e.g. too many whole digits) 500s there
  // instead of coming back as a clean 400, so this is checked client-side.
  const FINAL_PRICE_MAX = decimalMax(12, 2);
  const finalPriceInvalid =
    finalPrice.trim() !== '' &&
    (finalPriceNum == null || finalPriceNum < 0 || finalPriceNum > FINAL_PRICE_MAX);
  const [rejectionReason, setRejectionReason] = useState('');
  const [customReason, setCustomReason] = useState('');

  // A 404 means the quote was deleted or moved, which retrying can't fix.
  if (isError && !data && (error as { status?: number } | null)?.status === 404) {
    return (
      <SheetScreen title="Quote" onBack={() => navigation.goBack()}>
        <NotFoundState what="Quote" onBack={() => navigation.goBack()} />
      </SheetScreen>
    );
  }
  if (isError && !data) return <ErrorState onRetry={refetch} message="Couldn't load this quote." />;
  // Opened cold (push, deep link) there is no list row to render from: show a
  // skeleton rather than a zeroed "DRAFT / R0" quote.
  if (isPending && !data) {
    return (
      <SheetScreen title="Quote" onBack={() => navigation.goBack()}>
        <DetailSkeleton />
      </SheetScreen>
    );
  }

  const total = num(pick(q, ['total_amount', 'price']));
  // Price excl. VAT, VAT and total incl. VAT as the customer is shown them
  // (backend quote_vat; same figures as the PDF, email and quote page).
  const rawPrice = pick(q, ['customer_price']);
  const customerPrice =
    rawPrice && typeof rawPrice === 'object' && !Array.isArray(rawPrice)
      ? (rawPrice as CustomerPrice)
      : undefined;
  // Margin on the cost floor, the same figure the builder shows: today's
  // floor from the backend's costing (newer backends), else the quote's stored
  // floor (column, else the copy in route_snapshot). Never the stored
  // margin_percentage, which older builds wrote on a different basis.
  const routeSnap = (pick(q, ['route_snapshot']) ?? {}) as Record<string, unknown>;
  const serverFloor = typeof costing?.floor === 'number' ? (costing.floor as number) : null;
  const storedFloor =
    pick(q, ['cost_floor']) != null
      ? num(pick(q, ['cost_floor']))
      : routeSnap.cost_floor != null
        ? num(routeSnap.cost_floor)
        : null;
  // Tolls that were unknown when saved (costing_inputs), or that the backend's
  // costing for the quote can't work out: the floor is incomplete.
  const costingInputs = (pick(q, ['costing_inputs']) ?? {}) as Record<string, unknown>;
  const serverTollLine = asArray<Record<string, unknown>>(costing?.lines).find(
    (l) => l.key === 'tolls',
  );
  const tollsUnknown =
    costingInputs.tolls_unknown === true ||
    (serverTollLine != null && serverTollLine.amount === null);
  const costFloor = tollsUnknown && serverFloor === null ? null : (serverFloor ?? storedFloor);
  const marginPct = costFloor !== null && total > 0 ? ((total - costFloor) / total) * 100 : null;
  const targetMargin = Math.min(
    Math.max(num(pick(company ?? {}, ['margin_target_pct'])) || 10, 1),
    40,
  );
  const roundTrip = str(pick(q, ['trip_type'])).toUpperCase() === 'ROUND_TRIP';
  const token = str(pick(q, ['token', 'view_token']));
  const shareUrl = token ? quoteShareUrl(id, token) : undefined;

  // Full-text locations (web uses pickup_location / delivery_location, not codes).
  const origin = str(pick(q, ['pickup_location', 'origin_city', 'origin', 'pickup_city']), '—');
  const dest = str(
    pick(q, ['delivery_location', 'destination_city', 'destination', 'delivery_city']),
    '—',
  );

  // Stops: raw {location, lat, lon} records → a label array for RoutePreview's
  // rail and a GeoPoint array for RouteMap's markers. A stop missing lat/lon
  // is dropped from the map rather than plotted at (0,0).
  const stopsRaw = asArray<Record<string, unknown>>(pick(q, ['stops']));
  const stopLabels = stopsRaw.map((s) => str(pick(s, ['location']))).filter(Boolean);
  const stopPoints = stopsRaw
    .map((s) => ({ lat: num(pick(s, ['lat'])), lon: num(pick(s, ['lon'])) }))
    .filter((p) => p.lat && p.lon);

  // Real road-path polyline, when the quote was saved with one — older quotes
  // (saved before this field existed) fall back to RouteMap's dashed line.
  const routeGeometry = asArray<Record<string, unknown>>(pick(q, ['route_geometry']))
    .map((p) => ({ lat: num(pick(p, ['lat'])), lon: num(pick(p, ['lon'])) }))
    .filter((p) => p.lat && p.lon);

  const pickupLat = num(pick(q, ['pickup_lat']));
  const pickupLon = num(pick(q, ['pickup_lng']));
  const deliveryLat = num(pick(q, ['delivery_lat']));
  const deliveryLon = num(pick(q, ['delivery_lng']));
  // A detail view either knows the route or doesn't — skip the map entirely
  // rather than let RouteMap fall back to its South-Africa placeholder, which
  // is only right for an in-progress picker.
  const hasRouteCoords = !!(pickupLat && deliveryLat);

  // Customer (flat fields on the quote).
  const customer = [
    { label: 'Name', value: str(pick(q, ['customer_name', 'customer'])) },
    { label: 'Company', value: str(pick(q, ['customer_company'])) },
    { label: 'Email', value: str(pick(q, ['customer_email'])) },
    { label: 'Phone', value: str(pick(q, ['customer_phone'])) },
    { label: 'City', value: str(pick(q, ['customer_city'])) },
  ].filter((r) => r.value);

  // Cargo details (web "Cargo Details" card).
  const weightKg = num(pick(q, ['weight']));
  const distanceKm = num(pick(q, ['distance']));
  const cargo = [
    { label: 'Description', value: str(pick(q, ['cargo_description'])) },
    { label: 'Vehicle type', value: str(pick(q, ['vehicle_type'])) },
    // formatNumber, not bare toLocaleString(): with no locale argument those
    // two fell through to the DEVICE locale, so a handset set to German
    // rendered 1234 kg as "1.234 kg".
    { label: 'Weight', value: weightKg > 0 ? `${formatNumber(weightKg)} kg` : '' },
    {
      label: 'Distance',
      value: distanceKm > 0 ? `${formatNumber(distanceKm, { maximumFractionDigits: 1 })} km` : '',
    },
    { label: 'Assigned vehicle', value: str(pick(q, ['vehicle_display'])) },
    { label: 'Assigned driver', value: str(pick(q, ['driver_display'])) },
  ].filter((r) => r.value);

  // Price lines — the same ones the web shows, and they must add up to the
  // total. The old derived "Service charge" (total minus the other lines) was
  // really the stored base rate under another name.
  const baseRate = num(pick(q, ['base_rate']));
  const fuel = num(pick(q, ['fuel_surcharge']));
  const toll = num(pick(q, ['toll_charges']));
  const driver = num(pick(q, ['driver_allowance']));
  const additional = num(pick(q, ['additional_charges']));
  const returnBaseRate = num(pick(q, ['return_base_rate']));
  // One vocabulary with the builder and web: Base rate, Fuel, Tolls, Driver
  // allowance, Adjustment.
  const costRows: { label: string; value: number }[] = [
    { label: 'Base rate', value: baseRate },
    { label: 'Fuel', value: fuel },
    { label: 'Tolls', value: toll },
    { label: 'Driver allowance', value: driver },
  ];
  if (additional !== 0)
    costRows.push({
      label: pick(q, ['is_international']) === true ? 'Border and adjustment' : 'Adjustment',
      value: additional,
    });
  if (roundTrip && returnBaseRate > 0)
    costRows.push({
      label: `Return leg (${str(pick(q, ['return_cargo'])) ? 'with cargo' : 'empty'})`,
      value: returnBaseRate,
    });
  // A stored total that carries charges not broken down here gets its own line
  // rather than an unexplained gap.
  const linesSum = costRows.reduce((a, r) => a + r.value, 0);
  const notItemised = round2(total - linesSum);
  const hasGap = Math.abs(notItemised) > 0.5;

  const validUntil = str(pick(q, ['valid_until']));
  const createdAt = str(pick(q, ['created_at']));
  const notes = str(pick(q, ['notes']));

  // The quote API names the load it was booked as (booked_load); a quote
  // converts to at most one, and the backend refuses a second conversion.
  const bookedLoad = bookedLoadOf(q);
  // A volume contract books call-off loads until its tonnes are used up.
  const perTonne = str(pick(q, ['pricing_basis'])) === 'per_tonne';
  const contract = perTonne ? ((q.volume_contract ?? null) as VolumeContract | null) : null;
  const contractOpen = !!contract && contract.remaining_tonnes > 0;
  const booked = bookedLoad !== null && !contractOpen;
  // Legacy quotes carrying a load status (In transit, Completed) with no load
  // found: nothing to send or convert, and no booking to open.
  const loadStateOnly = !booked && (status === 'IT' || status === 'COMPLETED');
  const openStatus = status === 'DRAFT' || status === 'SENT';
  // One expiry rule with the list and Home: a Draft or Sent quote past its
  // valid-until day is Expired, not live work.
  const lapsed = !booked && openStatus && quoteLapsed(q);
  // An expired quote, or a draft priced before a diesel rise, is edited before
  // it goes out: Edit is the primary action and Send steps down.
  const needsEdit = !booked && openStatus && (lapsed || (status === 'DRAFT' && !!fuelAlert));
  const shownStatus = booked ? 'BOOKED' : lapsed ? 'EXPIRED' : status;
  const canConvert =
    (['ACCEPTED', 'APPROVED'].includes(status) || (contractOpen && bookedLoad !== null)) && !booked && !loadStateOnly;
  // Newer backends: what the job really earned once delivered (null until then).
  const actuals = actualsView(pick(q, ['actuals']));
  const bookedLabel = bookedLoad
    ? `${bookedLoad.load_number || 'a booking'}${
        bookedLoad.status ? ` · ${LOAD_STATUS_LABEL(String(bookedLoad.status).toUpperCase())}` : ''
      }`
    : '';
  // Diesel note built from the numbers, not the server's free text, with the
  // sign it actually has (a drop is not "up").
  const fuelDelta = Number(fuelAlert?.fuel_delta_zar);
  const fuelImpact = Number(fuelAlert?.estimated_cost_impact);
  const fuelNote = fuelAlert
    ? Number.isFinite(fuelDelta) && Number.isFinite(fuelImpact) && fuelDelta !== 0
      ? `Diesel ${fuelDelta > 0 ? 'up' : 'down'} ${formatCurrency(Math.abs(fuelDelta))}/L since quoted: cost ${
          fuelImpact >= 0 ? '+' : '−'
        }${formatCurrency(Math.abs(fuelImpact), { maximumFractionDigits: 0 })}.${
          (status === 'DRAFT' || lapsed) && fuelDelta > 0 ? ' Re-price before sending.' : ''
        }`
      : (fuelAlert.message ?? '')
    : '';

  // §11: any send path (Send, Resend, status → Sent) is blocked by a blocking
  // warning and asks first when the quote was priced in an earlier diesel
  // period. A newer backend answers with its own send check; an older one is
  // checked here from the stored snapshot.
  const snapshot = (pick(q, ['route_snapshot']) ?? {}) as Record<string, unknown>;
  const pricedAt =
    str(pick(q, ['priced_at'])) ||
    str(snapshot.priced_at) ||
    (snapshot.fuel_price_per_litre_used != null ? str(pick(q, ['created_at'])) : '');
  const guardedSend = async (go: () => void) => {
    // A second tap while the check runs must not open a second sheet.
    if (checkingRef.current || sendBusy) return;
    checkingRef.current = true;
    setSendChecking(true);
    let warnings: Record<string, unknown>[] | null = null;
    try {
      const res = await postData<Record<string, unknown>>({
        url: 'quotes/cost-breakdown/',
        data: { quote_id: Number(id) },
        // A slow network falls back to the local check rather than hanging.
        config: { timeout: 10000 },
      });
      const check = (res?.send_check ?? null) as Record<string, unknown> | null;
      if (check) warnings = asArray<Record<string, unknown>>(check.warnings);
    } catch {
      warnings = null; // older backend, offline or slow: the local check below
    } finally {
      checkingRef.current = false;
      setSendChecking(false);
    }
    if (warnings === null) {
      const block = asArray<Record<string, unknown>>(pick(q, ['warnings'])).find(
        (w) => w.severity === 'block',
      );
      warnings = [
        ...(block ? [block] : []),
        ...(pricedAt && pricedInEarlierPeriod(pricedAt)
          ? [
              {
                code: 'diesel_period_changed',
                severity: 'warn',
                title: 'Priced on an earlier diesel price',
              },
            ]
          : []),
      ];
    }
    const block = warnings.find((w) => w.severity === 'block');
    if (block) {
      toast.error(str(block.title, "Can't send yet"));
      return;
    }
    const older = warnings.find((w) => w.code === 'diesel_period_changed');
    if (older) {
      Alert.alert(str(older.title, 'Priced on older diesel'), str(older.detail) || undefined, [
        {
          text: 'Edit quote',
          style: 'cancel',
          onPress: () => navigation.navigate('CreateQuote', { quoteId: id }),
        },
        { text: 'Send anyway', onPress: go },
      ]);
      return;
    }
    go();
  };

  // "expired" / "N h left" beside the valid-until date.
  const validMs = validUntil ? Date.parse(validUntil) : NaN;
  const validNote = lapsed
    ? 'expired'
    : openStatus &&
        Number.isFinite(validMs) &&
        validMs > Date.now() &&
        validMs - Date.now() < 48 * 3600_000
      ? `${Math.ceil((validMs - Date.now()) / 3600_000)} h left`
      : '';
  const outcome = str(pick(q, ['outcome'])).toLowerCase();
  // Web only offers won/lost capture while the quote is still open.
  const canRecordOutcome = !outcome && ['SENT', 'DRAFT'].includes(status);

  const refresh = () => invalidateFor(qc, 'quote');

  // What the customer will be sent, for the preview. customer_email is only
  // passed when the quote carries the key, so the preview looks it up otherwise.
  const rawCustomer = pick(q, ['customer']);
  const previewData: QuotePreviewData = {
    id,
    quote_number: str(pick(q, ['quote_number'])),
    customer_id:
      typeof rawCustomer === 'number' || typeof rawCustomer === 'string' ? rawCustomer : undefined,
    customer_name: str(pick(q, ['customer_name'])),
    customer_email: 'customer_email' in q ? str(q.customer_email) : undefined,
    pickup_location: origin === '—' ? '' : origin,
    delivery_location: dest === '—' ? '' : dest,
    total_amount: total,
    customer_price: customerPrice,
    valid_until: validUntil,
    pickup_date: str(pick(q, ['pickup_date'])),
  };

  // Each action drives its own spinner so buttons never co-load.
  const run = async (
    setFlag: (v: boolean) => void,
    fn: () => Promise<unknown>,
    okMsg: string,
    back = false,
  ) => {
    setFlag(true);
    try {
      await fn();
      refresh();
      toast.success(okMsg);
      if (back) navigation.goBack();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setFlag(false);
    }
  };

  // Send offers Email or WhatsApp rather than emailing immediately. WhatsApp
  // needs the public link, which send_to_customer is what mints — so an unsent
  // quote is sent first, then handed off.
  const sendViaEmail = () => {
    setSendOpen(false);
    setSendPreview('email');
  };

  const sendEmailNow = () => {
    setSendBusy(true);
    return sendQuote(id)
      .then((res) => {
        refresh();
        // The backend still returns 200 in demo mode (send_to_customer skips
        // the real email — core/services/quote_share.py) — fall back to
        // demo.isDemo when the reason is absent, same as web's QuoteDetail.tsx.
        const skippedForDemo =
          (str(pick(res ?? {}, ['email_skipped_reason'])) || (demo.isDemo ? 'demo_mode' : '')) ===
          'demo_mode';
        if (skippedForDemo) {
          // toast.success is silent by app-wide policy (src/lib/toast.tsx) —
          // this caveat matters enough to actually show, so it goes through
          // the one visible channel even though nothing failed.
          toast.error(DEMO_EMAIL_SIMULATED);
        } else {
          toast.success('Quote emailed to client');
        }
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Action failed'))
      .finally(() => setSendBusy(false));
  };

  const sendViaWhatsApp = async () => {
    setSendOpen(false);
    // With a link already minted, WhatsApp just opens with it. Without one the
    // quote is sent first (which emails the customer), so preview that.
    if (shareUrl) await sendWhatsAppNow();
    else setSendPreview('whatsapp');
  };

  const sendWhatsAppNow = async () => {
    setSendBusy(true);
    try {
      let link = shareUrl;
      if (!link) {
        const res = await sendQuote(id);
        refresh();
        // send_to_customer returns share_url; rewrite it onto our own host so
        // the link always points at this environment (the backend's
        // FRONTEND_URL may be pinned to production), mirroring the web app.
        const returned = str(pick(res, ['share_url', 'url']));
        const tok = str(pick(res, ['token', 'view_token']));
        if (tok) link = quoteShareUrl(id, tok);
        else if (returned) {
          const tail = returned.split('/quotes/view/')[1];
          link = tail ? quoteShareUrl(id, tail.split('/').pop() ?? '') : returned;
        }
      }
      const ref = str(pick(q, ['quote_number']));
      const name = str(pick(q, ['customer_name', 'customer']));
      const priceLines = customerPriceLines(total, customerPrice, formatCurrency);
      const message = [
        `Hi${name ? ` ${name}` : ''}, here's your freight quote${ref ? ` (${ref})` : ''} from Truckwys.`,
        priceLines.join('\n'),
        link ? `View and respond: ${link}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');
      await openWhatsApp(str(pick(q, ['customer_phone'])), message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not open WhatsApp');
    } finally {
      setSendBusy(false);
    }
  };

  // Runs after the person confirms in the preview.
  const confirmSend = async () => {
    const kind = sendPreview;
    if (!kind) return;
    if (kind === 'email') await sendEmailNow();
    else await sendWhatsAppNow();
    setSendPreview(null);
  };

  const closeOutcome = () => {
    setOutcomeType(null);
    setFinalPrice('');
    setRejectionReason('');
    setCustomReason('');
  };

  const reasonText = rejectionReason === 'Other' ? customReason.trim() : rejectionReason;
  const canSubmitOutcome = outcomeType === 'accepted' ? !finalPriceInvalid : !!reasonText;

  const submitOutcome = () => {
    if (!outcomeType || !canSubmitOutcome) return;
    const payload =
      outcomeType === 'accepted'
        ? {
            outcome: 'accepted' as const,
            // Blank is legitimate here ("keep the quoted total"), but an
            // unparseable value is not — Number() silently dropped it and closed
            // the quote at the old total.
            ...(finalPriceNum != null && finalPriceNum > 0
              ? { final_price: round2(finalPriceNum) }
              : {}),
          }
        : { outcome: 'rejected' as const, rejection_reason: reasonText };
    run(
      setOutcomeBusy,
      async () => {
        await recordQuoteOutcome(id, payload);
        closeOutcome();
      },
      outcomeType === 'accepted' ? 'Marked as won' : 'Marked as lost',
    );
  };

  const editQuote = () => navigation.navigate('CreateQuote', { quoteId: id });
  const changeStatus = (s: string) => {
    if (s === status || statusBusy || sendChecking) return;
    const go = () => run(setStatusBusy, () => patchQuote(id, { status: s }), 'Status updated');
    if (s === 'SENT') void guardedSend(go);
    else go();
  };

  const download = async () => {
    setDownloadBusy(true);
    try {
      const blob = await downloadQuotePdf(id);
      const base64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('read failed'));
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
        reader.readAsDataURL(blob);
      });
      const path = `${FileSystem.cacheDirectory}Quote-${str(pick(q, ['quote_number']), String(id))}.pdf`;
      await FileSystem.writeAsStringAsync(path, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
      } else {
        toast.info('Sharing not available');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not download PDF');
    } finally {
      setDownloadBusy(false);
    }
  };

  const share = async () => {
    if (!shareUrl) return toast.info('No share link yet. Send the quote first');
    await Share.share({
      message: `Truckwys quote ${str(pick(q, ['quote_number']), '')}: ${shareUrl}`,
    });
  };

  const confirmDelete = () =>
    Alert.alert('Delete quote', 'Permanently delete this quote?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => run(setDeleteBusy, () => deleteQuote(id), 'Quote deleted', true),
      },
    ]);

  // One state-driven primary action; everything else sits in the overflow menu.
  // Booked: the booking owns the job. Accepted and not booked: convert it. A
  // live Draft or Sent quote: send it (Edit leads instead when it is expired or
  // priced before a diesel rise). Anything else falls back to Edit.
  const primaryKind: 'view' | 'convert' | 'send' | 'edit' = booked
    ? 'view'
    : canConvert
      ? 'convert'
      : openStatus && !needsEdit
        ? 'send'
        : 'edit';
  const primary: {
    label: string;
    icon: IconName;
    onPress: () => void;
    loading?: boolean;
    disabled?: boolean;
  } = {
    view: {
      label: 'View booking',
      icon: 'arrowRight' as IconName,
      onPress: () =>
        navigation.navigate('LoadDetail', { id: bookedLoad!.id, title: bookedLoad!.load_number }),
    },
    convert: {
      label: contract ? 'Book a load' : 'Book job',
      icon: 'arrowRight' as IconName,
      disabled: subscription.blocked,
      onPress: () =>
        nav.openBookJob({
          quoteId: id,
          reference: str(pick(q, ['quote_number'])),
          vehicleType: str(pick(q, ['vehicle_type'])) || undefined,
          popCallerOnSuccess: true,
          ...(contract
            ? {
                callOff: {
                  remaining: contract.remaining_tonnes,
                  size: contract.tonnes_per_load,
                  max: contract.max_tonnes_per_load ?? null,
                },
              }
            : {}),
        }),
    },
    send: {
      label: status === 'SENT' ? 'Resend' : 'Send',
      icon: 'send' as IconName,
      loading: sendBusy || sendChecking,
      onPress: () => void guardedSend(() => setSendOpen(true)),
    },
    edit: { label: 'Edit quote', icon: 'edit' as IconName, onPress: editQuote },
  }[primaryKind];

  const menuActions: OverflowAction[] = [];
  if (!booked && primaryKind !== 'edit') {
    menuActions.push({ label: 'Edit quote', icon: 'edit', onPress: editQuote });
  }
  if (!booked && !loadStateOnly && primaryKind !== 'send') {
    menuActions.push({
      label: status === 'SENT' ? 'Resend' : 'Send',
      icon: 'send',
      disabled: sendBusy || sendChecking,
      onPress: () => void guardedSend(() => setSendOpen(true)),
    });
  }
  if (canRecordOutcome) {
    menuActions.push(
      {
        label: 'Mark accepted',
        icon: 'checkCircle',
        onPress: () => setOutcomeType('accepted'),
      },
      { label: 'Mark rejected', icon: 'x', onPress: () => setOutcomeType('rejected') },
    );
  }
  menuActions.push({
    label: 'Download PDF',
    icon: 'download',
    disabled: downloadBusy,
    hint: 'Preparing the PDF',
    onPress: download,
  });
  if (!booked) {
    menuActions.push({
      label: 'Delete quote',
      icon: 'x',
      destructive: true,
      disabled: deleteBusy,
      hint: 'Deleting',
      onPress: confirmDelete,
    });
  }

  const footer = (
    <View className="flex-row items-center gap-2.5">
      <View className="flex-1">
        <Button
          label={primary.label}
          icon={primary.icon}
          loading={primary.loading}
          disabled={primary.disabled}
          onPress={primary.onPress}
          fullWidth
        />
      </View>
      <OverflowMenu actions={menuActions} accessibilityLabel="More quote actions" />
    </View>
  );

  return (
    <SheetScreen
      eyebrow={str(pick(q, ['customer_name', 'customer']), 'Quote')}
      title={str(pick(q, ['quote_number', 'reference']), 'Quote')}
      onBack={() => navigation.goBack()}
      actionLabel="Share"
      actionIcon="share"
      onAction={share}
      footer={footer}
    >
      <View className="mb-4 flex-row flex-wrap items-center gap-2.5">
        <StatusPill status={shownStatus} />
        {/* The recorded answer, when the status doesn't already say it (web QuoteDetail). */}
        {outcome === 'accepted' && status !== 'ACCEPTED' && !booked && <StatusPill status="WON" />}
        {outcome === 'rejected' && status !== 'DECLINED' && <StatusPill status="LOST" />}
        <Badge label={roundTrip ? 'Round trip' : 'One way'} tone={roundTrip ? 'info' : 'neutral'} />
        {marginPct !== null && (
          <Mono className={`text-caption ${marginPct < 0 ? 'text-danger' : 'text-faint'}`}>
            Margin {pct(marginPct)}
          </Mono>
        )}
      </View>

      {booked && <Txt className="-mt-2 mb-4 text-sub text-muted">Booked as {bookedLabel}</Txt>}
      {loadStateOnly && (
        <Txt className="-mt-2 mb-4 text-sub text-muted">
          Marked {(LEGACY_STATUS_LABELS[status] ?? status).toLowerCase()} on an older record. No
          booking is linked to this quote.
        </Txt>
      )}
      {lapsed && (
        <View className="mb-5">
          <Banner
            tone="warning"
            message={
              token
                ? `The customer's link still opens, but shows this quote as expired on ${formatDate(validUntil)}. Tap to edit it and send an updated quote.`
                : `This quote expired on ${formatDate(validUntil)}. Tap to edit it and set a new valid-until date before sending.`
            }
            onPress={editQuote}
          />
        </View>
      )}
      {!!fuelNote && (
        <View className="mb-5">
          <Banner tone="warning" message={fuelNote} />
        </View>
      )}

      {showFollowUp(status) && !booked && followUpState && (
        <FollowUpCard quoteId={id} state={followUpState} highlight={!!followUp} />
      )}

      <View className="mb-5">
        <RoutePreview
          origin={origin}
          dest={dest}
          stops={stopLabels}
          distance={
            distanceKm > 0
              ? `${formatNumber(distanceKm, { maximumFractionDigits: 1 })} km`
              : undefined
          }
          duration={
            pick(q, ['sla_hours']) ? `Delivery within ${num(pick(q, ['sla_hours']))} h` : undefined
          }
        />
        {hasRouteCoords && (
          <View className="mt-3">
            <RouteMap
              pickup={{ lat: pickupLat, lon: pickupLon }}
              delivery={{ lat: deliveryLat, lon: deliveryLon }}
              stops={stopPoints}
              geometry={routeGeometry.length > 1 ? routeGeometry : undefined}
            />
          </View>
        )}
      </View>

      {marginPct !== null && marginPct < targetMargin && (
        <View className="mb-5">
          <Banner
            tone={marginPct < 0 ? 'danger' : 'warning'}
            message={
              marginPct < 0
                ? 'Price is below your costs'
                : `Margin under your ${pct(targetMargin)} target`
            }
            onPress={!booked && openStatus ? editQuote : undefined}
          />
        </View>
      )}

      {customer.length > 0 && (
        <Group label="Customer">
          {customer.map((c, i) => (
            <DetailRow
              key={c.label}
              label={c.label}
              value={c.value}
              mono={false}
              last={i === customer.length - 1}
            />
          ))}
        </Group>
      )}

      {cargo.length > 0 && (
        <Group label="Cargo details">
          {cargo.map((c, i) => (
            <DetailRow
              key={c.label}
              label={c.label}
              value={c.value}
              mono={false}
              last={i === cargo.length - 1}
            />
          ))}
        </Group>
      )}

      {roundTrip && (
        <Group label="Return leg">
          <DetailRow
            label="Returns to"
            value={str(pick(q, ['return_location']), '—')}
            mono={false}
          />
          {str(pick(q, ['return_cargo'])) ? (
            <DetailRow label="Return cargo" value={str(pick(q, ['return_cargo']))} mono={false} />
          ) : null}
          {str(pick(q, ['return_date'])) ? (
            <DetailRow label="Return date" value={formatDate(str(pick(q, ['return_date'])))} />
          ) : null}
          {returnBaseRate > 0 ? (
            <DetailRow label="Return rate" value={formatCurrency(returnBaseRate)} last />
          ) : null}
        </Group>
      )}

      {perTonne && (
        <TonnageTermsGroup
          quote={q}
          onOpenLoad={(loadId, loadNumber) => navigation.navigate('LoadDetail', { id: loadId, title: loadNumber })}
        />
      )}

      {total > 0 && (
        <Group label={perTonne ? 'Price' : 'Cost breakdown'}>
          {!perTonne && costRows.map((c) =>
            c.label === 'Tolls' && tollsUnknown ? (
              // Saved while the toll lookup had failed: unknown, never R 0.
              <DetailRow
                key={c.label}
                label="Tolls"
                hint="Not worked out: edit the quote to add them"
                value="—"
                valueColor={colors.danger}
              />
            ) : (
              <DetailRow key={c.label} label={c.label} value={formatCurrency(c.value)} />
            ),
          )}
          {!perTonne && hasGap && (
            <DetailRow
              label="Not itemised"
              hint="Set on the quote; its total includes charges not broken down here."
              value={formatCurrency(notItemised)}
            />
          )}
          <View className="flex-row items-center justify-between bg-surface-hover px-3.5 py-3.5">
            <Txt className="text-callout font-semibold text-fg">
              {perTonne ? 'Estimated, excl. VAT' : roundTrip ? 'Price, both legs, excl. VAT' : 'Price excl. VAT'}
            </Txt>
            <Mono className="text-heading font-semibold text-fg">{formatCurrency(total)}</Mono>
          </View>
          {status === 'DRAFT' && (
            <DraftClauseLine quote={q} adjustment={fuelAdjustment} className="border-b border-line-row px-3.5 py-2.5" />
          )}
          {costFloor === null && tollsUnknown && (
            <DetailRow
              label="Cost floor"
              hint="Incomplete: tolls unknown"
              value="—"
              valueColor={colors.danger}
            />
          )}
          {costFloor !== null && (
            <>
              {/* Today's costs (backend costing) against the price as quoted,
                  or the floor stored when it was quoted: said which. */}
              <DetailRow
                label={serverFloor !== null ? 'Cost floor today' : 'Cost floor when quoted'}
                hint={serverFloor !== null ? 'Fuel above is as quoted' : undefined}
                value={formatCurrency(costFloor, { maximumFractionDigits: 0 })}
              />
              <DetailRow
                label={serverFloor !== null ? 'Margin today' : 'Margin'}
                value={`${pct(marginPct ?? 0)} · ${formatCurrency(total - costFloor, { maximumFractionDigits: 0 })}`}
                valueColor={(marginPct ?? 0) < 0 ? colors.danger : undefined}
              />
            </>
          )}
          {customerPrice ? (
            customerPrice.vat_registered ? (
              <>
                <DetailRow
                  label={customerPrice.vat_label || 'VAT'}
                  value={formatCurrency(num(customerPrice.vat_amount))}
                />
                <View className="flex-row items-center justify-between bg-surface-hover px-3.5 py-3.5">
                  <Txt className="text-callout font-semibold text-fg">Total incl. VAT</Txt>
                  <Mono className="text-heading font-semibold text-fg">
                    {formatCurrency(num(customerPrice.total_incl_vat))}
                  </Mono>
                </View>
              </>
            ) : (
              <DetailRow label="VAT" value="Not charged (not VAT-registered)" mono={false} last />
            )
          ) : null}
        </Group>
      )}

      {status !== 'DRAFT' && !bookedLoad && <FuelAdjustmentGroup adjustment={fuelAdjustment} />}

      {actuals && (
        // What the job really earned once delivered (QuoteOutcome actuals).
        <Group label="How it went">
          <DetailRow
            label={actuals.marginLabel}
            value={actuals.margin}
            valueColor={actuals.negative ? colors.danger : undefined}
            boldValue
          />
          {quotedMarginAtBooking != null && (
            <DetailRow label="Quoted margin" value={percent(quotedMarginAtBooking)} />
          )}
          {actuals.revenue && <DetailRow label="Revenue excl. VAT" value={actuals.revenue} />}
          {actuals.cost && (
            <DetailRow
              label={`${actuals.costRowLabel} excl. VAT`}
              hint={actuals.basis ?? undefined}
              value={actuals.cost}
              last={!actuals.backhaul}
            />
          )}
          {actuals.backhaul && <DetailRow label="Return" value={actuals.backhaul} mono={false} last />}
        </Group>
      )}

      <Group label="Quote info">
        {booked ? (
          // A booked quote cannot go back to Sent; its status is the booking's.
          <DetailRow label="Status" value={`Booked as ${bookedLabel}`} mono={false} />
        ) : (
          <View className="border-b border-line-row px-3.5 py-3">
            <SelectField
              label="Status"
              options={(status === 'IT' || status === 'COMPLETED'
                ? [
                    ...STATUS_OPTIONS,
                    { label: LEGACY_STATUS_LABELS[status] ?? status, value: status },
                  ]
                : STATUS_OPTIONS
              ).map((o) =>
                o.value === 'SENT' && lapsed ? { ...o, sub: 'Quote has expired, edit first' } : o,
              )}
              value={status}
              onSelect={changeStatus}
            />
          </View>
        )}
        {validUntil ? (
          <DetailRow
            label="Valid until"
            value={formatDate(validUntil)}
            hint={validNote || undefined}
            hintColor={lapsed ? colors.danger : undefined}
          />
        ) : null}
        {createdAt ? <DetailRow label="Created" value={formatDate(createdAt)} last /> : null}
      </Group>

      {notes ? (
        <Group label="Notes">
          <View className="px-3.5 py-3">
            <Txt className="text-sub text-muted">{notes}</Txt>
          </View>
        </Group>
      ) : null}

      {sendOpen && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setSendOpen(false)}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setSendOpen(false)}
            className="flex-1 items-center justify-center bg-backdrop px-6"
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => {}}
              className="w-full max-w-[420px] rounded-panel border border-line bg-surface p-5"
            >
              <Txt className="text-heading font-semibold text-fg">Send quote</Txt>
              <Txt className="mb-4 mt-1.5 text-sub text-muted">
                {str(pick(q, ['customer_name', 'customer']), 'the customer')}
              </Txt>
              <View className="gap-2.5">
                <Button label="Email" icon="send" onPress={sendViaEmail} fullWidth />
                <Button
                  label="WhatsApp"
                  icon="share"
                  variant="secondary"
                  onPress={sendViaWhatsApp}
                  fullWidth
                />
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => setSendOpen(false)}
                  fullWidth
                />
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {sendPreview && (
        <QuoteSendPreview
          quote={previewData}
          sending={sendBusy}
          onEdit={() => {
            setSendPreview(null);
            editQuote();
          }}
          onConfirm={confirmSend}
          onCancel={() => !sendBusy && setSendPreview(null)}
        />
      )}

      {outcomeType && (
        <Modal visible transparent animationType="fade" onRequestClose={closeOutcome}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={closeOutcome}
            className="flex-1 items-center justify-center bg-backdrop px-6"
          >
            <KeyboardAvoidingView behavior="padding" className="w-full max-w-[420px]">
              <TouchableOpacity
                activeOpacity={1}
                onPress={() => {}}
                className="rounded-panel border border-line bg-surface p-5"
              >
                <Txt className="text-heading font-semibold text-fg">
                  {outcomeType === 'accepted' ? 'Mark quote as accepted' : 'Mark quote as rejected'}
                </Txt>

                {outcomeType === 'accepted' ? (
                  <View className="mt-4">
                    <TextField
                      label="Final agreed price (optional)"
                      placeholder={formatNumber(total, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                      prefix="R"
                      keyboardType="decimal-pad"
                      numeric
                      decimals={2}
                      error={
                        finalPriceInvalid
                          ? finalPriceNum != null && finalPriceNum > FINAL_PRICE_MAX
                            ? "That's too large a price to record"
                            : 'Enter a number, e.g. 12 500,00'
                          : undefined
                      }
                      value={finalPrice}
                      onChangeText={setFinalPrice}
                    />
                    <Txt className="mt-1.5 text-caption text-faint">
                      Leave blank to keep the quoted {formatCurrency(total)}.
                    </Txt>
                  </View>
                ) : (
                  <View className="mt-4 gap-3.5">
                    {/* Inline rows, not a SelectField — its picker is itself a
                      Modal, and nesting Modals is unreliable on iOS. */}
                    <RadioRows
                      label="Reason"
                      options={REJECTION_REASONS.map((r) => ({ label: r, value: r }))}
                      value={rejectionReason}
                      onSelect={setRejectionReason}
                    />
                    {rejectionReason === 'Other' && (
                      <TextField
                        label="Please specify"
                        placeholder="Why was this quote lost?"
                        value={customReason}
                        onChangeText={setCustomReason}
                      />
                    )}
                  </View>
                )}

                <View className="mt-5 flex-row gap-2.5">
                  <View className="flex-1">
                    <Button label="Cancel" variant="secondary" onPress={closeOutcome} fullWidth />
                  </View>
                  <View className="flex-1">
                    <Button
                      label={outcomeType === 'accepted' ? 'Mark accepted' : 'Mark rejected'}
                      variant={outcomeType === 'accepted' ? 'primary' : 'danger'}
                      loading={outcomeBusy}
                      disabled={!canSubmitOutcome}
                      onPress={submitOutcome}
                      fullWidth
                    />
                  </View>
                </View>
              </TouchableOpacity>
            </KeyboardAvoidingView>
          </TouchableOpacity>
        </Modal>
      )}
    </SheetScreen>
  );
}
