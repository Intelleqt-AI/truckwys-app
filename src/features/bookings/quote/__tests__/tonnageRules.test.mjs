// The builder's tonnage rules shared with the web (scripts/test-tonnage.mjs there).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextAutoBasis, AUTO_BASIS_START, callOffCap, checkCallOff } from '../tonnageRules.ts';

test('truck unknown: follows the safest truck only on known costs', () => {
  let st = nextAutoBasis(AUTO_BASIS_START, 'k1', '8 ton rigid', 'costs_unknown');
  assert.equal(st.name, null);
  st = nextAutoBasis(st, 'k1', 'Superlink', 'safest');
  assert.equal(st.name, 'Superlink');
  st = nextAutoBasis(st, 'k1', '8 ton rigid', 'costs_unknown');
  assert.equal(st.name, 'Superlink');
  st = nextAutoBasis(st, 'k1', 'Tautliner', 'safest');
  assert.equal(st.name, 'Tautliner');
  st = nextAutoBasis(st, 'k1', 'Superlink', 'safest');
  assert.deepEqual([st.name, st.held], ['Tautliner', true]);
  st = nextAutoBasis(st, 'k2', 'Superlink', 'safest');
  assert.deepEqual([st.name, st.held], ['Superlink', false]);
});

test('call-off tonnes: the server cap, at least 0,1 t, at most 3 decimals', () => {
  assert.equal(callOffCap({ remaining_tonnes: 70, max_tonnes_per_load: 34 }), 34);
  assert.equal(callOffCap({ remaining_tonnes: 12, max_tonnes_per_load: 34 }), 12);
  assert.deepEqual(checkCallOff('28,5', 34), { tonnes: 28.5, error: null });
  for (const bad of ['', 'abc', 'NaN', 'Infinity', '1e9', '28,1234', '-1']) assert.ok(checkCallOff(bad, 34).error, bad);
  assert.equal(checkCallOff('0,05', 34).error, 'A load is at least 0,1 t.');
  assert.equal(checkCallOff('35', 34).error, 'Up to 34 t on this load.');
});
