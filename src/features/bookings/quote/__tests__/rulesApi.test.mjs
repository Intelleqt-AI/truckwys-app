// Client-side rules around the calculator: diesel from the old and the new
// API, the SA diesel period, truck suggestion and capacity units.
//   node --test src/features/bookings/quote/__tests__/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  capacityTonnes,
  currentPeriodStart,
  dieselInputFromApi,
  resolveDieselInput,
  suggestTruck,
} from '../rules.ts';

const NOW = new Date('2026-10-07T10:00:00Z');
const oldLive = {
  success: true,
  inland_price: 32.7989,
  coastal_price: 31.9269,
  zone: 'INLAND',
  zone_price: 32.7989,
  effective_from: '2026-10-07T00:01:00+02:00',
  source: 'FIASA',
};

test('period starts 00:01 SAST on the first Wednesday', () => {
  assert.equal(currentPeriodStart(NOW).toISOString(), '2026-10-06T22:01:00.000Z');
  assert.equal(currentPeriodStart(new Date('2026-10-06T21:00:00Z')).toISOString(), '2026-09-01T22:01:00.000Z');
  assert.equal(currentPeriodStart(new Date('2027-01-02T00:00:00Z')).toISOString(), '2026-12-01T22:01:00.000Z');
});

test('old backend: 23,50, empty and the official figure all mean LIVE', () => {
  for (const v of ['23.50', null, '32.7989', 31.9269]) {
    const d = dieselInputFromApi({ fuel_zone: 'INLAND', fuel_price_per_litre: v }, oldLive, { now: NOW });
    assert.equal(d.mode, 'LIVE', String(v));
    assert.equal(resolveDieselInput(d).price, 32.7989);
  }
  const own = dieselInputFromApi({ fuel_zone: 'INLAND', fuel_price_per_litre: '30.10' }, oldLive, { now: NOW });
  assert.equal(own.mode, 'OWN');
  assert.equal(resolveDieselInput(own).source, 'own');
});

test('old backend: a fallback row is never a price', () => {
  const d = dieselInputFromApi(
    { fuel_zone: 'INLAND', fuel_price_per_litre: '23.50' },
    { success: true, inland_price: null, coastal_price: null, source: 'FALLBACK' },
    { now: NOW },
  );
  const r = resolveDieselInput(d);
  assert.equal(r.price, null);
  assert.equal(r.source, 'missing');
});

test('old backend: a price from before this period is stale', () => {
  const d = dieselInputFromApi({ fuel_zone: 'INLAND' }, { ...oldLive, effective_from: '2026-09-02T00:01:00+02:00' }, { now: NOW });
  assert.equal(d.official_stale, true);
});

test('new backend: mode fields and the server resolution win', () => {
  const company = {
    fuel_zone: 'COASTAL',
    fuel_price_mode: 'OWN',
    fuel_price_own: '30.0000',
    fuel_price_own_set_at: '2026-09-10T08:00:00Z',
    fuel_price_per_litre: '30.0000',
  };
  const live = {
    ...oldLive,
    company_price: {
      mode: 'OWN',
      zone: 'COASTAL',
      official: { price: 31.9269, effective_from: '2026-10-06T22:01:00Z', stale: false },
    },
  };
  const d = dieselInputFromApi(company, live, { now: NOW });
  assert.deepEqual(
    [d.zone, d.mode, d.own_price, d.official_price, d.official_effective_from, d.official_stale],
    ['COASTAL', 'OWN', 30, 31.9269, '2026-10-06T22:01:00Z', false],
  );
  const live2 = dieselInputFromApi({ ...company, fuel_price_mode: 'LIVE', fuel_price_own: null }, live, { now: NOW });
  assert.equal(resolveDieselInput(live2).price, 31.9269);
  const official = dieselInputFromApi(company, live, { now: NOW, useOfficial: true });
  assert.equal(resolveDieselInput(official).source, 'official');
});

test('capacity above 100 is kilograms', () => {
  assert.equal(capacityTonnes(34), 34);
  assert.equal(capacityTonnes('8000'), 8);
  assert.equal(capacityTonnes(0), null);
  assert.equal(capacityTonnes(null), null);
});

test('suggested truck: smallest that carries the load, then lowest burn', () => {
  const types = [
    { name: 'Superlink', capacity: 34, fuel_consumption_l_per_100km: 42 },
    { name: 'Tri-axle', capacity: 30000, fuel_consumption_l_per_100km: 38 },
    { name: 'Flatbed', capacity: 30, fuel_consumption_l_per_100km: 36 },
    { name: 'Rigid', capacity: 8, fuel_consumption_l_per_100km: 24 },
  ];
  assert.equal(suggestTruck(types, 20)?.name, 'Flatbed');
  assert.equal(suggestTruck(types, 8)?.name, 'Rigid');
  assert.equal(suggestTruck(types, 31)?.name, 'Superlink');
  assert.equal(suggestTruck(types, 40), null);
});
