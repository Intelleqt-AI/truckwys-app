// The analysis / market-check payload carries every quote-rules input.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analysisPayload } from '../analysisPayload.ts';

test('analyze and market check get the full costing payload', () => {
  const p = analysisPayload({
    tripType: 'ROUND_TRIP',
    legs: 2,
    oneWayKm: 568.4,
    durationMinutes: 440,
    truckId: 12,
    returnLoadBooked: false,
    tollKnown: true,
    tollCost: 2086.96,
    tollsConfirmedNone: false,
    driverEdited: true,
    international: true,
    borderCost: 3500,
    distanceEstimated: false,
    distanceConfirmed: false,
    useOfficialFuel: false,
  });
  for (const k of [
    'duration_minutes',
    'trip_type',
    'legs',
    'one_way_distance_km',
    'vehicle_type_id',
    'include_empty_return',
    'tolls_unknown',
    'tolls_confirmed_none',
    'driver_cost_is_override',
    'is_international',
    'cross_border_cost',
  ]) {
    assert.ok(k in p, k);
  }
  assert.equal(p.duration_minutes, 440);
  assert.equal(p.trip_type, 'ROUND_TRIP');
  assert.equal(p.toll_cost_one_way, 1043.48);
  assert.equal(p.include_empty_return, null);
});

test('unknown figures go as null / flags, never 0', () => {
  const p = analysisPayload({
    tripType: 'ONE_WAY',
    legs: 1,
    oneWayKm: 0,
    durationMinutes: 0,
    truckId: null,
    returnLoadBooked: true,
    tollKnown: false,
    tollCost: 0,
    tollsConfirmedNone: false,
    driverEdited: false,
    international: false,
    borderCost: 0,
    distanceEstimated: true,
    distanceConfirmed: false,
    useOfficialFuel: false,
  });
  assert.equal(p.one_way_distance_km, null);
  assert.equal(p.duration_minutes, null);
  assert.equal(p.tolls_unknown, true);
  assert.equal(p.toll_cost_one_way, null);
  assert.equal(p.include_empty_return, false);
});
