// The quote calculator against the backend's golden vectors (QUOTE-RULES.md §12).
//
//   node --test src/features/bookings/quote/__tests__/*.test.mjs
//
// quote_golden.json is a verbatim copy of pricing-backend
// core/tests/fixtures/quote_golden.json (keep it identical). Every line amount,
// the floor, floor_known, target price and margin must match to the cent;
// warnings by code, severity and impact_zar; litres and burn within 1e-9.
// Node runs rules.ts directly (type stripping, Node ≥ 22.18), so there is no
// test runner dependency and nothing in package.json changes (its scripts are
// part of the EAS runtime fingerprint).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeCosting, changesSincePriced } from '../rules.ts';

const golden = JSON.parse(readFileSync(new URL('./quote_golden.json', import.meta.url), 'utf8'));

const close = (a, b, label) => {
  if (a === null || b === null || a === undefined || b === undefined) {
    assert.equal(a ?? null, b ?? null, label);
    return;
  }
  assert.ok(Math.abs(a - b) <= 1e-9, `${label}: ${a} vs ${b}`);
};

test('golden file is the version this calculator implements', () => {
  assert.equal(golden.version, 'qc-1');
  assert.ok(golden.cases.length >= 12);
});

for (const c of golden.cases) {
  test(c.name, () => {
    const got = computeCosting(c.inputs);
    const exp = c.expected;
    assert.equal(got.version, exp.version);

    // Lines: same keys in the same order, amounts to the cent.
    assert.deepEqual(
      got.lines.map((l) => [l.key, l.leg, l.amount]),
      exp.lines.map((l) => [l.key, l.leg, l.amount]),
      'lines',
    );
    for (const [i, l] of exp.lines.entries()) {
      if ('litres' in l) close(got.lines[i].litres, l.litres, `${l.key}.litres`);
      if ('burn_l_per_100km' in l) close(got.lines[i].burn_l_per_100km, l.burn_l_per_100km, `${l.key}.burn`);
      for (const k of ['nights', 'suggested_nights', 'rate_per_night', 'suggested', 'source', 'one_way', 'legs', 'status']) {
        if (k in l) assert.equal(got.lines[i][k], l[k], `${l.key}.${k}`);
      }
    }

    for (const k of ['floor', 'floor_known', 'floor_complete', 'target_price', 'margin', 'minimum_charge', 'price']) {
      assert.equal(got[k], exp[k], k);
    }
    close(got.margin_pct, exp.margin_pct, 'margin_pct');

    assert.deepEqual(
      got.warnings.map((w) => [w.code, w.severity, w.impact_zar]),
      exp.warnings.map((w) => [w.code, w.severity, w.impact_zar]),
      'warnings',
    );
    // Copy too: the clients show the backend's words.
    assert.deepEqual(
      got.warnings.map((w) => [w.code, w.title, w.detail, w.actions]),
      exp.warnings.map((w) => [w.code, w.title, w.detail, w.actions]),
      'warning copy',
    );
    assert.deepEqual(got.blocking, exp.blocking, 'blocking');
    // Default price (rate price on loaded km, ceil to the rand) and the
    // return-load alternative.
    for (const k of ['default_price_per_km', 'rate_price', 'default_price']) assert.equal(got[k], exp[k], k);
    assert.deepEqual(got.alternative_with_return_load, exp.alternative_with_return_load, 'alternative_with_return_load');
    assert.equal(got.can_send, exp.can_send, 'can_send');

    // Trip, vehicle, diesel and litres.
    assert.deepEqual(
      { ...got.trip, hours_one_way: null },
      { ...exp.trip, hours_one_way: null },
      'trip',
    );
    close(got.trip.hours_one_way, exp.trip.hours_one_way, 'hours_one_way');
    if (exp.vehicle === null) assert.equal(got.vehicle, null);
    else {
      for (const k of Object.keys(exp.vehicle)) {
        if (typeof exp.vehicle[k] === 'number') close(got.vehicle[k], exp.vehicle[k], `vehicle.${k}`);
        else assert.equal(got.vehicle[k], exp.vehicle[k], `vehicle.${k}`);
      }
    }
    assert.deepEqual(got.diesel, exp.diesel, 'diesel');
    for (const k of ['loaded', 'empty_return', 'total']) close(got.litres[k], exp.litres[k], `litres.${k}`);
  });
}

// Reopen notice (§11): changes_since_priced over the golden reopen cases.

for (const c of golden.reopen_cases ?? []) {
  test(`reopen: ${c.name}`, () => {
    const i = c.inputs;
    const got = changesSincePriced(i.price, i.floor_then, i.floor_now, i.priced_at);
    const exp = c.expected;
    for (const k of ['priced_at', 'price', 'floor_then', 'floor_now', 'delta_zar', 'repriced_price_keep_margin', 'changed', 'notice']) {
      assert.equal(got[k], exp[k], k);
    }
    close(got.margin_then, exp.margin_then, 'margin_then');
    close(got.margin_now, exp.margin_now, 'margin_now');
    assert.deepEqual(got.actions, exp.actions, 'actions');
  });
}
