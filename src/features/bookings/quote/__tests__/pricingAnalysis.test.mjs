// The pricing analysis: request, adapter, live reading and the saved
// pricing_decision (ports of the web's components/pricing types + evaluate).
//   node --experimental-strip-types --test src/features/bookings/quote/__tests__/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  adaptAnalysis,
  buildRequest,
  likelihoodAt,
  pricingDecision,
  readPrice,
  rowLikelihoods,
  wayOutChoice,
  signedPct,
  lkTone,
  likelihoodShort,
} from '../pricing/analysis.ts';
import { pricingFlags } from '../pricing/flags.ts';

const RAW = {
  success: true,
  version: 'pa-3',
  cost_floor: {
    total: 20000,
    per_km: 12.5,
    include_return: false,
    lines: [
      { key: 'fuel', label: 'Fuel', amount: 9000, source: { kind: 'official', label: 'Official diesel', url: 'https://example.com/p' } },
      { key: 'tolls', label: 'Tolls', amount: 3000, source: { kind: 'calculated' } },
      { key: 'driver_allowance', label: 'Driver allowance', amount: 0, nights: 2, suggested: null, source: { kind: 'estimate' } },
      { key: 'fixed_cost', label: 'Operating costs', amount: 8000, source: { kind: 'company_actuals' } },
    ],
  },
  market: { available: true, tier: 'platform', tier_label: 'TruckWys platform', n: 14, p25: 23000, median: 25000, p75: 27000 },
  choices: [
    { key: 'safe', label: 'Safe', price: 23000.4, margin: 3000, margin_pct: 13.04, recommended: false, likelihood: { level: 'model', pct: 71.6 } },
    { key: 'balanced', label: 'Balanced', price: 25000, margin: 5000, margin_pct: 20, recommended: true, likelihood: { level: 'model', pct: 55 } },
    { key: 'stretch', label: 'Stretch', price: 28000, margin: 8000, margin_pct: 28.6, recommended: false, likelihood: { level: 'rules', band: 'less_likely', outside_model_range: true } },
    { key: 'bogus', label: 'Bogus', price: 1 },
    { key: 'safe', label: 'Free', price: 0 },
  ],
  likelihood: {
    level: 'model',
    model: {
      version: 'm-7',
      n_closed: 120,
      basis_label: '120 closed quotes',
      range: [20000, 27000],
      curve: [
        { price: 27000, pct: 40 },
        { price: 20000, pct: 90 },
        { price: 23500, pct: 70 },
      ],
    },
    rules: { thresholds: { likely_max: 24000, even_max: 26500 }, basis: ['market median'] },
  },
  recommendation: { key: 'balanced', reason: 'Middle of the market' },
  target_margin: { pct: 15, source: 'company' },
  customer: { name: 'Acme', acceptance: { won: 3, decided: 5, rate_pct: 60 } },
  return_load_history: { text: ' On this lane 60% of your trips found a return load (3 of 5). ' },
};

test('adaptAnalysis keeps only real choices and reads the floor, market and customer', () => {
  const a = adaptAnalysis(RAW);
  assert.ok(a);
  assert.equal(a.version, 'pa-3');
  assert.deepEqual(a.choices.map((c) => c.key), ['safe', 'balanced', 'stretch']);
  assert.equal(a.costFloor.total, 20000);
  assert.equal(a.costFloor.lines.length, 4);
  assert.equal(a.costFloor.lines[0].source.url, 'https://example.com/p');
  assert.equal(a.market.available, true);
  assert.equal(a.market.isEstimate, false);
  assert.equal(a.targetMarginPct, 15);
  assert.equal(a.customer.acceptance.won, 3);
  assert.equal(a.returnLoadHistory, 'On this lane 60% of your trips found a return load (3 of 5).');
  assert.equal(adaptAnalysis({ success: false }), null);
  assert.equal(adaptAnalysis(null), null);
});

test('a driver line with nights and no approved rate needs input; a model curve is sorted', () => {
  const a = adaptAnalysis(RAW);
  assert.equal(a.costFloor.lines[2].needsInput, true);
  assert.equal(a.costFloor.lines[0].needsInput, false);
  assert.deepEqual(a.likelihood.model.curve.map((p) => p.price), [20000, 23500, 27000]);
  assert.equal(a.likelihood.level, 'model');
});

test('model level needs a real curve, else it is rules; only https links survive', () => {
  const a = adaptAnalysis({
    ...RAW,
    likelihood: { level: 'model', model: { range: [1, 2], curve: [{ price: 1, pct: 1 }] }, rules: { thresholds: { likely_max: 1, even_max: 2 } } },
  });
  assert.equal(a.likelihood.level, 'rules');
  const b = adaptAnalysis({ ...RAW, cost_floor: { total: 5, lines: [{ key: 'fuel', source: { kind: 'official', url: 'http://insecure.example' } }] } });
  assert.equal(b.costFloor.lines[0].source.url, null);
});

test('no recommendation from the server means nothing is "Recommended"', () => {
  const a = adaptAnalysis({ ...RAW, recommendation: { key: null } });
  assert.equal(a.choices.some((c) => c.recommended), false);
  const b = adaptAnalysis({ ...RAW, recommendation: null });
  assert.equal(b.choices.some((c) => c.recommended), false);
});

test('estimate tier is always an estimate, and a market with no median is not available', () => {
  const a = adaptAnalysis({ ...RAW, market: { available: true, tier: 'estimate', median: 30000, p25: 1, p75: 2, is_estimate: false } });
  assert.equal(a.market.isEstimate, true);
  const b = adaptAnalysis({ ...RAW, market: { available: true, tier: 'platform', p25: 1, p75: 2 } });
  assert.equal(b.market.available, false);
});

test('buildRequest maps the builder onto the endpoint, driver override only when typed', () => {
  const base = {
    quoteId: null, customerId: 7, origin: 'JHB', destination: 'DUR', originLabel: 'Johannesburg', destinationLabel: 'Durban',
    distanceKm: 1100.456, oneWayDistanceKm: 550.228, legs: 2, tripType: 'ROUND_TRIP', durationMinutes: 400.4,
    vehicleTypeId: 3, vehicleType: 'Flatbed', weightKg: 20000, fuelType: 'Diesel', fuelZone: 'INLAND',
    fuelCost: 9000.004, fuelLitres: 500.123, fuelPricePerL: 18.5, fuelConsumption: 36.789,
    tollCost: 3000, routePlazas: [{ plaza: 'Heidelberg', tariff: 300 }], countryCodes: ['ZA'],
    crossBorderCost: 0, isInternational: false, pickupDate: '2026-10-20', driverAllowance: null, includeReturn: null, yourPrice: 25000,
    costingFlags: { tolls_unknown: false, abnormal_load: false },
  };
  const r = buildRequest(base);
  assert.equal(r.distance_km, 1100.46);
  assert.equal(r.duration_minutes, 400);
  assert.equal(r.fuel_usage_litres, 500.12);
  assert.equal(r.tolls_unknown, false);
  assert.deepEqual(r.route, { toll_breakdown: [{ plaza: 'Heidelberg', tariff: 300 }], cross_border: false, country_codes: ['ZA'] });
  assert.ok(!('driver_cost' in r));
  assert.ok(!('driver_cost_is_override' in r));
  assert.ok(!('include_return' in r));
  assert.ok(!('fuel_price_source' in r));
  const t = buildRequest({ ...base, driverAllowance: 1200, includeReturn: true, fuelPriceSource: 'own', emptyReturnCost: 800.555, yourPrice: null });
  assert.equal(t.driver_cost, 1200);
  assert.equal(t.driver_cost_is_override, true);
  assert.equal(t.include_return, true);
  assert.equal(t.fuel_price_source, 'own');
  assert.equal(t.empty_return_cost, 800.56);
  assert.equal(t.your_price, null);
});

test('pricingFlags passes the shared flags, drops unknowns, adds the way-home legs', () => {
  const base = {
    tolls_unknown: false, tolls_confirmed_none: false, distance_estimated: false, distance_confirmed: true,
    use_official_fuel: true, border_costs_unknown: null, border_cost_is_override: false, toll_cost_one_way: 1500.004,
    // Not sent by the analysis: the typed-driver flag travels with driver_cost.
    driver_cost_is_override: true, trip_type: 'ONE_WAY', legs: 1, is_international: false,
  };
  const f = pricingFlags(base, {
    fuelPriceOverride: 19.2, includeEmptyReturn: true, tollReturn: null, tollEmptyReturn: 1400, borderEmptyReturn: 0,
    borderEstimate: null, borderEstimateEmptyReturn: 250, abnormalLoad: false,
  });
  assert.equal(f.toll_cost_one_way, 1500);
  assert.equal(f.fuel_price_override, 19.2);
  assert.equal(f.include_empty_return, true);
  assert.equal(f.toll_cost_empty_return, 1400);
  assert.equal(f.cross_border_cost_empty_return, 0);
  assert.equal(f.cross_border_estimate_empty_return_zar, 250);
  assert.equal(f.abnormal_load, false);
  for (const k of ['driver_cost_is_override', 'trip_type', 'legs', 'is_international', 'border_costs_unknown', 'toll_cost_return', 'cross_border_estimate_zar']) {
    assert.ok(!(k in f), k);
  }
  const none = pricingFlags({ toll_cost_one_way: null }, {
    fuelPriceOverride: null, includeEmptyReturn: null, tollReturn: null, tollEmptyReturn: null, borderEmptyReturn: null,
    borderEstimate: null, borderEstimateEmptyReturn: null, abnormalLoad: true,
  });
  assert.deepEqual(none, { abnormal_load: true });
});

test('readPrice: margin on the one floor, a choice only at its exact price', () => {
  const a = adaptAnalysis(RAW);
  const at = readPrice(a, 25000, 20000);
  assert.equal(at.margin, 5000);
  assert.equal(at.marginPct, 20);
  assert.equal(at.matchedChoice, 'balanced');
  assert.deepEqual(at.likelihood, { level: 'model', pct: 55 });
  // R 24 999,99 is a custom price, never "Balanced".
  assert.equal(readPrice(a, 24999.99, 20000).matchedChoice, null);
  const loss = readPrice(a, 19000, 20000);
  assert.equal(loss.belowFloor, true);
  assert.equal(loss.margin, -1000);
  // The analysis' own floor when none is given.
  assert.equal(readPrice(a, 21000).floor, 20000);
  assert.equal(readPrice(a, 21000, null).margin, null);
});

test('likelihoodAt interpolates inside the model range and is a band outside it', () => {
  const a = adaptAnalysis(RAW);
  assert.deepEqual(likelihoodAt(a, 21750), { level: 'model', pct: 80 });
  const out = likelihoodAt(a, 30000);
  assert.equal(out.level, 'rules');
  assert.equal(out.band, 'less_likely');
  assert.equal(out.note, "Outside the prices we've seen you quote");
  assert.equal(likelihoodAt(a, 0), null);
  assert.equal(likelihoodAt(null, 100), null);
});

test('rowLikelihoods shows one format per row: all bands when any choice is a band', () => {
  const a = adaptAnalysis(RAW);
  const rows = rowLikelihoods(a, a.choices);
  assert.deepEqual([...rows.values()].map((l) => l.level), ['rules', 'rules', 'rules']);
  assert.equal(rows.get('safe').band, 'likely');
  assert.equal(rows.get('balanced').band, 'even');
  assert.equal(rows.get('stretch').band, 'less_likely');
  // All model: untouched.
  const m = adaptAnalysis({ ...RAW, choices: RAW.choices.slice(0, 2) });
  assert.deepEqual([...rowLikelihoods(m, m.choices).values()].map((l) => l.pct), [71.6, 55]);
});

test('wayOutChoice is the lowest choice that clears the floor', () => {
  const a = adaptAnalysis(RAW);
  assert.equal(wayOutChoice(a.choices, 24000).key, 'balanced');
  assert.equal(wayOutChoice(a.choices, 99999), null);
  assert.equal(wayOutChoice(a.choices, null), null);
});

// What the backend's validate_pricing_decision accepts (core quote validation).
function backendAccepts(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return false;
  if (JSON.stringify(d).length > 20000) return false; // ASCII: chars are bytes
  if (![null, undefined, '', 'safe', 'balanced', 'stretch', 'custom'].includes(d.picked_choice)) return false;
  if (!Array.isArray(d.floor_lines)) return false;
  if (![null, undefined, '', 'model', 'rules'].includes(d.likelihood_level)) return false;
  for (const k of ['final_price', 'floor', 'likelihood_at_final_pct', 'price_adjustment']) {
    if (d[k] != null && typeof d[k] !== 'number') return false;
  }
  return true;
}

test('pricingDecision: a picked choice carries its own chance; the shape passes the backend check', () => {
  const a = adaptAnalysis(RAW);
  const d = pricingDecision(a, 25000, 'balanced', 120.456);
  assert.ok(backendAccepts(d));
  assert.equal(d.version, 'pa-3');
  assert.equal(d.picked_choice, 'balanced');
  assert.equal(d.final_price, 25000);
  assert.equal(d.floor, 20000);
  assert.equal(d.price_adjustment, 120.46);
  assert.deepEqual(d.shown_choices[0], { key: 'safe', price: 23000, margin_pct: 13, recommended: false, likelihood: { level: 'model', pct: 72 } });
  assert.deepEqual(d.shown_choices[2].likelihood, { level: 'rules', band: 'less_likely' });
  assert.equal(d.shown_choices[1].recommended, true);
  assert.equal(d.likelihood_level, 'model');
  assert.equal(d.likelihood_at_final_pct, 55);
  assert.equal(d.band_at_final, null);
  assert.equal(d.model_version, 'm-7');
  assert.equal(d.n_closed, 120);
  assert.equal(d.basis_label, '120 closed quotes');
  assert.deepEqual(d.market, { p25: 23000, median: 25000, p75: 27000, tier: 'platform', n: 14, tier_label: 'TruckWys platform', is_estimate: false });
  // A line the floor still needs is saved as missing, amount 0.
  assert.deepEqual(d.floor_lines[2], { key: 'driver_allowance', label: 'Driver allowance', amount: 0, source_kind: 'missing' });
  assert.deepEqual(d.floor_lines[0], { key: 'fuel', label: 'Fuel', amount: 9000, source_kind: 'official' });
});

test('pricingDecision: a custom price sends no client-side chance as fact', () => {
  const a = adaptAnalysis(RAW);
  const d = pricingDecision(a, 24500, 'custom', 0);
  assert.ok(backendAccepts(d));
  assert.equal(d.picked_choice, 'custom');
  assert.equal(d.likelihood_at_final_pct, null);
  assert.equal(d.band_at_final, null);
  assert.equal(d.final_price, 24500);
});

test('pricingDecision: rules level saves the band at a choice, not a model', () => {
  const a = adaptAnalysis({
    ...RAW,
    market: { available: false },
    choices: [{ key: 'safe', label: 'Safe', price: 22000, margin: 2000, margin_pct: 9, likelihood: { level: 'rules', band: 'likely' } }],
    likelihood: { level: 'rules', rules: { thresholds: { likely_max: 24000, even_max: 26500 }, basis: [] } },
  });
  const d = pricingDecision(a, 22000, 'safe', 0);
  assert.ok(backendAccepts(d));
  assert.equal(d.likelihood_level, 'rules');
  assert.equal(d.band_at_final, 'likely');
  assert.equal(d.likelihood_at_final_pct, null);
  assert.equal(d.model_version, null);
  assert.equal(d.n_closed, null);
  assert.equal(d.basis_label, null);
  assert.equal(d.market, null);
});

test('display helpers: signed percent, tone and short form', () => {
  assert.equal(signedPct(-4.4), '−4%');
  assert.equal(signedPct(-0.2), '0%');
  assert.equal(signedPct(19.5), '20%');
  assert.equal(lkTone({ level: 'model', pct: 61 }), 'likely');
  assert.equal(lkTone({ level: 'model', pct: 40 }), 'even');
  assert.equal(lkTone({ level: 'model', pct: 10 }), 'less_likely');
  assert.equal(lkTone({ level: 'rules', band: null }), 'none');
  assert.equal(likelihoodShort({ level: 'model', pct: 71.6 }), '72% to win');
  assert.equal(likelihoodShort({ level: 'rules', label: 'Even chance' }), 'Even chance');
  assert.equal(likelihoodShort(null), null);
});
