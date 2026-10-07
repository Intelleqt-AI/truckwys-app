// node --test src/features/copilot/__tests__/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settledText } from '../settledText.ts';

const base = { chipText: '✓ Saved', fields: [] };

test('a sent quote says so, with the customer when known', () => {
  assert.equal(
    settledText({ ...base, status: 'executed', operation: 'UPDATE', sends: true, fields: [{ label: 'Customer', value: 'AVI Limited' }] }),
    '✓ Sent to AVI Limited',
  );
  assert.equal(settledText({ ...base, status: 'executed', operation: 'CREATE', sends: true }), '✓ Quote sent');
  assert.equal(settledText({ ...base, status: 'executed', operation: 'SEND' }), '✓ Quote sent');
});

test('saves and unsettled states keep their chip', () => {
  assert.equal(settledText({ ...base, status: 'executed', operation: 'UPDATE', sends: false }), '✓ Saved');
  assert.equal(settledText({ ...base, chipText: 'Dismissed', status: 'dismissed', operation: 'CREATE', sends: true }), 'Dismissed');
});
