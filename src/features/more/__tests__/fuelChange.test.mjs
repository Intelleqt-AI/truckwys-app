import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fuelChangeMessage } from '../fuelChange.ts';

test('official → own diesel: amounts, difference and the confirm label', () => {
  const m = fuelChangeMessage('diesel', { mode: 'LIVE', price: 32.8 }, { mode: 'OWN', price: 29.11 });
  assert.equal(
    m.message,
    'New quotes will use your own diesel price of R 29,11/L instead of the official R 32,80/L (R 3,69/L less). Quotes already sent keep their price; open drafts update when you open them.',
  );
  assert.equal(m.confirm, 'Save and use R 29,11');
});

test('own → official, own price change, petrol grade; no change = no alert', () => {
  const back = fuelChangeMessage('diesel', { mode: 'OWN', price: 29.11 }, { mode: 'LIVE', price: 32.8 });
  assert.match(back.message, /^New quotes will use the official diesel price of R 32,80\/L instead of your own R 29,11\/L \(R 3,69\/L more\)\./);
  assert.equal(back.confirm, 'Save and use official');
  const own = fuelChangeMessage('diesel', { mode: 'OWN', price: 29.11 }, { mode: 'OWN', price: 30 });
  assert.match(own.message, /of R 30,00\/L instead of R 29,11\/L \(R 0,89\/L more\)/);
  const grade = fuelChangeMessage('petrol', { mode: 'LIVE', price: 23.4, grade: '95' }, { mode: 'LIVE', price: 23.1, grade: '93' });
  assert.match(grade.message, /the official ULP 93 price of R 23,10\/L instead of the official ULP 95 R 23,40\/L/);
  assert.equal(grade.confirm, 'Save and use ULP 93');
  assert.equal(fuelChangeMessage('diesel', { mode: 'LIVE', price: 32.8 }, { mode: 'LIVE', price: 32.8 }), null);
  assert.equal(fuelChangeMessage('diesel', { mode: 'OWN', price: 29.11 }, { mode: 'OWN', price: 29.11 }), null);
});
