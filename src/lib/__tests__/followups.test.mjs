// Quote follow-ups display rules (FOLLOWUPS-CLIENT-SPEC.md). The same cases
// as the web's scripts/test-followups.mjs, so both clients print the same strings.
//   node --test src/lib/__tests__/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  adjustmentRow, draftClauseLine, promptExample, alertPriceLine, floorChange, marginChange, sortAlertQuotes,
  sentLine, expiresLine, lastReminderLine, cleanNote, showFollowUp, followUpLink, fuelAlertParam, automationPatch,
  automationChangeLines, boundError, pctText, dayText, actualMarginText, reportPct, ptsText, apiMessage, fieldErrors,
  fuelReferenceLine, promptReference, unsetItems, confirmBody, reminderSendLabel, reminderSentText, followUpParam,
  boundValue, boundText, apiCode, shortDay,
} from '../followups.ts';

// The web groups thousands with a no-break space; normalise either way.
const sp = (s) => (s == null ? s : s.replace(/\u00a0/g, ' '));
let n = 0;

test('web parity cases', () => {
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const deq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

// --- numbers and dates (SAST, whatever the browser's zone)
eq(pctText(5), "5%");
eq(pctText(7.5), "7,5%");
eq(pctText(2.08), "2,1%");
eq(pctText(null), "—");
eq(dayText("2026-11-07"), "Sat 7 Nov");
eq(dayText("2026-10-09T22:30:00Z"), "Sat 10 Oct");          // 00:30 SAST on the 10th
eq(dayText(null), "—");

// --- fuel price adjustment row
const base = { quote_id: 1, load_id: null, clause: "x", amount_zar: null, direction: null, description: null,
  product: "diesel", price_at_pricing: 29.5551, price_on_trip: 32.7989, threshold_pct: 5 };
eq(adjustmentRow({ ...base, applies: false, reason: "no_clause" }), null);
eq(adjustmentRow({ ...base, applies: false, reason: "no_quote" }), null);
eq(adjustmentRow({ ...base, applies: false, reason: "no_official_price" }).title, "No official price for the trip date yet.");
eq(adjustmentRow({ ...base, applies: false, reason: "within_threshold", change_pct: -2.08 }).title,
  "Diesel moved 2,1%, inside your 5% clause. No change.");
eq(adjustmentRow({ ...base, product: "petrol_95", applies: false, reason: "within_threshold", change_pct: 3, threshold_pct: 7.5 }).title,
  "Petrol 95 moved 3%, inside your 7,5% clause. No change.");
{
  const up = adjustmentRow({ ...base, applies: true, reason: "applies", amount_zar: 1275.46, direction: "up",
    description: "Fuel price adjustment (diesel R 29,56 → R 32,80/L)", provisional: false });
  eq(up.title, "Fuel price adjustment (diesel R 29,56 → R 32,80/L)");
  eq(sp(up.amount), "+R 1 275,46");
  eq(up.sub, "Added to the invoice when the load is delivered.");
  eq(up.invoiceId, null);
  const down = adjustmentRow({ ...base, applies: true, reason: "applies", amount_zar: -812.4, direction: "down",
    description: "Fuel price adjustment (diesel R 32,80 → R 30,00/L)", provisional: false,
    invoiced: { invoice_id: 7, line_id: 3, amount_zar: -812.4 } });
  eq(sp(down.amount), "−R 812,40");
  eq(down.sub, "On invoice");
  eq(down.invoiceId, 7);
  const prov = adjustmentRow({ ...base, applies: true, reason: "applies", amount_zar: 1275.46, direction: "up",
    description: "x", provisional: true });
  eq(sp(prov.title), "If the price stays at R 32,80/L, the fuel part goes up R 1 275,46.");
  eq(prov.amount, null);
  eq(prov.sub, "Final on the trip date.");
}
eq(draftClauseLine("Priced on diesel at R 32,80/L.", "If the official price moves more than 5% before the trip, the fuel part of this quote changes by the same amount."),
  "Priced on diesel at R 32,80/L. If the official price moves more than 5% before the trip, the fuel part of this quote changes by the same amount.");
eq(draftClauseLine(null, null), null);
eq(promptExample(7.5), "If the official price moves more than 7,5% before the trip, the fuel part of this quote changes by the same amount.");

// --- fuel alert
eq(sp(alertPriceLine({ old_price: 29.5551, new_price: 32.7989, zone: "INLAND" })), "R 29,56 → R 32,80/L (official inland)");
eq(sp(floorChange({ floor_then: 32346.8, floor_now: 33622.26 })), "R 32 347 → R 33 622");
eq(marginChange({ margin_then: 11.0, margin_now: 7.49 }), "11,0% → 7,5%");
eq(marginChange({ margin_then: null, margin_now: 7.49 }), "— → 7,5%");
deq(sortAlertQuotes([
  { quote_id: 1, under_target: false, still_open: true },
  { quote_id: 2, under_target: true, still_open: false },
  { quote_id: 3, under_target: true, still_open: true },
]).map(q => q.quote_id), [3, 1, 2]);

// --- follow-up card
eq(sentLine({ days_since_sent: 3, sent_at_estimated: false }), "Sent 3 days ago");
eq(sentLine({ days_since_sent: 3, sent_at_estimated: true }), "Sent about 3 days ago");
eq(sentLine({ days_since_sent: 0, sent_at_estimated: false }), "Sent today");
eq(sentLine({ days_since_sent: 1, sent_at_estimated: false }), "Sent yesterday");
eq(sentLine({ days_since_sent: null, sent_at_estimated: false }), null);
eq(expiresLine({ valid_until: "2026-11-07", expires_in_days: 30 }), "Expires Sat 7 Nov");
eq(expiresLine({ valid_until: "2026-10-09", expires_in_days: 1 }), "Expires tomorrow");
eq(expiresLine({ valid_until: "2026-10-08", expires_in_days: 0 }), "Expires today");
eq(expiresLine({ valid_until: null, expires_in_days: null }), null);
eq(lastReminderLine({ reminder: { last_sent_at: "2026-10-02T08:00:00+02:00" } }), "Last reminder 2 Oct");
eq(lastReminderLine({ reminder: { last_sent_at: null } }), null);
eq(cleanNote("  hi  "), "hi");
eq(cleanNote("x".repeat(600)).length, 500);
eq(showFollowUp("SENT"), true);
eq(showFollowUp("DRAFT"), false);

// --- notifications
eq(followUpLink("quote.fuel_alert", { link: "/bookings/quotes?fuel_alert=4" }), "/bookings/quotes?fuel_alert=4");
eq(followUpLink("quote.fuel_alert", { alert_id: 4 }), "/bookings/quotes?fuel_alert=4");
eq(followUpLink("quote.no_answer", { quote_id: 9 }), "/bookings/quotes/9?follow_up=1");
eq(followUpLink("quote.expiring", { quote_id: 9 }), "/bookings/quotes/9?follow_up=1");
eq(followUpLink("quote.sent", { quote_id: 9 }), null);
eq(fuelAlertParam("?fuel_alert=12"), 12);
eq(fuelAlertParam("?fuel_alert=abc"), null);
eq(fuelAlertParam(""), null);

// --- settings
const saved = { fuel_surcharge_enabled: false, fuel_surcharge_threshold_pct: 5, fuel_surcharge_prompt_pending: true,
  fuel_surcharge_decided_at: null, fuel_alerts_enabled: true, follow_ups_enabled: true, follow_up_after_days: 3,
  expiry_nudge_days: 2, weekly_margin_email_enabled: true };
deq(automationPatch(saved, { ...saved }), {});
deq(automationPatch(saved, { ...saved, fuel_surcharge_enabled: true, fuel_surcharge_threshold_pct: 7.5 }),
  { fuel_surcharge_enabled: true, fuel_surcharge_threshold_pct: 7.5 });
deq(automationChangeLines(saved, { fuel_surcharge_enabled: true, fuel_surcharge_threshold_pct: 7.5, follow_up_after_days: 1 }), [
  "Fuel price clause on quotes: Off to On",
  "Fuel clause threshold: 5% to 7,5%",
  "Reminder after no answer: 3 days to 1 day",
]);
eq(boundError("fuel_surcharge_threshold_pct", "7,5"), null);
eq(boundError("fuel_surcharge_threshold_pct", "0.5"), "Enter a fuel price change between 1% and 25%.");
eq(boundError("fuel_surcharge_threshold_pct", "26"), "Enter a fuel price change between 1% and 25%.");
eq(boundError("follow_up_after_days", "2.5"), "Enter a number of days between 1 and 30.");
eq(boundError("expiry_nudge_days", "15"), "Enter a number of days between 1 and 14.");
eq(boundError("expiry_nudge_days", ""), "Enter a number of days between 1 and 14.");

// --- errors
eq(apiMessage({ data: { success: false, code: "too_soon", message: "A reminder went out less than a day ago." } }, "x"),
  "A reminder went out less than a day ago.");
eq(apiMessage(new Error("HTTP error! status: 500"), "Could not send."), "Could not send.");
deq(fieldErrors({ data: { code: "invalid_input", errors: { follow_up_after_days: "Enter a number of days between 1 and 30." } } }),
  { follow_up_after_days: "Enter a number of days between 1 and 30." });

// --- weekly margin report
eq(reportPct(null), "—");
eq(actualMarginText({ loads: 2, actual_loads: 1, actual_margin_pct: 13.9 }), "13,9% (1 of 2 loads)");
eq(actualMarginText({ loads: 1, actual_loads: 1, actual_margin_pct: 13.9 }), "13,9%");
eq(actualMarginText({ loads: 2, actual_loads: 0, actual_margin_pct: null }), "—");
eq(ptsText(6.7), "+6,7 pts");
eq(ptsText(-4.6), "−4,6 pts");

// No em dash in any sentence we write (the "—" placeholder for no value aside).
for (const s of [promptExample(5), sentLine({ days_since_sent: 2, sent_at_estimated: true }), expiresLine({ valid_until: "2026-11-07", expires_in_days: 3 })]) {
  assert.ok(!s.includes("—")); n++;
}
  assert.ok(n > 60, `${n} cases`);
});

test('app extras: the PDF fuel line, prompt reference, setup rows, reminder copy', () => {
  assert.equal(
    fuelReferenceLine({ fuel_price_used: 32.7989, fuel_price_source: 'official', fuel_zone: 'INLAND',
      fuel_effective_from: '2026-10-07T00:01:00+02:00', priced_at: '2026-10-08T09:00:00+02:00' }),
    'Priced on diesel at R 32,80/L (official inland, 7 Oct 2026).',
  );
  assert.equal(
    fuelReferenceLine({ fuel_price_used: 29.11, fuel_price_source: 'own', fuel_zone: 'COASTAL',
      priced_at: '2026-10-06T22:30:00Z', costing_snapshot: { diesel: { fuel_type: 'Petrol', grade: '95' } } }),
    'Priced on petrol 95 at R 29,11/L (own price, 7 Oct 2026).',
  );
  assert.equal(fuelReferenceLine({ fuel_price_used: null, fuel_price_source: 'official' }), null);
  assert.equal(promptReference(32.8, 'INLAND', '2026-10-07T00:01:00+02:00'),
    'Priced on diesel at R 32,80/L (official inland, 7 Oct 2026). ');
  assert.equal(promptReference(null, 'INLAND', null), '');

  const setup = { unset: ['target_margin', 'fuel_mode'], items: [
    { key: 'target_margin', set: false }, { key: 'operating_cost', set: true },
    { key: 'driver_allowance', set: true }, { key: 'fuel_mode', set: false }] };
  assert.deepEqual(unsetItems(setup).map((i) => i.key), ['target_margin', 'fuel_mode']);
  assert.deepEqual(confirmBody(setup), { action: 'confirm', keys: ['target_margin', 'fuel_mode'] });
  assert.deepEqual(unsetItems(null), []);

  assert.equal(reminderSendLabel('buyer@acme.test'), 'Send to buyer@acme.test');
  assert.equal(reminderSentText('buyer@acme.test'), 'Reminder sent to buyer@acme.test');
  assert.equal(followUpParam('?follow_up=1'), true);
  assert.equal(followUpParam('?follow_up=0'), false);
  assert.equal(boundValue('7,5'), 7.5);
  assert.equal(boundText(7.5), '7,5');
  assert.equal(boundText(null), '');
  assert.equal(apiCode({ data: { code: 'too_soon' } }), 'too_soon');
  assert.equal(shortDay('2026-10-01T23:30:00Z'), '2 Oct');
});
