// node --test src/features/more/__tests__/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  baseRateError,
  companyFieldErrors,
  electricError,
  hybridError,
  ownPricePerLitreError,
  priceText,
} from '../companyFieldErrors.ts';

test('server field errors land in their box', () => {
  assert.deepEqual(
    companyFieldErrors({
      fuel_price_own: ['Enter a diesel price between R5 and R100 per litre, or leave it blank.'],
      fuel_price_electric: ['Too high.'],
      default_base_rate_per_km: ['Ensure this value is less than or equal to 1000.'],
      company_name: ['Required.'],
    }),
    {
      diesel: 'Enter a diesel price between R5 and R100 per litre, or leave it blank.',
      electric: 'Too high.',
      baseRate: 'Ensure this value is less than or equal to 1000.',
    },
  );
  assert.deepEqual(companyFieldErrors({ error: 'x' }), {});
  assert.deepEqual(companyFieldErrors(null), {});
});

test('own price per litre must be R 5 – R 100', () => {
  assert.equal(ownPricePerLitreError(null), 'Enter your price, or choose Official price');
  assert.equal(ownPricePerLitreError(4.99), 'Between R 5 and R 100 per litre');
  assert.equal(ownPricePerLitreError(100.01), 'Between R 5 and R 100 per litre');
  assert.equal(ownPricePerLitreError(29.11), null);
});

test('electric, hybrid and base rate bounds; blank is fine', () => {
  assert.equal(electricError(null), null);
  assert.equal(electricError(0), 'Between R 0 and R 20 per kWh');
  assert.equal(electricError(3.5), null);
  assert.equal(hybridError(120), 'Between R 0 and R 100 per litre');
  assert.equal(baseRateError(1200), 'Between R 0 and R 1 000 per km');
  assert.equal(baseRateError(33), null);
});

test('stored prices show with a comma decimal', () => {
  assert.equal(priceText('29.1100'), '29,11');
  assert.equal(priceText(33), '33');
  assert.equal(priceText(null), '');
});
