// Trip economics display logic: candidates, margins, booking block, actuals.
//   node --test src/features/bookings/trip/__tests__/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rand,
  percent,
  shortDate,
  isMissingEndpoint,
  parseCandidates,
  candidateTitle,
  candidateSub,
  candidateNote,
  parseEconomics,
  marginCardView,
  vsQuotedText,
  marginText,
  basisLabel,
  partnerLeg,
  parseBooking,
  invoicePreviewView,
  termsText,
  bookErrorText,
  returnHistoryText,
  actualsView,
  EMPTY_RETURN_REMOVED,
  parseBookingPreview,
  bookingBodyFor,
  economicsPending,
  analysisHasReturnHistory,
} from '../economics.ts';

// Intl puts non-breaking spaces in `R 1 020`; compare with plain ones.
const sp = (s) => (s == null ? s : s.replace(/\s/g, ' '));

test('money and percentages read the SA way', () => {
  assert.equal(sp(rand(1020)), 'R 1 020');
  assert.equal(sp(rand(-4200.4)), '−R 4 200');
  assert.equal(rand(null), '—');
  assert.equal(percent(18.24), '18,2%');
  assert.equal(percent(-3), '−3,0%');
  assert.equal(percent(-0.01), '0,0%');
  assert.equal(shortDate('2026-10-12T00:00:00+02:00'), '12 Oct');
  assert.equal(shortDate(null), '');
});

test('older backends: 404 / 405 / 501 hide the feature', () => {
  assert.equal(isMissingEndpoint(404), true);
  assert.equal(isMissingEndpoint(405), true);
  assert.equal(isMissingEndpoint(500), false);
});

const RAW_CANDIDATES = [
  {
    load_id: 41,
    load_number: 'LOAD-20261010-1234',
    customer_name: 'Highveld Grain',
    pickup: 'Durban',
    delivery: 'Johannesburg',
    pickup_date: '2026-10-12T00:00:00+02:00',
    delivery_date: '2026-10-13T00:00:00+02:00',
    total_amount: 18500,
    pickup_km_from_drop: 7.6,
    reverses_lane: true,
    warnings: [],
  },
  {
    load_id: 42,
    load_number: 'LOAD-20261010-5678',
    customer_name: '',
    pickup: 'Pinetown',
    delivery: 'Pretoria',
    pickup_date: '2026-10-14',
    total_amount: 0,
    pickup_km_from_drop: 0.2,
    reverses_lane: false,
    warnings: [{ code: 'vehicle_type_differs', severity: 'warn', title: 'Different truck type', detail: '…' }],
  },
  { load_number: 'no id, dropped' },
];

test('candidates: title, one line under it, and the note', () => {
  const [a, b, ...rest] = parseCandidates(RAW_CANDIDATES);
  assert.equal(rest.length, 0);
  assert.equal(candidateTitle(a), 'Durban → Johannesburg');
  assert.equal(sp(candidateSub(a, 'return')), 'Highveld Grain · collects 12 Oct · 8 km from the drop · R 18 500');
  assert.equal(candidateNote(a), 'Same lane back');
  assert.equal(candidateSub(b, 'return'), 'Collects 14 Oct · at the drop');
  assert.equal(candidateNote(b), 'Different truck type');
  assert.equal(sp(candidateSub(a, 'outbound')), 'Highveld Grain · delivers 13 Oct · R 18 500');
  assert.deepEqual(parseCandidates(null), []);
});

const PAIR = {
  pair: true,
  outbound_id: 10,
  return_id: 11,
  expecting_return: false,
  legs: [
    {
      load_id: 10, load_number: 'LOAD-A', role: 'outbound', lane: 'Johannesburg → Durban',
      revenue: 30000, revenue_basis: 'actual', cost: 21000, cost_basis: 'actual',
      margin: 9000, margin_pct: 30, quoted: { price: 30000, cost_floor: 24000, margin_pct: 20 },
      margin_vs_quoted_pts: 10, empty_return_removed: 3000, missing: [],
    },
    {
      load_id: 11, load_number: 'LOAD-B', role: 'return', lane: 'Durban → Johannesburg',
      revenue: 18500, revenue_basis: 'estimate', cost: 16000, cost_basis: 'estimate',
      estimate_label: 'Quote costing, no empty return (return load linked)',
      margin: 2500, margin_pct: 13.51, quoted: { price: 18500, cost_floor: 15500, margin_pct: 16.22 },
      margin_vs_quoted_pts: -2.71, empty_return_removed: 0,
      missing: [{ code: 'tolls_unknown', prompt: 'Add the tolls to cost this job' }],
    },
  ],
  combined: {
    revenue: 48500, cost: 37000, cost_basis: 'mixed', margin: 11500, margin_pct: 23.71,
    quoted: { price: 48500, cost_floor: 39500, margin_pct: 18.56 }, margin_vs_quoted_pts: 5.15,
    empty_return_removed: 3000,
  },
};

test('pair margin card: per leg, combined, empty return removed, missing prompts', () => {
  const e = parseEconomics(PAIR);
  const v = marginCardView(e);
  assert.equal(v.legs.length, 2);
  assert.equal(v.legs[0].title, 'Outbound');
  assert.equal(v.legs[0].costLabel, 'Actual cost');
  assert.equal(v.legs[0].basis, 'Actual');
  assert.equal(sp(v.legs[0].margin), 'R 9 000 · 30,0%');
  assert.equal(v.legs[0].quoted, 'Quoted 20,0%');
  assert.equal(v.legs[0].vsQuoted, '10,0 pts above quoted');
  assert.equal(v.legs[1].costLabel, 'Estimated cost');
  assert.equal(v.legs[1].basis, 'Estimate');
  assert.equal(v.legs[1].vsQuoted, '2,7 pts below quoted');
  assert.equal(v.legs[1].below, true);
  assert.equal(v.combined.basis, 'Part actual');
  assert.equal(sp(v.combined.margin), 'R 11 500 · 23,7%');
  assert.equal(v.combined.quoted, 'Quoted 18,6%');
  assert.equal(v.emptyReturnNote, EMPTY_RETURN_REMOVED);
  assert.deepEqual(v.missing, ['Add the tolls to cost this job']);
  assert.equal(partnerLeg(e, 10).loadNumber, 'LOAD-B');
  assert.equal(partnerLeg(e, '11').loadNumber, 'LOAD-A');
});

test('single job without an estimate: no margin, prompts instead, no combined', () => {
  const e = parseEconomics({
    pair: false,
    expecting_return: true,
    legs: [{
      load_id: 5, role: 'single', revenue: 12000, revenue_basis: 'estimate', cost: null, cost_basis: null,
      margin: null, margin_pct: null, quoted: { margin_pct: null }, margin_vs_quoted_pts: null,
      empty_return_removed: 0,
      missing: [{ code: 'no_vehicle', prompt: 'Add the truck to cost this job' },
        { code: 'no_vehicle', prompt: 'Add the truck to cost this job' }],
    }],
    combined: { margin: null },
  });
  const v = marginCardView(e);
  assert.equal(e.expectingReturn, true);
  assert.equal(v.combined, null);
  assert.equal(v.legs[0].title, 'This job');
  assert.equal(v.legs[0].margin, '—');
  assert.equal(v.legs[0].cost, '—');
  assert.equal(v.legs[0].basis, null);
  assert.equal(v.legs[0].quoted, null);
  assert.equal(v.emptyReturnNote, null);
  assert.deepEqual(v.missing, ['Add the truck to cost this job']);
  assert.equal(partnerLeg(e, 5), null);
  assert.equal(parseEconomics({ legs: [] }), null);
  assert.equal(parseEconomics('<html>'), null);
});

test('margin helpers', () => {
  assert.equal(vsQuotedText(0.01), 'As quoted');
  assert.equal(vsQuotedText(null), null);
  assert.equal(sp(marginText(-1500, -12.5)), '−R 1 500 · −12,5%');
  assert.equal(basisLabel('mixed'), 'Part actual');
  assert.equal(basisLabel(null), null);
});

test('booking block: new job, candidates both ways, invoice on delivery', () => {
  const r = parseBooking({
    id: 77,
    load_number: 'LOAD-20261008-4321',
    status: 'PENDING',
    booking: {
      created: true,
      already_converted: false,
      return_link: { linked: false, expecting_return: true },
      is_return_of: null,
      return_load_id: null,
      expecting_return: true,
      return_candidates: RAW_CANDIDATES.slice(0, 1),
      outbound_candidates: RAW_CANDIDATES.slice(1, 2),
      invoice_preview: {
        state: 'on_delivery', auto_on_delivery: true, auto_email: true,
        lines: [{ description: 'Transport Johannesburg to Durban', net_amount: 30000, total: 34500 }],
        subtotal: 30000, vat_amount: 4500, total: 34500, payment_terms: 'NET30', terms_days: 30,
      },
      economics: PAIR,
    },
  });
  assert.equal(r.hasBooking, true);
  assert.equal(r.loadId, 77);
  assert.equal(r.alreadyConverted, false);
  assert.equal(r.expectingReturn, true);
  assert.equal(r.returnLink.expectingReturn, true);
  assert.equal(r.returnCandidates[0].loadId, 41);
  assert.equal(r.outboundCandidates[0].loadId, 42);
  assert.equal(r.invoice.heading, 'Invoice on delivery');
  assert.equal(r.invoice.note, 'Due in 30 days · emailed to the customer');
  assert.equal(sp(r.invoice.total), 'R 34 500,00');
  assert.equal(sp(r.invoice.lines[0].amount), 'R 30 000,00');
  assert.equal(r.economics.pair, true);
});

test('booking: already converted (200) and a link that could not be made', () => {
  const r = parseBooking({
    id: 77,
    load_number: 'LOAD-X',
    booking: {
      created: false,
      already_converted: true,
      return_link: { linked: false, error: 'already_paired', detail: 'That load already has a return.' },
      invoice_preview: { state: 'raised', invoice_number: 'INV-0042', subtotal: 100, vat_amount: 15, total: 115 },
    },
  });
  assert.equal(r.alreadyConverted, true);
  assert.equal(r.returnLink.error, 'That load already has a return.');
  assert.equal(r.invoice.heading, 'Invoice INV-0042');
  assert.deepEqual(r.returnCandidates, []);
  assert.equal(r.economics, null);
});

test('booking: an older backend sends just the load', () => {
  const r = parseBooking({ id: 9, load_number: 'LOAD-OLD', status: 'PENDING' });
  assert.equal(r.hasBooking, false);
  assert.equal(r.loadId, 9);
  assert.equal(r.invoice, null);
});

test('invoice preview states and terms', () => {
  assert.equal(invoicePreviewView({ state: 'manual', lines: [], subtotal: 1, vat_amount: 0, total: 1, payment_terms: 'NET60' }).heading,
    'Invoice after delivery');
  assert.equal(invoicePreviewView({ state: 'not_invoiceable', reason: 'cancelled' }).note, 'The job is cancelled.');
  assert.equal(invoicePreviewView(null), null);
  assert.equal(termsText('net7'), 'Due in 7 days');
  assert.equal(termsText('COD'), null);
});

test('refused booking text', () => {
  const e = Object.assign(new Error('Request failed (409)'), {
    status: 409,
    data: { code: 'quote_not_bookable', error: "This quote is declined; it can't be booked." },
  });
  assert.equal(bookErrorText(e), "This quote is declined; it can't be booked.");
  assert.equal(bookErrorText(new Error('Tolls could not be worked out')), 'Tolls could not be worked out');
  assert.equal(bookErrorText(null), "Couldn't book this job. Try again.");
});

test('return-load history text from the pricing analysis', () => {
  const text = 'On this lane 60% of your trips found a return load (12 of 20).';
  assert.equal(returnHistoryText({ return_load_history: { text } }), text);
  assert.equal(returnHistoryText({ alternative_with_return_load: { return_load_history: { text } } }), text);
  assert.equal(returnHistoryText({ return_load_history: { text: null } }), null);
  assert.equal(returnHistoryText(null), null);
});

test('quote actuals once delivered', () => {
  const v = actualsView({
    actual_margin_pct: 17.25, backhaul_found: true, actual_revenue: 30000, actual_cost: 24825,
    actual_cost_basis: 'actual', recorded_at: '2026-10-08T10:00:00Z',
  });
  assert.equal(v.margin, '17,3%');
  assert.equal(v.basis, 'Actual');
  assert.equal(v.backhaul, 'Came back loaded');
  assert.equal(sp(v.cost), 'R 24 825');
  assert.equal(actualsView(null), null);
  assert.equal(actualsView({ actual_margin_pct: null, actual_revenue: null }), null);
  assert.equal(actualsView({ actual_margin_pct: -4, backhaul_found: false, actual_cost_basis: 'estimate' }).backhaul,
    'Came back empty');
});

test('booking preview before booking: candidates, invoice, can_book', () => {
  const p = parseBookingPreview({
    preview: true, can_book: true, blocked: null, load_id: null,
    booking: {
      return_candidates: RAW_CANDIDATES.slice(0, 1),
      outbound_candidates: [],
      invoice_preview: { state: 'on_delivery', lines: [], subtotal: 100, vat_amount: 15, total: 115, payment_terms: 'NET30' },
    },
  });
  assert.equal(p.preview, true);
  assert.equal(p.canBook, true);
  assert.equal(p.blockedText, null);
  assert.equal(p.returnCandidates[0].loadId, 41);
  assert.equal(p.invoice.heading, 'Invoice on delivery');
});

test('booking preview: blocked, already booked, not a preview', () => {
  const blocked = parseBookingPreview({
    preview: true, can_book: false, load_id: null,
    blocked: { code: 'quote_send_blocked', warnings: [{ severity: 'block', title: 'Tolls could not be worked out' }] },
    booking: {},
  });
  assert.equal(blocked.blockedText, 'Tolls could not be worked out');
  assert.equal(parseBookingPreview({ preview: true, can_book: false, blocked: { code: 'quote_not_bookable', error: 'Declined.' }, booking: {} }).blockedText, 'Declined.');
  const booked = parseBookingPreview({ preview: false, can_book: true, load_id: 77, booking: {} });
  assert.equal(booked.preview, false);
  assert.equal(booked.loadId, 77);
  assert.equal(parseBookingPreview({ detail: 'Not found.' }), null);
});

test('return choice becomes one convert_to_load body', () => {
  assert.deepEqual(bookingBodyFor('empty'), {});
  assert.deepEqual(bookingBodyFor('expect'), { expect_return: true });
  assert.deepEqual(bookingBodyFor('out:42'), { return_of_load_id: '42' });
  assert.deepEqual(bookingBodyFor('ret:41'), { linkReturnId: '41' });
});

test('tolls being worked out: a calm pending note, not a missing prompt', () => {
  const e = parseEconomics({
    pair: false,
    legs: [{
      load_id: 5, role: 'single', revenue: 12000, cost: null, cost_basis: null, margin: null,
      missing: [
        { code: 'tolls_pending', prompt: 'Working out tolls…', pending: true, blocks: 'tolls_unknown' },
        { code: 'no_vehicle', prompt: 'Add the truck to cost this job' },
      ],
    }],
  });
  const v = marginCardView(e);
  assert.equal(v.pending, 'Working out tolls…');
  assert.deepEqual(v.missing, ['Add the truck to cost this job']);
  assert.equal(economicsPending(e), true);
  assert.equal(economicsPending(parseEconomics(PAIR)), false);
  assert.equal(marginCardView(parseEconomics(PAIR)).pending, null);
});

test('return history: the analysis field (even null) means no fallback call', () => {
  assert.equal(analysisHasReturnHistory({ return_load_history: null }), true);
  assert.equal(analysisHasReturnHistory({ success: true }), false);
  assert.equal(analysisHasReturnHistory(null), false);
});
