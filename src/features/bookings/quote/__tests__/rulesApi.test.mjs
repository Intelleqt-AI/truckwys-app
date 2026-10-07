// Client-side rules around the calculator: diesel from the old and the new
// API, the SA diesel period, truck suggestion and capacity units.
//   node --test src/features/bookings/quote/__tests__/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  capacityTonnes,
  currentPeriodStart,
  dieselInputFromApi,
  fuelInputFromApi,
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

test('old backend: 23,50, empty and the zone\'s official figure all mean LIVE', () => {
  // Backend _is_live_echo: either zone's 50ppm figure is an echo.
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

test('old backend: a price from before the previous period is unusable', () => {
  const d = dieselInputFromApi({ fuel_zone: 'INLAND' }, { ...oldLive, effective_from: '2026-08-05T00:01:00+02:00' }, { now: NOW });
  assert.equal(resolveDieselInput(d).source, 'missing');
});

test('a non-diesel truck with no company price is missing, named by its fuel', async () => {
  const { computeCosting } = await import('../rules.ts');
  const c = computeCosting({
    distance_km: 100,
    duration_minutes: 90,
    load_kg: 1000,
    vehicle: { id: 1, name: 'Van', capacity: 2, rated_burn_l_per_100km: 12 },
    diesel: { zone: 'INLAND', mode: 'OWN', own_price: null, fuel_type: 'Electric' },
    operating_cost_per_km: 8,
    tolls: { one_way: 0 },
  });
  const w = c.warnings.find((x) => x.code === 'diesel_missing');
  assert.equal(w.title, 'No electricity price set');
  assert.equal(w.fuel_type, 'electric');
  assert.equal(w.severity, 'block');
});

test('suggestion skips a truck with no rated burn', () => {
  const types = [
    { id: 1, name: 'Unrated', capacity: 20 },
    { id: 2, name: 'Rated', capacity: 30, fuel_consumption_l_per_100km: 36 },
  ];
  assert.equal(suggestTruck(types, 15)?.name, 'Rated');
});

test('phone copy: stale diesel fits 390 pt, below floor offers the target price', async () => {
  const { computeCosting, phoneWarning } = await import('../rules.ts');
  const golden = JSON.parse((await import('node:fs')).readFileSync(new URL('./quote_golden.json', import.meta.url), 'utf8'));
  const stale = golden.cases.find((c) => c.name === 'stale_official_price');
  const c1 = computeCosting(stale.inputs);
  const w1 = phoneWarning(c1.warnings.find((w) => w.code === 'diesel_stale'), c1, 10);
  assert.equal(w1.title, 'Diesel price is from 2 Sep');
  assert.deepEqual(w1.actions.map((a) => a.label), ['Check again']);
  assert.equal(w1.severity, 'warn');
  const below = golden.cases.find((c) => c.name === 'price_below_floor');
  const c2 = computeCosting(below.inputs);
  const w2 = phoneWarning(c2.warnings.find((w) => w.code === 'below_floor'), c2, c2.target_margin_pct);
  assert.equal(w2.actions[0].id, 'use_target');
  assert.match(w2.actions[0].label, /^Price at 10% margin · R \d/);
  assert.equal(w2.impact_zar, c2.warnings.find((w) => w.code === 'below_floor').impact_zar);
});

// ── Petrol (petrol and hybrid trucks): same rule as diesel ──────────────────

const petrolLive = {
  success: true,
  petrol: {
    inland_95: { price: 30.25, effective_from: '2026-10-06T22:01:00Z', source: 'FIASA', stale: false },
    inland_93: { price: 29.88, effective_from: '2026-10-06T22:01:00Z', source: 'FIASA', stale: false },
    coastal_95: { price: 29.38, effective_from: '2026-10-06T22:01:00Z', source: 'FIASA', stale: false },
    coastal_93: null,
  },
  company_petrol_price: {
    fuel_type: 'Petrol', grade: '95', mode: 'LIVE', source: 'official', price: 30.25, zone: 'INLAND',
    official: { price: 30.25, effective_from: '2026-10-06T22:01:00Z', source: 'FIASA', stale: false },
    own: { price: null, set_at: null }, warnings: [],
  },
};

test('new backend: a petrol truck on a LIVE company is priced on official ULP 95', () => {
  const company = { fuel_zone: 'INLAND', fuel_price_petrol_mode: 'LIVE', fuel_price_petrol: 27, fuel_price_petrol_grade: '95' };
  const r = resolveDieselInput(fuelInputFromApi(company, petrolLive, 'Petrol'));
  assert.equal(r.source, 'official');
  assert.equal(r.price, 30.25);
  assert.equal(r.fuel_type, 'Petrol');
  assert.equal(r.grade, '95');
});

test('new backend: hybrid uses the petrol price; 93 inland, 95 at the coast', () => {
  const inland93 = { fuel_zone: 'INLAND', fuel_price_petrol_mode: 'LIVE', fuel_price_petrol_grade: '93' };
  assert.equal(resolveDieselInput(fuelInputFromApi(inland93, petrolLive, 'Hybrid')).price, 29.88);
  const coastal93 = { ...inland93, fuel_zone: 'COASTAL' };
  const r = resolveDieselInput(fuelInputFromApi(coastal93, petrolLive, 'Hybrid'));
  assert.equal(r.price, 29.38);
  assert.equal(r.grade, '95');
});

test('new backend: petrol OWN prices on the own price and warns when off official', async () => {
  const { dieselWarnings } = await import('../rules.ts');
  const company = { fuel_zone: 'INLAND', fuel_price_petrol_mode: 'OWN', fuel_price_petrol: 27, fuel_price_petrol_set_at: '2026-10-07T06:30:00Z' };
  const r = resolveDieselInput(fuelInputFromApi(company, petrolLive, 'Petrol'));
  assert.equal(r.source, 'own');
  assert.equal(r.price, 27);
  const w = dieselWarnings(r, 100);
  assert.equal(w[0].title, 'Your petrol price differs from official');
  assert.equal(w[0].detail, 'Yours R 27,00/L, official R 30,25/L (inland 95).');
  assert.equal(w[0].fuel_type, 'petrol');
});

test('old backend: petrol is the own price only, hybrid its own field; missing blocks', () => {
  const old = { fuel_zone: 'INLAND', fuel_price_petrol: 28.5, fuel_price_hybrid: null };
  const live = { success: true, inland_price: 32.7989 };
  const p = resolveDieselInput(fuelInputFromApi(old, live, 'Petrol'));
  assert.equal(p.source, 'own');
  assert.equal(p.price, 28.5);
  assert.equal(resolveDieselInput(fuelInputFromApi(old, live, 'Hybrid')).source, 'missing');
});

test('electric is own price only', () => {
  const r = resolveDieselInput(fuelInputFromApi({ fuel_price_electric: 3.2 }, petrolLive, 'Electric'));
  assert.equal(r.source, 'own');
  assert.equal(r.price, 3.2);
  assert.equal(r.official_price, null);
});

test('old backend: a fleet price equal to a 500ppm figure is still its own', () => {
  const live = { ...oldLive, inland_price: 29.5551, zone_price: 29.5551, diesel_500ppm_inland: 29.1111 };
  const d = dieselInputFromApi({ fuel_zone: 'INLAND', fuel_price_per_litre: '29.1100' }, live, { now: NOW });
  assert.equal(d.mode, 'OWN');
  assert.equal(d.own_price, 29.11);
  // The 50ppm figure itself is still the live echo.
  assert.equal(dieselInputFromApi({ fuel_zone: 'INLAND', fuel_price_per_litre: '29.5551' }, live, { now: NOW }).mode, 'LIVE');
});

test('no company profile (non-admin) on a newer backend: own price from company_price', () => {
  const live = {
    ...oldLive,
    company_price: { mode: 'OWN', zone: 'INLAND', own: { price: 31.2, set_at: '2026-10-07T06:00:00Z' }, official: { price: 32.7989, effective_from: '2026-10-06T22:01:00Z', stale: false } },
  };
  const r = resolveDieselInput(dieselInputFromApi(undefined, live, { now: NOW }));
  assert.equal(r.source, 'own');
  assert.equal(r.price, 31.2);
});

test('settings zone change shows that zone\'s official price at once', () => {
  const live = { ...oldLive, company_price: { mode: 'LIVE', zone: 'INLAND', official: { price: 32.7989, effective_from: '2026-10-06T22:01:00Z', stale: false } } };
  assert.equal(dieselInputFromApi({ fuel_zone: 'COASTAL' }, live, { now: NOW }).official_price, 31.9269);
});

test('suggestion mirrors the backend: fleet only, specialised bodies need the cargo, most quoted breaks ties', async () => {
  const { suggestTruck } = await import('../rules.ts');
  const types = [
    { id: 1, name: 'Reefer', capacity: 30, fuel_consumption_l_per_100km: 30, available_vehicle_count: 2 },
    { id: 2, name: 'Flatbed', capacity: 30, fuel_consumption_l_per_100km: 36, available_vehicle_count: 1 },
    { id: 3, name: 'Tautliner', capacity: 30, fuel_consumption_l_per_100km: 34, available_vehicle_count: 1 },
    { id: 4, name: 'Small', capacity: 25, fuel_consumption_l_per_100km: 20, available_vehicle_count: 0 },
  ];
  assert.equal(suggestTruck(types, 20, { cargo: 'steel' })?.name, 'Tautliner');
  assert.equal(suggestTruck(types, 20, { cargo: 'frozen chicken' })?.name, 'Reefer');
  assert.equal(suggestTruck(types, 20, { cargo: 'steel', usage: { flatbed: 7, tautliner: 2 } })?.name, 'Flatbed');
  assert.equal(suggestTruck(types, 0), null);
});

test('below-cost action says minimum when the minimum charge wins', async () => {
  const { computeCosting, phoneWarning } = await import('../rules.ts');
  const fs = await import('node:fs');
  const golden = JSON.parse(fs.readFileSync(new URL('./quote_golden.json', import.meta.url), 'utf8'));
  const base = golden.cases.find((c) => c.name === 'price_below_floor').inputs;
  const c = computeCosting({ ...base, minimum_charge: 30000, price: 6000 });
  const w = phoneWarning(c.warnings.find((x) => x.code === 'below_floor'), c, c.target_margin_pct);
  assert.equal(w.actions[0].label, 'Price at minimum · R 30 000');
});

test('timestamps are SAST with offset, as the backend emits them', async () => {
  const { isoSast } = await import('../rules.ts');
  assert.equal(isoSast('2026-10-06T22:01:00Z'), '2026-10-07T00:01:00+02:00');
  assert.equal(isoSast('2026-10-07T00:01:00.500+02:00'), '2026-10-07T00:01:00+02:00');
  assert.equal(isoSast(null), null);
});
