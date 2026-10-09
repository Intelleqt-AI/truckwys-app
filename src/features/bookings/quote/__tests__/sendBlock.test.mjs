// A refused send / PDF / status change reads as the blocking warning's title.
//   node --test src/features/bookings/quote/__tests__/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseErrorBody, sendBlockMessage } from '../sendBlock.ts';

test('quote_send_blocked shows the first blocking title', () => {
  const body = {
    code: 'quote_send_blocked',
    error: "This quote can't be sent yet: tolls could not be worked out.",
    warnings: [
      { code: 'diesel_period_changed', severity: 'warn', title: 'Priced on an earlier diesel price' },
      { code: 'tolls_unknown', severity: 'block', title: 'Tolls could not be worked out' },
    ],
    blocking: ['tolls_unknown'],
  };
  assert.equal(sendBlockMessage(body), 'Tolls could not be worked out');
});

test('a PDF refusal that arrived as a Blob body parses the same', async () => {
  const blob = new Blob([JSON.stringify({ code: 'quote_send_blocked', warnings: [{ severity: 'block', title: 'No diesel price available' }] })], {
    type: 'application/json',
  });
  assert.equal(sendBlockMessage(parseErrorBody(await blob.text())), 'No diesel price available');
});

test('check_failed and bare blocks still say something useful', () => {
  assert.equal(sendBlockMessage({ code: 'check_failed', warnings: [] }), "Couldn't check this quote. Try again.");
  assert.equal(sendBlockMessage({ code: 'quote_send_blocked', error: 'Blocked.' }), 'Blocked.');
});

test('anything else is not a send block', () => {
  assert.equal(sendBlockMessage({ error: 'Not found' }), null);
  assert.equal(sendBlockMessage(parseErrorBody('%PDF-1.7')), null);
  assert.equal(sendBlockMessage(null), null);
});
