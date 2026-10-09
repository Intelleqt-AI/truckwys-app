// Tonnage quotes (rate per tonne) against the backend's golden vectors:
// quote_golden.json `tonnage_cases`, quote_costing.compute_tonnage().
//
//   node --test src/features/bookings/quote/__tests__/*.test.mjs
//
// Every figure in `expected` is compared: amounts exactly (to the cent),
// litres / burn / margin percentages within 1e-9, strings exactly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeTonnage } from '../rules.ts';

const golden = JSON.parse(readFileSync(new URL('./quote_golden.json', import.meta.url), 'utf8'));
const TOL = /(^|\.)(litres|loaded|empty_return|total|burn_l_per_100km|burn_loaded_l_per_100km|burn_empty_l_per_100km|load_ratio|hours_one_way|margin_pct|km|km_loaded|km_empty|km_driven)$/;

function cmp(exp, got, path) {
  if (exp === null || typeof exp !== 'object') {
    if (typeof exp === 'number' && typeof got === 'number' && TOL.test(path)) {
      assert.ok(Math.abs(exp - got) <= 1e-9, `${path}: expected ${exp}, got ${got}`);
    } else {
      assert.equal(got, exp, `${path}: expected ${JSON.stringify(exp)}, got ${JSON.stringify(got)}`);
    }
    return;
  }
  if (Array.isArray(exp)) {
    assert.ok(Array.isArray(got), `${path}: expected an array`);
    assert.equal(got.length, exp.length, `${path}: length`);
    exp.forEach((e, k) => cmp(e, got[k], `${path}[${k}]`));
    return;
  }
  assert.ok(got && typeof got === 'object', `${path}: expected an object`);
  for (const k of Object.keys(exp)) cmp(exp[k], got[k], path ? `${path}.${k}` : k);
}

test('at least 8 tonnage cases', () => {
  assert.ok((golden.tonnage_cases ?? []).length >= 8);
});

for (const c of golden.tonnage_cases ?? []) {
  test(`tonnage: ${c.name}`, () => {
    // basis_load_costing is compute() for one load: checked by quoteGolden.
    const got = JSON.parse(JSON.stringify(computeTonnage(c.inputs)));
    cmp(c.expected, got, '');
  });
}

test('rate below cost: warns with the loss and offers Price at target', () => {
  const c = golden.tonnage_cases.find((x) => x.name === 'rate_below_cost');
  const out = computeTonnage(c.inputs);
  const w = out.warnings.find((x) => x.code === 'rate_below_cost');
  assert.equal(w.severity, 'warn');
  assert.match(w.detail, /this loses R 9 530\.$/);
  assert.deepEqual(w.actions, [{ id: 'use_target_rate', label: 'Price at target · R 1 242/t' }]);
  assert.equal(out.can_send, true);
});
