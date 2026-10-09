import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reopenedInputs } from '../reopenInputs.ts';

test('reopen restores the typed border figure only when it was the user\'s', () => {
  assert.deepEqual(reopenedInputs({ border_cost: 9800.5, border_cost_is_override: true, clearing_agent_fee: 1500, abnormal_load: true }), {
    borderOverride: '9800,5',
    agentFee: '1500',
    abnormalLoad: true,
  });
  // A route's own border figure is not restored: the fresh route prices it.
  assert.equal(reopenedInputs({ border_cost: 6253.69 }).borderOverride, '');
  assert.deepEqual(reopenedInputs(null), { borderOverride: '', agentFee: '', abnormalLoad: false });
});
