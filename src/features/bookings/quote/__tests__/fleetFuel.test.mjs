// Run: node --test src/features/bookings/quote/__tests__/fleetFuel.test.mjs
// Fleet actuals display rules (measured fuel use from Cartrack). The same
// checks run in the web (scripts/test-fleet-fuel.mjs): quote/fleetFuel.ts is shared byte for byte.
import assert from "node:assert/strict";
import {
  l100, kmText, sastDay, sastDayTime, burnInUse, fuelCell, selectedMode, periodHeading, measuredLines, methodSentence,
  confidenceChip, unusableText, leftOut, headerStrip, truckCard, quoteBurnLine, burnDetail, localRatedBurn,
  measuredActionFor, burnChange, noticeWithBurn, pricedOnText, cooldownText, snapshotFuelAmount,
} from "../fleetFuel.ts";

let n = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

const M = {
  rated_burn_l_per_100km: 40.2, display: "40,2 L/100 km", label: "Measured by Cartrack: 40,2 L/100 km over 18 400 km (90 days)",
  l_per_100km: 34.2, loaded_km: 9400, loaded_l_per_100km: 37.6, loaded_mean_load_ratio: 0.8, other_km: 9000,
  other_l_per_100km: 28.7, distance_km: 18412.4, litres: 6297, rated_method: "overall_assumed", fuel_source: "can_bus",
  period_start: "2026-07-01T09:00:00+02:00", period_end: "2026-10-06T09:00:00+02:00", period_days: 90, vehicles_count: 3,
  rejections: [], confidence: "high", sufficient: true, usable: true, unusable_reason: null, note: "",
  computed_at: "2026-10-06T02:31:00+02:00",
};
const row = (over = {}) => ({
  id: 7, name: "Superlink", shared_default: false, capacity_t: 34, configured_l_per_100km: 42, configured_source: "configured",
  burn_mode: "AUTO", in_use: { value: 40.2, source: "measured", label: M.label }, measured: M, can_use_measured: true, ...over,
});

// formatting
eq(l100(40.2), "40,2 L/100 km");
eq(l100(32.45), "32,5 L/100 km");
eq(l100(null), null);
eq(kmText(18412.4), "18 400 km");
eq(kmText(640), "640 km");
eq(sastDay("2026-10-05T23:30:00Z"), "6 Oct");          // SAST, not UTC
eq(sastDay("2026-07-01"), "1 Jul");
eq(sastDayTime("2026-10-06T00:31:00Z"), "6 Oct, 02:31");

// burn in use (local compute mirrors the server)
const vt = { fuel_consumption_l_per_100km: "42.00", fuel_use_in_use: { value: 40.2, source: "measured", configured: 42, burn_mode: "AUTO" } };
eq(burnInUse(vt), 40.2);
eq(burnInUse(vt, true), 42);
eq(burnInUse({ fuel_consumption_l_per_100km: "38" }), 38);
eq(burnInUse({ fuel_consumption_l_per_100km: null, fuel_use_in_use: { value: null, source: "missing" } }), null);
eq(burnInUse({ fuel_consumption_l_per_100km: "42", fuel_use_in_use: { value: 42, source: "configured", configured: 42 } }, true), 42);
eq(burnInUse(null), null);

// vehicle types cell
eq(fuelCell(row()), { value: "40,2 L/100 km", tag: "Measured", sub: "Cartrack, 18 400 km, last 90 days", offerUseMeasured: false, missing: false });
eq(fuelCell(row({ burn_mode: "CONFIGURED", in_use: { value: 42, source: "configured" } })),
  { value: "42,0 L/100 km", tag: "Your figure", sub: "Measured: 40,2 L/100 km", offerUseMeasured: true, missing: false });
eq(fuelCell(row({ measured: null, can_use_measured: false, in_use: { value: 42, source: "configured" } })).sub, null);
eq(fuelCell(row({ shared_default: true, measured: null, can_use_measured: false, in_use: { value: 38, source: "standard" } })).tag, "Standard estimate");
eq(fuelCell(row({ measured: null, in_use: { value: null, source: "missing" } })).value, "Not set");
// a measured figure that can't be used is not offered
eq(fuelCell(row({ in_use: { value: 42, source: "configured" }, can_use_measured: false, measured: { ...M, usable: false, unusable_reason: "stale" } })).offerUseMeasured, false);
eq(selectedMode(row()), "MEASURED");
eq(selectedMode(row({ burn_mode: "CONFIGURED", in_use: { value: 42, source: "configured" } })), "CONFIGURED");
eq(selectedMode(row({ measured: { ...M, usable: false }, in_use: { value: 42, source: "configured" } })), "CONFIGURED");

// detail
eq(periodHeading(M), "Measured fuel use (Cartrack, 1 Jul to 6 Oct)");
eq(measuredLines(M), [
  "Full-load figure used for quotes: 40,2 L/100 km",
  "Average on all km: 34,2 L/100 km over 18 400 km",
  "On recorded loads: 37,6 L/100 km over 9 400 km (average load 80%)",
  "Not on a recorded load: 28,7 L/100 km",
  "Trucks: 3",
  "Fuel data: engine fuel counter (CAN)",
]);
eq(measuredLines({ ...M, loaded_km: 0, fuel_source: "fuel_level" }).filter((l) => l.startsWith("On recorded") || l.startsWith("Fuel data")),
  ["Fuel data: tank level sensor"]);
eq(methodSentence("loaded_trips"), "Worked out from your recorded loads and their weights.");
eq(methodSentence("overall_assumed"), "Worked out from all km; km not on a recorded load are counted as half-loaded on average.");
eq(confidenceChip(M).text, "High");
eq(confidenceChip({ ...M, confidence: "insufficient" }).text, "Not enough data yet (needs 2 000 km)");
eq(confidenceChip({ ...M, confidence: "rejected" }).text, "Failed checks");
eq(unusableText(M), null);
eq(unusableText({ ...M, usable: false, unusable_reason: "stale", computed_at: "2026-09-02T02:30:00+02:00" }), "Out of date (last measured 2 Sep)");
eq(unusableText({ ...M, usable: false, unusable_reason: "tracker_disconnected" }), "Reconnect Cartrack to use this");
const rej = [
  { reason: "odometer_reset", start: "2026-07-01T00:00:00+02:00", plate: "CA100GP" },
  { reason: "differs_from_type", plate: "CA300GP", detail: "average 52,1 L/100 km vs type median 40,2" },
  ...Array.from({ length: 5 }, () => ({ reason: "api_error" })),
];
const lo = leftOut(rej);
eq(lo.lines[0], "CA100GP, Odometer reset, 1 Jul");
eq(lo.lines[1], "CA300GP, Truck differs from the others, average 52,1 L/100 km vs type median 40,2");
eq(lo.lines[2], "Tracker didn't answer");
eq(lo.lines.length, 5);
eq(lo.more, "and 2 more");
eq(leftOut([{ reason: "too_short" }]).lines, []);

// header strip
const conn = { provider: "cartrack", reason: null, can_measure: true };
const run = { status: "ok", finished_at: "2026-10-06T02:31:00+02:00", summary: { matched: 4, unmatched: ["ZZ999GP", "ZZ998GP", "ZZ997GP"], no_fuel_sensor: ["CA700GP", "CA701GP"] } };
const s = headerStrip({ connection: conn, last_run: run });
eq(s.main, "Fuel use measured by Cartrack weekly. Last updated 6 Oct, 02:31.");
eq(s.lines, ["3 Cartrack trucks don't match a truck here (registration differs).", "2 trucks have no fuel sensor in Cartrack."]);
eq(s.link, { text: "Fleet", to: "fleet" });
eq(s.canRefresh, true);
eq(headerStrip({ connection: conn, last_run: { status: "partial", summary: {} } }).lines,
  ["Last refresh couldn't reach every truck. Their last measured figures are kept."]);
{ // a failed run: plain words, never the tracker's error text, and no "Last updated"
  const f = headerStrip({ connection: conn, last_run: { status: "failed", finished_at: "2026-10-06T02:31:00+02:00", message: "Cartrack GET /vehicles failed: 500" } });
  eq(f.lines, ["Last refresh failed: Cartrack didn't answer. Your last measured figures are kept."]);
  eq(f.main, "Fuel use measured by Cartrack weekly.");
  assert.ok(!JSON.stringify(f).includes("500")); n++;
}
{ // 15-minute cooldown
  const now = new Date("2026-10-09T12:20:00Z");
  eq(headerStrip({ connection: conn, last_run: run, refresh_next_at: "2026-10-09T14:35:00+02:00" }, now).cooldown, "You can refresh again at 14:35");
  eq(headerStrip({ connection: conn, last_run: run, refresh_next_at: "2026-10-09T14:15:00+02:00" }, now).cooldown, null);
  eq(headerStrip({ connection: conn, last_run: run, refresh_queued: true, refresh_next_at: "2026-10-09T14:35:00+02:00" }, now).cooldown, null);
  eq(cooldownText("2026-10-09T12:35:00Z", now), "You can refresh again at 14:35");
  eq(cooldownText(null, now), null);
}
eq(headerStrip({ connection: { provider: null, reason: "CtrlFleet's API has no fuel or odometer data, so fuel use can't be measured from it." }, last_run: null }).main,
  "CtrlFleet doesn't share fuel data, so fuel use can't be measured. Your figures are used.");
const none = headerStrip({ connection: { provider: null, reason: "No fleet tracker connected." }, last_run: null });
eq([none.main, none.link?.to, none.canRefresh], ["Connect Cartrack to measure fuel use per truck.", "integrations", false]);
eq(headerStrip({ connection: conn, last_run: null }).main, "Fuel use measured by Cartrack weekly.");

// truck card
const truck = { id: 3, plate: "CA100GP", vehicle_type_id: 7, vehicle_type: "Superlink",
  measured: { ...M, l_per_100km: 40.1, distance_km: 6100, rated_burn_l_per_100km: 47 } };
const tc = truckCard(truck, row());
eq(tc.value, "47,0 L/100 km");
eq(tc.lines, ["Average 40,1 L/100 km over 6 100 km", "Fuel data: engine fuel counter (CAN)"]);
eq(tc.typeLine, "Type figure: 40,2 L/100 km");
eq(tc.amber, "Uses more than other trucks of this type");             // 40,1 > 34,2 x 1,15
eq(truckCard({ ...truck, measured: { ...truck.measured, l_per_100km: 36 } }, row()).amber, null);
eq(truckCard({ ...truck, measured: null }, row()), null);
eq(truckCard({ ...truck, measured: { rated_burn_l_per_100km: null, fuel_source: "", note: "Cartrack reports no fuel sensor on this truck." } }, row()).lines,
  ["Cartrack reports no fuel sensor on this truck."]);

// quote fuel line
eq(quoteBurnLine({ value: 40.2, source: "measured", label: M.label, configured: 42, chosen_by: "measured" }),
  { label: M.label, quoteChoice: false, offerUseMeasured: false, offerUseMine: true });
eq(quoteBurnLine({ value: 42, source: "configured", label: "Your figure: 42,0 L/100 km (vehicle type settings); measured 40,2 L/100 km", configured: 42, chosen_by: "quote" }),
  { label: "Your figure: 42,0 L/100 km (your choice for this quote)", quoteChoice: true, offerUseMeasured: true, offerUseMine: false });
eq(quoteBurnLine({ value: 38, source: "standard", label: "Standard estimate: 38,0 L/100 km (TruckWys default for this truck type)", configured: 38, chosen_by: null }).offerUseMine, false);
eq(quoteBurnLine(null), null);
eq(burnDetail(37.94), "Full-load figure; this load burns 37,9 L/100 km");
eq(localRatedBurn(vt).source, "measured");
eq(localRatedBurn(vt, true).chosen_by, "quote");
eq(localRatedBurn(vt, true).label, "Your figure: 42,0 L/100 km (vehicle type settings)");
eq(localRatedBurn({ fuel_consumption_l_per_100km: "38" }).label, "Your figure: 38,0 L/100 km (vehicle type settings)");
eq(measuredActionFor({ quoteUsesConfigured: true, typeMode: "CONFIGURED", isAdmin: false }), "clear_quote_choice");
eq(measuredActionFor({ quoteUsesConfigured: false, typeMode: "CONFIGURED", isAdmin: true }), "switch_type");
eq(measuredActionFor({ quoteUsesConfigured: false, typeMode: "CONFIGURED", isAdmin: false }), "ask_admin");
eq(measuredActionFor({ quoteUsesConfigured: false, typeMode: "AUTO", isAdmin: true }), "none");

// reopen (= backend burn_change wording)
const meas = { value: 40.2, source: "measured" };
const conf = { value: 42, source: "configured" };
eq(burnChange(conf, meas).text, "Fuel use now measured by Cartrack (42,0 → 40,2 L/100 km).");
eq(burnChange(meas, conf).text, "Fuel use now from your figure (40,2 → 42,0 L/100 km).");
eq(burnChange(meas, { value: 38.9, source: "measured" }).text, "Fuel use updated from Cartrack (40,2 → 38,9 L/100 km).");
eq(burnChange(conf, { value: 40, source: "configured" }).text, "Truck fuel use changed (42,0 → 40,0 L/100 km).");
eq(burnChange(meas, { value: 40.24, source: "measured" }), null);
eq(burnChange(null, meas), null);
eq(noticeWithBurn("Costs down R 112 since 7 Oct.", meas, { value: 38.9, source: "measured" }),
  "Costs down R 112 since 7 Oct. Fuel use updated from Cartrack (40,2 → 38,9 L/100 km).");
eq(noticeWithBurn("Costs down R 112 since 7 Oct.", meas, meas), "Costs down R 112 since 7 Oct.");
eq(noticeWithBurn(null, meas, conf), null);
eq(pricedOnText({ value: 40.2, source: "measured" }), "Priced on 40,2 L/100 km measured by Cartrack");
eq(pricedOnText({ value: 40.2, source: "measured" }, 7120.4), "Priced on 40,2 L/100 km measured by Cartrack: fuel R 7 120");
eq(snapshotFuelAmount({ lines: [{ key: "fuel", amount: 7000.25 }, { key: "fuel_return", amount: 3100 }, { key: "tolls", amount: 900 }] }), 10100.25);
eq(snapshotFuelAmount({ lines: [{ key: "fuel", amount: null }] }), null);
eq(snapshotFuelAmount(null), null);
eq(pricedOnText({ value: 42, source: "configured" }), "Priced on your figure, 42,0 L/100 km");
eq(pricedOnText(null), null);

// no em dashes anywhere in the copy
{
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../fleetFuel.ts", import.meta.url), "utf8");
  assert.ok(!src.includes("\u2014"), "no em dash in fleetFuel.ts"); n++;
}

console.log(`fleet fuel: ${n} checks passed`);
