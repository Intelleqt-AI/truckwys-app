// The quote working export (web 3f64bd9): every section present, and nothing a
// user typed can break out of the HTML.
//   node --experimental-strip-types --test src/features/bookings/quote/__tests__/workingExport.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeCosting } from '../rules.ts';
import { buildQuoteExportHtml } from '../workingExport.ts';

const golden = JSON.parse(readFileSync(new URL('./quote_golden.json', import.meta.url), 'utf8'));

test('working export: all nine sections, escaped, with the cost lines and floor', () => {
  const c = golden.cases.find((x) => x.name === 'international_border_unknown_country');
  const costing = computeCosting(c.inputs);
  const html = buildQuoteExportHtml(
    {
      quoteRef: 'Q-<1>',
      company: 'ACME & Sons',
      customer: '"Big" Customer',
      pickup: 'Johannesburg',
      delivery: 'Windhoek',
      stops: ['Upington'],
      tripType: 'ONE_WAY',
      legs: 1,
      distanceKm: 1700,
      durationMin: 1260,
      truck: 'Interlink',
      weightKg: 28000,
      cargo: null,
      pickupDate: '2026-10-14',
      deliveryDate: null,
      validUntil: null,
      routeLabel: 'Fastest',
      tolls: [{ plaza: 'Plaza <script>', tariff: 120.5 }],
      borderOut: [{ description: 'SA → NA border crossing', amount: 4463.29, verified: false }],
      borderBack: [],
      costing,
      costingInputs: c.inputs,
      price: 55000,
      priceSource: 'default price',
      vat: { vat_registered: true, vat_amount: 8250, total_incl_vat: 63250 },
      analysis: null,
    },
    new Date('2026-10-12T10:00:00Z'),
  );
  for (let i = 1; i <= 9; i++) assert.match(html, new RegExp(`<h2>${i}\. `), `section ${i}`);
  assert.ok(html.includes('Q-&lt;1&gt;'), 'quote ref escaped');
  assert.ok(html.includes('ACME &amp; Sons'));
  assert.ok(!html.includes('<script>'), 'no raw markup from user text');
  assert.ok(html.includes('Plaza &lt;script&gt;'));
  assert.match(html, /Incomplete: a cost is unknown/, 'unknown border cost means an incomplete floor');
  assert.match(html, /Not loaded\./, 'no analysis: said so');
  assert.match(html, /Estimate/, 'unverified border line is flagged an estimate');
});
