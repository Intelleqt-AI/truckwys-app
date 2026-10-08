import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readChatResult,
  readVoiceResult,
  heardBadge,
  voiceErrorText,
  planFill,
  resolveConflicts,
  conflictSummary,
  buildChips,
  didntCatchLine,
  remainingLabel,
  listeningLine,
  nextLangPref,
  asLangPref,
  vehicleHintLabel,
  borderPostShort,
  shortDate,
  uiLangOf,
} from '../nlFill.ts';

test('field mapping: new keys, kg to tons, trip_date as the pickup date', () => {
  const r = readChatResult({
    extracted_fields: {
      pickup_location: 'Johannesburg',
      delivery_location: 'Durban',
      weight: 28000,
      cargo_description: 'Staalrolle',
      stops: ['Upington', '', 3],
      trip_type: 'one_way',
      return_load_booked: false,
      abnormal_load: true,
      international: true,
      border_post: 'Oshoek / Ngwenya',
      trip_date: '2026-10-09',
      driver_nights: 2,
      fuel_price_override: 23.5,
      customer_id: 17,
    },
    field_confidence: { weight: 0.95, pickup_location: 0.6, junk: 'x' },
    not_understood: ['number 28 — tons or kg?', '', 'a', 'b', 'c', 'd', 'e'],
    language: 'af',
    vehicle_hint: 'interlink',
    reply: 'Ingevul: 28 t staalrolle',
  });
  assert.deepEqual(r.extracted, {
    pickupLocation: 'Johannesburg',
    deliveryLocation: 'Durban',
    stops: ['Upington'],
    weightTons: 28,
    cargo: 'Staalrolle',
    customerId: '17',
    pickupDate: '2026-10-09',
    tripType: 'ONE_WAY',
    returnLoadBooked: false,
    abnormalLoad: true,
    international: true,
    borderPost: 'Oshoek / Ngwenya',
    driverNights: 2,
    fuelPriceOverride: 23.5,
  });
  assert.deepEqual(r.confidence, { weight: 0.95, pickup_location: 0.6 });
  assert.equal(r.notUnderstood.length, 5);
  assert.equal(r.language, 'af');
  assert.equal(r.vehicleHint, 'interlink');
  assert.equal(uiLangOf(r.language), 'af');
});

test('field mapping: an old backend response fills only what it sent', () => {
  const r = readChatResult({ extracted_fields: { weight: 1500, pickup_date: 'tomorrow' }, reply: 'ok' });
  assert.deepEqual(r.extracted, { weightTons: 1.5 });
  assert.deepEqual(r.confidence, {});
  assert.deepEqual(r.notUnderstood, []);
  assert.equal(r.vehicleHint, null);
  assert.equal(r.language, null);
  assert.deepEqual(readChatResult(null).extracted, {});
  // pickup_date wins over trip_date when both are sent.
  assert.equal(
    readChatResult({ extracted_fields: { pickup_date: '2026-10-10', trip_date: '2026-10-09' } }).extracted.pickupDate,
    '2026-10-10',
  );
});

test('voice result: badge, mixed badge, alternate text, old backend', () => {
  const af = readVoiceResult({
    text: ' 28 ton staalrolle ',
    detected_language: 'af',
    language_label: 'Afrikaans',
    language_confidence: 'high',
    alternate: { language: 'en', text: '28 tons steel coils' },
  });
  assert.equal(af.text, '28 ton staalrolle');
  assert.equal(af.alternateText, '28 tons steel coils');
  assert.equal(heardBadge(af, 'en'), 'Heard in Afrikaans');
  assert.equal(heardBadge(af, 'af'), 'Gehoor in Afrikaans');
  const mixed = { ...af, languageConfidence: 'low' };
  assert.equal(heardBadge(mixed, 'en'), 'Heard in English + Afrikaans');
  assert.equal(heardBadge(mixed, 'af'), 'Engels + Afrikaans gehoor');
  const old = readVoiceResult({ transcription: 'Joburg to Durban' });
  assert.equal(old.text, 'Joburg to Durban');
  assert.equal(old.alternateText, null);
  assert.equal(heardBadge(old, 'en'), null);
  assert.equal(readVoiceResult({ text: 'x', alternate: null }).alternateText, null);
});

test('voice errors: English keeps the server message, Afrikaans maps by status', () => {
  assert.equal(voiceErrorText(413, 'Too long', 'en'), 'Too long');
  assert.equal(voiceErrorText(500, 'Request failed (500)', 'en'), "Couldn't hear that properly. Try again.");
  assert.match(voiceErrorText(422, "Didn't catch any speech", 'af'), /^Niks gehoor nie/);
  assert.match(voiceErrorText(503, 'Voice not configured', 'af'), /nie beskikbaar nie/);
});

test('mic copy: language line, chip cycle, remaining time from 50 s', () => {
  assert.equal(listeningLine('auto', 'en'), 'English or Afrikaans');
  assert.equal(listeningLine('auto', 'af'), 'Engels of Afrikaans');
  assert.equal(listeningLine('af', 'en'), 'Afrikaans');
  assert.equal(nextLangPref('auto'), 'en');
  assert.equal(nextLangPref('en'), 'af');
  assert.equal(nextLangPref('af'), 'auto');
  assert.equal(asLangPref('garbage'), 'auto');
  assert.equal(remainingLabel(49_999, 'en'), null);
  assert.equal(remainingLabel(50_000, 'en'), '10 s left');
  assert.equal(remainingLabel(59_100, 'af'), 'nog 1 s');
});

const v = (value, display = value, extra = {}) => ({ value, display, ...extra });

test('overwrite: empty, default and AI-set fields fill; a typed value asks first', () => {
  const plan = planFill({
    proposed: {
      weight: v('28', '28 t'),
      cargo: v('steel coils', 'Steel coils'),
      pickupDate: v('2026-10-09'),
      delivery: v('durban', 'Durban'),
      tripType: v('ONE_WAY'),
    },
    current: {
      weight: v('20', '20 t'),
      cargo: v(''),
      pickupDate: v('2026-10-09'),
      delivery: v('cape town', 'Cape Town'),
      tripType: v('ONE_WAY'),
    },
    aiWritten: {},
    defaults: { pickupDate: '2026-10-09', tripType: 'ONE_WAY' },
    confidence: { cargo_description: 0.5 },
  });
  assert.deepEqual(plan.apply.map((c) => c.key), ['cargo']);
  assert.equal(plan.apply[0].low, true);
  assert.deepEqual(plan.conflicts.map((c) => c.key), ['weight', 'delivery']);
  const sum = conflictSummary(plan.conflicts, 'en');
  assert.equal(sum.title, 'Replace 2 fields?');
  assert.equal(sum.detail, 'Weight 20 t → 28 t · Delivery Cape Town → Durban');
  assert.equal(conflictSummary(plan.conflicts, 'af').title, 'Vervang 2 velde?');
  assert.equal(conflictSummary(plan.conflicts.slice(0, 1), 'en').title, 'Replace 1 field?');
  // Keep mine leaves the typed weight; Replace takes both.
  assert.deepEqual(resolveConflicts(plan, 'keep'), []);
  assert.deepEqual(resolveConflicts(plan, 'replace').map((c) => c.key), ['weight', 'delivery']);
});

test('overwrite: a follow-up correction replaces what the last Fill wrote, without asking', () => {
  const plan = planFill({
    proposed: { weight: v('30', '30 t') },
    current: { weight: v('28', '28 t') },
    aiWritten: { weight: '28' },
  });
  assert.deepEqual(plan.apply.map((c) => c.key), ['weight']);
  assert.equal(plan.conflicts.length, 0);
  // ...but once the person edits it, it is theirs again.
  const edited = planFill({
    proposed: { weight: v('30', '30 t') },
    current: { weight: v('25', '25 t') },
    aiWritten: { weight: '28' },
  });
  assert.deepEqual(edited.conflicts.map((c) => c.key), ['weight']);
});

test('overwrite: the same place written two ways is not a conflict, nor an unchanged value', () => {
  const plan = planFill({
    proposed: {
      delivery: v('cape town, western cape', 'Cape Town', { lat: -33.9249, lon: 18.4241 }),
      weight: v('20', '20 t'),
    },
    current: {
      delivery: v('kaapstad', 'Kaapstad', { lat: -33.925, lon: 18.424 }),
      weight: v('20', '20 t'),
    },
    aiWritten: {},
  });
  assert.equal(plan.apply.length, 0);
  assert.equal(plan.conflicts.length, 0);
});

test('chips: spec order, short wording, check this, and labels for the screen reader', () => {
  const ch = (key, to, low = false) => ({ key, from: v(''), to, low });
  const chips = buildChips(
    [
      ch('tripType', v('ONE_WAY')),
      ch('returnLoad', v('no')),
      ch('weight', v('28', '28 t'), true),
      ch('cargo', v('steel coils', 'Steel coils')),
      ch('pickupDate', v('2026-10-09', shortDate('2026-10-09', 'en'))),
      ch('pickup', v('johannesburg', 'Johannesburg, Gauteng')),
      ch('delivery', v('durban', 'Durban, KwaZulu-Natal')),
      ch('abnormal', v('yes')),
    ],
    'en',
    { borderPost: 'Beitbridge' },
  );
  assert.deepEqual(chips.map((c) => c.group), ['route', 'load', 'dates', 'trip', 'border']);
  assert.deepEqual(chips.map((c) => c.label), [
    'Johannesburg → Durban',
    '28 t steel coils',
    'Pickup 9 Oct',
    'One way, back empty',
    'Abnormal load · Via Beitbridge',
  ]);
  assert.equal(chips[1].low, true);
  assert.equal(chips[1].a11y, 'Load 28 t steel coils, filled, check this');
  assert.equal(chips[0].a11y, 'Route Johannesburg → Durban, filled');

  const af = buildChips([ch('tripType', v('ONE_WAY')), ch('returnLoad', v('no'))], 'af', { stops: ['Upington'] });
  assert.deepEqual(af.map((c) => c.label), ['via Upington', 'Eenrigting, leeg terug']);
  assert.equal(buildChips([], 'en').length, 0);
});

test('chips: other lines', () => {
  assert.equal(didntCatchLine([], 'en'), null);
  assert.equal(didntCatchLine(['number 28 — tons or kg?'], 'en'), "Didn't catch: number 28 — tons or kg?");
  assert.equal(didntCatchLine(['a', 'b'], 'af'), 'Nie verstaan nie: a; b');
  assert.equal(vehicleHintLabel('interlink', 'en'), 'Superlink? Pick a truck');
  assert.equal(vehicleHintLabel('interlink', 'af'), 'Superlink? Kies ’n trok');
  assert.equal(borderPostShort('Trans-Kalahari: Mamuno / Buitepos'), 'Trans-Kalahari: Mamuno');
  assert.equal(shortDate('2026-10-09', 'af'), '9 Okt');
});

test('chips: an abnormal load off a Zimbabwe route is only noted', () => {
  const ab = [{ key: 'abnormal', from: v('no'), to: v('yes'), low: false }];
  assert.equal(buildChips(ab, 'en', { zimbabwe: false })[0].label, 'Abnormal load noted (affects Zimbabwe border tolls only)');
  assert.equal(buildChips(ab, 'en', { zimbabwe: true })[0].label, 'Abnormal load');
  assert.match(buildChips(ab, 'af', { zimbabwe: false })[0].label, /^Abnormale vrag genoteer/);
});
