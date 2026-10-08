// "Describe the load" (typed or voice): reading the chat-quote response, the
// EN/AF copy, the filled-field chips and the confirm-before-overwrite rule.
//
// Pure — no React Native imports — so the node tests can load it directly.
// The screen owns geocoding, state and the actual setters; this decides what
// changes, what needs asking first, and how it reads in English or Afrikaans.
//
// Every key in the response is optional (older backends send none of the new
// ones), and a missing key always means "leave the form alone".

export type UiLang = 'en' | 'af';
/** The voice language control: Auto lets the backend choose between EN and AF. */
export type VoiceLangPref = 'auto' | 'en' | 'af';

export const VOICE_LANG_KEY = 'tw.voiceQuote.language';
export const MAX_RECORD_MS = 60_000;
/** The remaining time shows from here. */
export const WARN_FROM_MS = 50_000;
export const UNDO_MS = 8_000;
/** Below this the chip and the field say "Check this". */
export const LOW_CONFIDENCE = 0.7;

// ── Copy ────────────────────────────────────────────────────────────────────

const COPY = {
  en: {
    listening: 'Listening…',
    lang_auto: 'English or Afrikaans',
    lang_en: 'English',
    lang_af: 'Afrikaans',
    chip_auto: 'Auto',
    heard_in: 'Heard in {lang}',
    heard_mixed: 'Heard in English + Afrikaans',
    reading: 'Reading…',
    filled: 'Filled',
    check_this: 'Check this',
    didnt_catch: "Didn't catch:",
    replace_q: 'Replace {n} fields?',
    replace_q1: 'Replace 1 field?',
    replace: 'Replace',
    keep: 'Keep mine',
    undo: 'Undo',
    undone: 'Back to what you had',
    abnormal: 'Abnormal load',
    no_speech: "Didn't catch any speech — try again a bit closer to the mic.",
    too_long: 'Stopped at 1 minute',
    mic_denied: 'Microphone permission is needed to record',
    placeholder: 'Describe the load, e.g. 28 t steel coils Joburg to Durban',
    describe: 'Describe the load',
    fill: 'Fill from description',
    record: 'Record voice description',
    stop: 'Stop recording',
    cancel: 'Cancel',
    left: '{s} s left',
    hint: 'Say the route, load and when',
    voice_language: 'Voice language: {lang}. Tap to change.',
    pick_truck: '{hint}? Pick a truck',
    nights: '{n} nights out — Apply',
    night: '1 night out — Apply',
    diesel: '{fuel} R {price}/L — Use for this quote',
    via: 'Via {post}',
    cross_border: 'Cross-border',
    from: 'From {a}',
    to: 'To {a}',
    via_stops: 'via {s}',
    one_way: 'One way',
    round_trip: 'Loaded both ways',
    back_empty: 'back empty',
    back_loaded: 'return load booked',
    pickup_on: 'Pickup {d}',
    delivery_on: 'Delivery {d}',
    valid_on: 'Valid until {d}',
    a11y_filled: 'filled',
    upload_too_big: 'That recording is too long. Keep it under a minute.',
    upload_rejected: "Couldn't read that recording. Try again.",
    voice_off: "Voice isn't available right now. Type the load instead.",
    voice_failed: "Couldn't hear that properly. Try again.",
    filled_default: 'Filled from your description.',
  },
  af: {
    listening: 'Luister…',
    lang_auto: 'Engels of Afrikaans',
    lang_en: 'Engels',
    lang_af: 'Afrikaans',
    chip_auto: 'Outo',
    heard_in: 'Gehoor in {lang}',
    heard_mixed: 'Engels + Afrikaans gehoor',
    reading: 'Lees…',
    filled: 'Ingevul',
    check_this: 'Kyk gerus',
    didnt_catch: 'Nie verstaan nie:',
    replace_q: 'Vervang {n} velde?',
    replace_q1: 'Vervang 1 veld?',
    replace: 'Vervang',
    keep: 'Hou myne',
    undo: 'Ontdoen',
    undone: 'Terug na wat jy gehad het',
    abnormal: 'Abnormale vrag',
    no_speech: 'Niks gehoor nie — probeer weer, bietjie nader aan die mikrofoon.',
    too_long: 'Gestop by 1 minuut',
    mic_denied: 'Mikrofoontoestemming is nodig om op te neem',
    placeholder: 'Beskryf die vrag, bv. 28 ton staalrolle Joburg na Durban',
    describe: 'Beskryf die vrag',
    fill: 'Vul in uit beskrywing',
    record: 'Neem stembeskrywing op',
    stop: 'Stop opname',
    cancel: 'Kanselleer',
    left: 'nog {s} s',
    hint: 'Sê die roete, vrag en wanneer',
    voice_language: 'Taal: {lang}. Tik om te verander.',
    pick_truck: '{hint}? Kies ’n trok',
    nights: '{n} nagte weg — Pas toe',
    night: '1 nag weg — Pas toe',
    diesel: '{fuel} R {price}/L — Gebruik vir hierdie kwotasie',
    via: 'Via {post}',
    cross_border: 'Oorgrens',
    from: 'Van {a}',
    to: 'Na {a}',
    via_stops: 'via {s}',
    one_way: 'Eenrigting',
    round_trip: 'Gelaai albei kante',
    back_empty: 'leeg terug',
    back_loaded: 'terugvrag bespreek',
    pickup_on: 'Oplaai {d}',
    delivery_on: 'Aflewering {d}',
    valid_on: 'Geldig tot {d}',
    a11y_filled: 'ingevul',
    upload_too_big: 'Die opname is te lank. Hou dit onder ’n minuut.',
    upload_rejected: 'Kon nie die opname lees nie. Probeer weer.',
    voice_off: 'Stem is nou nie beskikbaar nie. Tik eerder die vrag.',
    voice_failed: 'Kon dit nie mooi hoor nie. Probeer weer.',
    filled_default: 'Ingevul uit jou beskrywing.',
  },
} as const;

export type CopyKey = keyof (typeof COPY)['en'];

export function t(lang: UiLang, key: CopyKey, vars: Record<string, string | number> = {}): string {
  let s: string = COPY[lang][key];
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

/** Afrikaans UI only when the last voice/chat response was Afrikaans. */
export const uiLangOf = (language: unknown): UiLang => (language === 'af' ? 'af' : 'en');

export const nextLangPref = (p: VoiceLangPref): VoiceLangPref =>
  p === 'auto' ? 'en' : p === 'en' ? 'af' : 'auto';

export const asLangPref = (v: unknown): VoiceLangPref => (v === 'en' || v === 'af' ? v : 'auto');

export const langPrefLabel = (p: VoiceLangPref, lang: UiLang): string =>
  p === 'auto' ? t(lang, 'chip_auto') : p === 'en' ? t(lang, 'lang_en') : t(lang, 'lang_af');

/** The line under "Listening…": both languages in Auto, else the forced one. */
export const listeningLine = (p: VoiceLangPref, lang: UiLang): string =>
  p === 'auto' ? t(lang, 'lang_auto') : p === 'en' ? t(lang, 'lang_en') : t(lang, 'lang_af');

/** "10 s left" from 50 s; null before that. */
export function remainingLabel(elapsedMs: number, lang: UiLang): string | null {
  if (elapsedMs < WARN_FROM_MS) return null;
  const s = Math.max(0, Math.ceil((MAX_RECORD_MS - elapsedMs) / 1000));
  return t(lang, 'left', { s });
}

// ── Voice response ──────────────────────────────────────────────────────────

export interface VoiceResult {
  text: string;
  detectedLanguage: string | null;
  languageLabel: string | null;
  languageConfidence: 'high' | 'low' | 'chosen' | null;
  alternateText: string | null;
}

const s = (v: unknown): string => (typeof v === 'string' ? v : '');

export function readVoiceResult(res: unknown): VoiceResult {
  const r = (res ?? {}) as Record<string, unknown>;
  const conf = r.language_confidence;
  const alt = (r.alternate ?? null) as Record<string, unknown> | null;
  const altText = alt && typeof alt === 'object' ? s(alt.text).trim() : '';
  return {
    text: (s(r.text) || s(r.transcription)).trim(),
    detectedLanguage: s(r.detected_language) || null,
    languageLabel: s(r.language_label) || null,
    languageConfidence: conf === 'high' || conf === 'low' || conf === 'chosen' ? conf : null,
    alternateText: altText || null,
  };
}

/** "Heard in Afrikaans", or the mixed badge when EN and AF scored close. Null on an old backend. */
export function heardBadge(v: VoiceResult, lang: UiLang): string | null {
  if (v.languageConfidence === 'low') return t(lang, 'heard_mixed');
  if (!v.languageLabel) return null;
  const label =
    v.detectedLanguage === 'af'
      ? t(lang, 'lang_af')
      : v.detectedLanguage === 'en'
        ? t(lang, 'lang_en')
        : v.languageLabel;
  return t(lang, 'heard_in', { lang: label });
}

/**
 * The voice error to show. English uses the backend's own plain message; in
 * Afrikaans it is mapped by HTTP status (the backend's voice errors are English).
 */
export function voiceErrorText(status: number | undefined, serverMsg: string, lang: UiLang): string {
  if (lang === 'en') {
    if (serverMsg && !/^Request failed/.test(serverMsg)) return serverMsg;
    return status === 422 ? t('en', 'no_speech') : t('en', 'voice_failed');
  }
  switch (status) {
    case 422:
      return t('af', 'no_speech');
    case 413:
      return t('af', 'upload_too_big');
    case 400:
    case 502:
      return t('af', 'upload_rejected');
    case 503:
      return t('af', 'voice_off');
    default:
      return t('af', 'voice_failed');
  }
}

// ── Chat response ───────────────────────────────────────────────────────────

export type TripType = 'ONE_WAY' | 'ROUND_TRIP';

/** What the response asks the form to become. Absent = leave alone. */
export interface Extracted {
  pickupLocation?: string;
  deliveryLocation?: string;
  stops?: string[];
  /** The UI field is tons; the backend sends kg. */
  weightTons?: number;
  cargo?: string;
  vehicleType?: string;
  customerId?: string;
  customerName?: string;
  pickupDate?: string;
  deliveryDate?: string;
  validUntil?: string;
  tripType?: TripType;
  returnLoadBooked?: boolean;
  abnormalLoad?: boolean;
  international?: boolean;
  borderPost?: string;
  driverNights?: number;
  fuelPriceOverride?: number;
}

export interface ChatResult {
  extracted: Extracted;
  confidence: Record<string, number>;
  notUnderstood: string[];
  language: string | null;
  vehicleHint: string | null;
  reply: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const iso = (v: unknown) => (typeof v === 'string' && ISO.test(v) ? v : undefined);
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const pos = (v: unknown) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
const bool = (v: unknown) => (typeof v === 'boolean' ? v : undefined);

export function readChatResult(res: unknown): ChatResult {
  const r = (res ?? {}) as Record<string, unknown>;
  const ex = (r.extracted_fields && typeof r.extracted_fields === 'object'
    ? r.extracted_fields
    : {}) as Record<string, unknown>;
  const kg = pos(ex.weight);
  const tt = s(ex.trip_type).toUpperCase();
  const stops = Array.isArray(ex.stops)
    ? ex.stops.map((x) => text(x)).filter((x): x is string => !!x)
    : [];
  const nights = pos(ex.driver_nights);
  const extracted: Extracted = {
    pickupLocation: text(ex.pickup_location),
    deliveryLocation: text(ex.delivery_location),
    stops: stops.length ? stops : undefined,
    weightTons: kg ? Math.round((kg / 1000) * 100) / 100 : undefined,
    cargo: text(ex.cargo_description),
    vehicleType: text(ex.vehicle_type),
    customerId: ex.customer_id != null && ex.customer_id !== '' ? String(ex.customer_id) : undefined,
    customerName: text(ex.customer_name),
    // trip_date is always the pickup date.
    pickupDate: iso(ex.pickup_date) ?? iso(ex.trip_date),
    deliveryDate: iso(ex.delivery_date),
    validUntil: iso(ex.valid_until),
    tripType: tt === 'ONE_WAY' || tt === 'ROUND_TRIP' ? tt : undefined,
    returnLoadBooked: bool(ex.return_load_booked),
    abnormalLoad: bool(ex.abnormal_load),
    international: bool(ex.international),
    borderPost: text(ex.border_post),
    driverNights: nights ? Math.round(nights) : undefined,
    fuelPriceOverride: pos(ex.fuel_price_override),
  };
  for (const k of Object.keys(extracted) as (keyof Extracted)[])
    if (extracted[k] === undefined) delete extracted[k];

  const confidence: Record<string, number> = {};
  const fc = r.field_confidence;
  if (fc && typeof fc === 'object')
    for (const [k, v] of Object.entries(fc as Record<string, unknown>))
      if (typeof v === 'number' && Number.isFinite(v)) confidence[k] = v;

  const nu = Array.isArray(r.not_understood)
    ? r.not_understood.map((x) => text(x)).filter((x): x is string => !!x).slice(0, 5)
    : [];
  return {
    extracted,
    confidence,
    notUnderstood: nu,
    language: s(r.language) || null,
    vehicleHint: text(r.vehicle_hint) ?? null,
    reply: s(r.reply).trim(),
  };
}

/** "Didn't catch: a; b", or null when everything was understood. */
export const didntCatchLine = (items: string[], lang: UiLang): string | null =>
  items.length ? `${t(lang, 'didnt_catch')} ${items.join('; ')}` : null;

/** The border line's hint: the part of a BORDER_POSTS name before " / ". */
export const borderPostShort = (post: string): string => post.split(' / ')[0]!.trim();

const HINT_NAMES: Record<string, string> = {
  interlink: 'Superlink',
  tautliner: 'Tautliner',
  reefer: 'Reefer',
  tipper: 'Tipper',
  flatbed: 'Flatbed',
  tanker: 'Tanker',
  lowbed: 'Lowbed',
  ldv: 'Bakkie',
  semi: 'Semi',
  rigid: 'Rigid',
};

/** "Superlink? Pick a truck" — the spoken truck matched nothing in the fleet. */
export const vehicleHintLabel = (hint: string, lang: UiLang): string =>
  t(lang, 'pick_truck', { hint: HINT_NAMES[hint.toLowerCase()] ?? hint });

// ── Formatting ──────────────────────────────────────────────────────────────

const MONTHS: Record<UiLang, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  af: ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des'],
};

/** "9 Oct" / "9 Okt" from an ISO date. */
export function shortDate(isoDate: string, lang: UiLang): string {
  if (!ISO.test(isoDate)) return isoDate;
  const [, m, d] = isoDate.split('-').map(Number);
  return `${d} ${MONTHS[lang][(m ?? 1) - 1]}`;
}

/** SA decimal comma, at most 2 places, no trailing zeros: 28, 1,5. */
export const plainNumber = (n: number): string =>
  String(Math.round(n * 100) / 100).replace('.', ',');

export const tonsLabel = (tons: number): string => `${plainNumber(tons)} t`;

/** "Johannesburg, Gauteng, South Africa" → "Johannesburg". */
export const placeShort = (label: string): string => label.split(',')[0]!.trim();

export const nightsLabel = (n: number, lang: UiLang): string =>
  n === 1 ? t(lang, 'night') : t(lang, 'nights', { n });

export const dieselLabel = (price: number, fuel: string, lang: UiLang): string =>
  t(lang, 'diesel', { fuel: fuel || 'Diesel', price: price.toFixed(2).replace('.', ',') });

// ── Confirm before overwriting (spec §4) ────────────────────────────────────

/** Every form field a Fill can set. Stops are append-only and never conflict. */
export type FillKey =
  | 'pickup'
  | 'delivery'
  | 'weight'
  | 'cargo'
  | 'vehicle'
  | 'client'
  | 'pickupDate'
  | 'deliveryDate'
  | 'validUntil'
  | 'tripType'
  | 'returnLoad'
  | 'abnormal';

/** A field's value as compared (`value`, '' = empty) and as shown (`display`). */
export interface FieldVal {
  value: string;
  display: string;
  /** Places: two spellings of the same place resolve to the same point. */
  lat?: number;
  lon?: number;
}

export interface FieldChange {
  key: FillKey;
  from: FieldVal;
  to: FieldVal;
  /** field_confidence < 0.7: the chip and the field say "Check this". */
  low: boolean;
}

export interface FillPlan {
  /** Applied straight away: the field was empty, a default, or set by an earlier Fill. */
  apply: FieldChange[];
  /** The person typed or picked something else here: ask first. */
  conflicts: FieldChange[];
}

/** The response's own name for each field, for field_confidence. */
export const CONFIDENCE_KEYS: Record<FillKey, string[]> = {
  pickup: ['pickup_location'],
  delivery: ['delivery_location'],
  weight: ['weight'],
  cargo: ['cargo_description'],
  vehicle: ['vehicle_type'],
  client: ['customer_id', 'customer_name'],
  pickupDate: ['pickup_date', 'trip_date'],
  deliveryDate: ['delivery_date'],
  validUntil: ['valid_until'],
  tripType: ['trip_type'],
  returnLoad: ['return_load_booked'],
  abnormal: ['abnormal_load'],
};

export function isLow(key: FillKey | 'stops', confidence: Record<string, number>): boolean {
  const names = key === 'stops' ? ['stops'] : CONFIDENCE_KEYS[key];
  return names.some((n) => typeof confidence[n] === 'number' && confidence[n]! < LOW_CONFIDENCE);
}

const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ');

/** Same value — or, for places, within ~1 km ("Kaapstad" and "Cape Town"). */
export function sameField(a: FieldVal, b: FieldVal): boolean {
  if (norm(a.value) === norm(b.value)) return true;
  if (a.lat != null && a.lon != null && b.lat != null && b.lon != null)
    return Math.abs(a.lat - b.lat) < 0.01 && Math.abs(a.lon - b.lon) < 0.01;
  return false;
}

export function planFill({
  proposed,
  current,
  aiWritten,
  defaults = {},
  confidence = {},
}: {
  proposed: Partial<Record<FillKey, FieldVal>>;
  current: Partial<Record<FillKey, FieldVal>>;
  /** What earlier Fills wrote; a field still holding it counts as AI-set. */
  aiWritten: Partial<Record<FillKey, string>>;
  /** Values the form starts with (tomorrow's pickup, one way): never "typed". */
  defaults?: Partial<Record<FillKey, string>>;
  confidence?: Record<string, number>;
}): FillPlan {
  const plan: FillPlan = { apply: [], conflicts: [] };
  for (const key of Object.keys(proposed) as FillKey[]) {
    const to = proposed[key];
    if (!to || !to.value) continue;
    const from = current[key] ?? { value: '', display: '' };
    if (sameField(from, to)) continue;
    const change: FieldChange = { key, from, to, low: isLow(key, confidence) };
    const empty = !from.value || (defaults[key] != null && norm(from.value) === norm(defaults[key]!));
    const aiSet = aiWritten[key] != null && norm(aiWritten[key]!) === norm(from.value);
    (empty || aiSet ? plan.apply : plan.conflicts).push(change);
  }
  return plan;
}

/** Replace: the conflicts are applied too. Keep mine: they are dropped. */
export const resolveConflicts = (plan: FillPlan, choice: 'replace' | 'keep'): FieldChange[] =>
  choice === 'replace' ? [...plan.conflicts] : [];

const FIELD_NAMES: Record<UiLang, Record<FillKey, string>> = {
  en: {
    pickup: 'Collection',
    delivery: 'Delivery',
    weight: 'Weight',
    cargo: 'Cargo',
    vehicle: 'Truck',
    client: 'Client',
    pickupDate: 'Pickup date',
    deliveryDate: 'Delivery date',
    validUntil: 'Valid until',
    tripType: 'Trip',
    returnLoad: 'Truck comes back',
    abnormal: 'Abnormal load',
  },
  af: {
    pickup: 'Oplaai',
    delivery: 'Aflewering',
    weight: 'Gewig',
    cargo: 'Vrag',
    vehicle: 'Trok',
    client: 'Kliënt',
    pickupDate: 'Oplaaidatum',
    deliveryDate: 'Afleweringsdatum',
    validUntil: 'Geldig tot',
    tripType: 'Rit',
    returnLoad: 'Trok kom terug',
    abnormal: 'Abnormale vrag',
  },
};

export const fieldName = (key: FillKey, lang: UiLang) => FIELD_NAMES[lang][key];

/** "Replace 2 fields?" and "Weight 20 t → 28 t · Delivery Cape Town → Durban". */
export function conflictSummary(conflicts: FieldChange[], lang: UiLang): { title: string; detail: string } {
  const n = conflicts.length;
  return {
    title: n === 1 ? t(lang, 'replace_q1') : t(lang, 'replace_q', { n }),
    detail: conflicts
      .map((c) => `${fieldName(c.key, lang)} ${c.from.display} → ${c.to.display}`)
      .join(' · '),
  };
}

// ── Chips (spec §3) ─────────────────────────────────────────────────────────

export type ChipGroup = 'route' | 'load' | 'truck' | 'client' | 'dates' | 'trip' | 'border';
const GROUP_ORDER: ChipGroup[] = ['route', 'load', 'truck', 'client', 'dates', 'trip', 'border'];
const GROUP_NAMES: Record<UiLang, Record<ChipGroup, string>> = {
  en: { route: 'Route', load: 'Load', truck: 'Truck', client: 'Client', dates: 'Dates', trip: 'Trip', border: 'Border' },
  af: { route: 'Roete', load: 'Vrag', truck: 'Trok', client: 'Kliënt', dates: 'Datums', trip: 'Rit', border: 'Grens' },
};

export interface FillChip {
  group: ChipGroup;
  /** The fields behind it (for "Check this" on the field, and to scroll to it). */
  keys: FillKey[];
  label: string;
  low: boolean;
  /** "Load 28 t steel coils, filled, check this". */
  a11y: string;
}

/**
 * One chip per group this Fill actually set, in the spec's order. `changes`
 * are the fields applied (not the conflicts kept); `stops` the stop names
 * appended; `border` the cross-border extras that were taken on.
 */
export function buildChips(
  changes: FieldChange[],
  lang: UiLang,
  extra: { stops?: string[]; stopsLow?: boolean; borderPost?: string; international?: boolean } = {},
): FillChip[] {
  const by = new Map<FillKey, FieldChange>(changes.map((c) => [c.key, c]));
  const get = (k: FillKey) => by.get(k);
  const parts: Partial<Record<ChipGroup, { label: string; keys: FillKey[]; low: boolean }>> = {};
  const add = (g: ChipGroup, label: string, keys: FillKey[], lowExtra = false) => {
    if (!label) return;
    parts[g] = { label, keys, low: keys.some((k) => get(k)?.low) || lowExtra };
  };

  const p = get('pickup');
  const d = get('delivery');
  const via = extra.stops?.length ? ` ${t(lang, 'via_stops', { s: extra.stops.map(placeShort).join(', ') })}` : '';
  if (p || d || via) {
    const a = p ? placeShort(p.to.display) : '';
    const b = d ? placeShort(d.to.display) : '';
    const route = a && b ? `${a} → ${b}` : a ? t(lang, 'from', { a }) : b ? t(lang, 'to', { a: b }) : '';
    add('route', `${route}${via}`.trim(), [...(p ? ['pickup' as const] : []), ...(d ? ['delivery' as const] : [])], !!extra.stopsLow);
  }

  const w = get('weight');
  const c = get('cargo');
  if (w || c) add('load', [w?.to.display, c?.to.display.toLowerCase()].filter(Boolean).join(' '), [...(w ? ['weight' as const] : []), ...(c ? ['cargo' as const] : [])]);

  const v = get('vehicle');
  if (v) add('truck', v.to.display, ['vehicle']);
  const cl = get('client');
  if (cl) add('client', cl.to.display, ['client']);

  const dateKeys = (['pickupDate', 'deliveryDate', 'validUntil'] as FillKey[]).filter((k) => get(k));
  if (dateKeys.length) {
    const key = { pickupDate: 'pickup_on', deliveryDate: 'delivery_on', validUntil: 'valid_on' } as const;
    add(
      'dates',
      dateKeys.map((k) => t(lang, key[k as keyof typeof key], { d: get(k)!.to.display })).join(' · '),
      dateKeys,
    );
  }

  const tt = get('tripType');
  const rl = get('returnLoad');
  if (tt || rl) {
    const shape = tt ? (tt.to.value === 'ROUND_TRIP' ? t(lang, 'round_trip') : t(lang, 'one_way')) : '';
    const back = rl ? (rl.to.value === 'yes' ? t(lang, 'back_loaded') : t(lang, 'back_empty')) : '';
    const label = shape && back ? `${shape}, ${back}` : shape || back.charAt(0).toUpperCase() + back.slice(1);
    add('trip', label, [...(tt ? ['tripType' as const] : []), ...(rl ? ['returnLoad' as const] : [])]);
  }

  const ab = get('abnormal');
  const borderBits = [
    ab && ab.to.value === 'yes' ? t(lang, 'abnormal') : '',
    extra.borderPost ? t(lang, 'via', { post: borderPostShort(extra.borderPost) }) : extra.international ? t(lang, 'cross_border') : '',
  ].filter(Boolean);
  const abOff = ab && ab.to.value !== 'yes' ? `${t(lang, 'abnormal')}: ${lang === 'af' ? 'nee' : 'no'}` : '';
  if (borderBits.length || ab) add('border', borderBits.join(' · ') || abOff, ab ? ['abnormal'] : []);

  return GROUP_ORDER.filter((g) => parts[g]).map((g) => {
    const x = parts[g]!;
    const a11y = [`${GROUP_NAMES[lang][g]} ${x.label}`, t(lang, 'a11y_filled'), ...(x.low ? [t(lang, 'check_this').toLowerCase()] : [])].join(', ');
    return { group: g, keys: x.keys, label: x.label, low: x.low, a11y };
  });
}
