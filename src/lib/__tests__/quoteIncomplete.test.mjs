// Same rules as the web's lib/quoteStatus.ts quoteIncomplete (web 44a9954).
//   node --experimental-strip-types --test src/lib/__tests__/quoteIncomplete.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quoteIncomplete, quoteTollsUnknown } from '../quoteIncomplete.ts';

test('a priced quote is complete', () => {
  assert.equal(quoteIncomplete({ total_amount: '12500.00', customer_price: { total_incl_vat: 14375 }, pricing_complete: true }), false);
  assert.equal(quoteIncomplete({ total_amount: 12500 }), false, 'older response: no flags');
  assert.equal(quoteIncomplete(null), false);
});

test('no price, or the server says a cost is unknown: incomplete', () => {
  assert.equal(quoteIncomplete({ total_amount: 0 }), true, 'zero total');
  assert.equal(quoteIncomplete({ total_amount: null }), true);
  assert.equal(quoteIncomplete({ total_amount: 9000, customer_price: null }), true, 'server sent customer_price null');
  assert.equal(quoteIncomplete({ total_amount: 9000, pricing_complete: false }), true, 'border costs not on file');
});

test('tolls unknown and not confirmed as none: incomplete', () => {
  const ci = (o) => ({ total_amount: 9000, costing_inputs: o });
  assert.equal(quoteIncomplete(ci({ tolls_unknown: true })), true);
  assert.equal(quoteIncomplete(ci({ tolls_unknown: true, tolls_confirmed_none: true })), false);
  assert.equal(quoteTollsUnknown({ costing_inputs: { tolls_unknown: false } }), false);
  assert.equal(quoteTollsUnknown(null), false);
});
