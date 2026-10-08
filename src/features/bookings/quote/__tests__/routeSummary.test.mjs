import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeChipText } from '../routeSummary.ts';

test('route chip from toll_summary: head, roads, tolls', () => {
  assert.deepEqual(routeChipText('Fastest · via N17/N3 (Gosforth Ramp (W), Wilge, Tugela, Mooi) · tolls R 1 020'), {
    title: 'Fastest · via N17/N3',
    tolls: 'tolls R 1 020',
    plazas: 'Gosforth Ramp (W), Wilge, Tugela, Mooi',
  });
  assert.deepEqual(routeChipText('Alternative 2 · no toll plazas · tolls R 0'), {
    title: 'Alternative 2 · no toll plazas',
    tolls: 'tolls R 0',
    plazas: null,
  });
  assert.equal(routeChipText(undefined), null);
});
