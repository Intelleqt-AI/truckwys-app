// Loss reasons and the stored pricing decision read for the quote detail
// (ports of the web's lib/pricing.ts and lib/pricingDecision.ts).
//   node --experimental-strip-types --test src/lib/__tests__/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LOSS_REASONS,
  agreedMarginOf,
  agreedPriceOf,
  likelihoodLabel,
  lossReasonPayload,
  marginOf,
  pricingDecisionOf,
  roundHalfAway,
} from '../pricing.ts';

test('the loss reasons are exactly the five codes the backend takes', () => {
  assert.deepEqual(
    LOSS_REASONS.map((r) => [r.code, r.label]),
    [
      ['price', 'Price'],
      ['timing', 'Timing'],
      ['capacity', 'Capacity'],
      ['relationship', 'Relationship'],
      ['other', 'Other'],
    ],
  );
});

test('lossReasonPayload: nothing picked and no note sends nothing', () => {
  assert.deepEqual(lossReasonPayload({ code: null, note: '' }), {});
  assert.deepEqual(lossReasonPayload({ code: null, note: '   ' }), {});
});

test('lossReasonPayload: code, note and the same words as rejection_reason', () => {
  assert.deepEqual(lossReasonPayload({ code: 'price', note: '' }), { loss_reason: 'price', rejection_reason: 'Price' });
  assert.deepEqual(lossReasonPayload({ code: 'timing', note: '  wanted it Monday ' }), {
    loss_reason: 'timing',
    loss_reason_note: 'wanted it Monday',
    rejection_reason: 'Timing: wanted it Monday',
  });
  // A note on its own is still a reason in words, with no code.
  assert.deepEqual(lossReasonPayload({ code: null, note: 'went with their own fleet' }), {
    loss_reason_note: 'went with their own fleet',
    rejection_reason: 'went with their own fleet',
  });
});

test('rounding is half away from zero, as the server', () => {
  assert.equal(roundHalfAway(2.5), 3);
  assert.equal(roundHalfAway(-2.5), -3);
  assert.deepEqual(marginOf(25000, 20000), { amount: 5000, pct: 20 });
  assert.deepEqual(marginOf(19000, 20000), { amount: -1000, pct: -5 });
  assert.equal(marginOf(25000, null), null);
  assert.equal(marginOf('', 100), null);
});

test('likelihoodLabel: a % only at model level, a band at rules level', () => {
  assert.equal(likelihoodLabel('model', 72.4), '72% chance to win');
  assert.equal(likelihoodLabel('rules', 'even'), 'Even chance');
  assert.equal(likelihoodLabel('rules', 'nonsense'), null);
  assert.equal(likelihoodLabel(null, 50), null);
});

const DECISION = {
  version: 'pa-3',
  picked_choice: 'balanced',
  final_price: 25000,
  floor: 20000,
  shown_choices: [{ key: 'safe', recommended: false }, { key: 'balanced', recommended: true }],
  floor_lines: [
    { key: 'fuel', label: 'Fuel', amount: 9000, source_kind: 'official' },
    { key: 'tolls', label: 'Tolls', amount: 3000, source_kind: 'calculated' },
    { key: 'driver_allowance', label: 'Driver allowance', amount: 0, source_kind: 'missing' },
    { key: 'fixed_cost', label: 'Operating costs', amount: 8000, source_kind: 'company_actuals' },
  ],
  market: { p25: 23000, median: 25000, p75: 27000, tier: 'platform', n: 14, tier_label: 'TruckWys platform, 14 accepted quotes', is_estimate: false },
  likelihood_level: 'model',
  likelihood_at_final_pct: 55.2,
  n_closed: 120,
  basis_label: '120 closed quotes',
};

test('pricingDecisionOf reads only what was saved', () => {
  const v = pricingDecisionOf({ total_amount: 25000, pricing_decision: DECISION });
  assert.equal(v.picked, 'Balanced');
  assert.equal(v.recommended, 'Balanced');
  assert.equal(v.finalPrice, 25000);
  assert.equal(v.floor, 20000);
  assert.deepEqual(v.margin, { amount: 5000, pct: 20 });
  assert.equal(v.belowFloor, false);
  assert.equal(v.stale, false);
  assert.deepEqual(v.market, { low: 23000, high: 27000, median: 25000, label: 'TruckWys platform, 14 accepted quotes', estimate: false });
  assert.deepEqual(v.likelihood, { text: '55%', basis: 'From 120 closed quotes.', model: true });
  assert.deepEqual(v.floorLines.map((l) => [l.label, l.amount, l.source, l.missing]), [
    ['Fuel', 9000, 'Official', false],
    ['Tolls', 3000, 'Calculated', false],
    ['Driver allowance', 0, null, true],
    ['Operating costs', 8000, 'Your actuals', false],
  ]);
  assert.equal(v.floorLinesDerived, false);
});

test('pricingDecisionOf: none stored means none shown', () => {
  assert.equal(pricingDecisionOf(null), null);
  assert.equal(pricingDecisionOf({ total_amount: 1 }), null);
  assert.equal(pricingDecisionOf({ pricing_decision: { final_price: null } }), null);
});

test('pricingDecisionOf: stale when the server says so or the total moved more than 50 cents', () => {
  assert.equal(pricingDecisionOf({ total_amount: 25000.4, pricing_decision: DECISION }).stale, false);
  assert.equal(pricingDecisionOf({ total_amount: 25001, pricing_decision: DECISION }).stale, true);
  assert.equal(pricingDecisionOf({ total_amount: 25000, pricing_decision: { ...DECISION, stale: true } }).stale, true);
});

test('pricingDecisionOf: a custom price reads "Your price"; a rules-level band is shown as a band', () => {
  const v = pricingDecisionOf({
    total_amount: 24000,
    pricing_decision: { ...DECISION, picked_choice: 'custom', final_price: 24000, likelihood_level: 'rules', likelihood_at_final_pct: null, band_at_final: 'even' },
  });
  assert.equal(v.picked, 'Your price');
  assert.equal(v.likelihood.text, 'Even chance');
  assert.equal(v.likelihood.model, false);
});

test('pricingDecisionOf: a driver line of R 0 is "None due" same day, "Not set" when a night is away', () => {
  const d = { ...DECISION, floor_lines: [{ key: 'driver_allowance', label: 'Driver allowance', amount: 0, source_kind: 'calculated' }] };
  const same = pricingDecisionOf({ total_amount: 25000, pricing_decision: d, estimated_duration_minutes: 300, trip_type: 'ONE_WAY' });
  assert.equal(same.floorLines[0].note, 'None due (same day)');
  assert.equal(same.floorLines[0].missing, false);
  const night = pricingDecisionOf({ total_amount: 25000, pricing_decision: d, estimated_duration_minutes: 900, trip_type: 'ONE_WAY' });
  assert.equal(night.floorLines[0].missing, true);
});

test('pricingDecisionOf: with no stored lines the floor is traced from the quote, rest is operating costs', () => {
  const d = { ...DECISION };
  delete d.floor_lines;
  const v = pricingDecisionOf({ total_amount: 25000, pricing_decision: d, fuel_surcharge: 9000, toll_charges: 3000, driver_allowance: 0, additional_charges: 0 });
  assert.equal(v.floorLinesDerived, true);
  assert.deepEqual(v.floorLines.map((l) => [l.label, l.amount]), [['Fuel', 9000], ['Tolls', 3000], ['Operating costs', 8000]]);
  // Stale: the quote's lines no longer describe that price.
  assert.equal(pricingDecisionOf({ total_amount: 30000, pricing_decision: d, fuel_surcharge: 9000 }).floorLines, null);
  // Lines that exceed the floor don't reconcile: none shown.
  assert.equal(pricingDecisionOf({ total_amount: 25000, pricing_decision: d, fuel_surcharge: 25000 }).floorLines, null);
});

test('pricingDecisionOf: an estimate market is flagged, and a label is made when the server sent none', () => {
  const est = pricingDecisionOf({ total_amount: 25000, pricing_decision: { ...DECISION, market: { p25: 30000, p75: 40000, tier: 'estimate' } } });
  assert.equal(est.market.estimate, true);
  assert.equal(est.market.label, 'Estimate, not market data');
  const own = pricingDecisionOf({ total_amount: 25000, pricing_decision: { ...DECISION, market: { p25: 1, p75: 2, tier: 'company', n: 1 } } });
  assert.equal(own.market.label, 'Your own quotes, 1 quote');
});

test('agreedPriceOf: only a won quote whose agreed price differs from the quote', () => {
  assert.equal(agreedPriceOf({ outcome: 'accepted', total_amount: 25000, agreed_price: 24000 }), 24000);
  assert.equal(agreedPriceOf({ outcome: 'accepted', total_amount: 25000, agreed_price: 25000 }), null);
  assert.equal(agreedPriceOf({ outcome: 'pending', total_amount: 25000, agreed_price: 24000 }), null);
  assert.equal(agreedPriceOf({ outcome: 'accepted', total_amount: 25000, outcome_detail: { final_price: '23500.50' } }), 23500.5);
  assert.equal(agreedPriceOf(null), null);
});

test('agreedMarginOf is the server\'s figure, never computed here', () => {
  assert.deepEqual(agreedMarginOf({ agreed_margin: 3999.6, agreed_margin_pct: '16.4' }), { amount: 4000, pct: 16 });
  assert.deepEqual(agreedMarginOf({ agreed_margin: 100 }), { amount: 100, pct: null });
  assert.equal(agreedMarginOf({ agreed_price: 1000 }), null);
});
