// Fleet actuals: measured fuel use per truck from Cartrack (QUOTE-RULES
// "Measured fuel use from the fleet tracker"; FLEET-ACTUALS-CLIENT-SPEC.md).
// Pure display rules, self-contained so the web and the app share this file
// byte for byte (same tests in both repos). SA formatting: "40,2 L/100 km",
// "18 400 km", dates in SAST ("6 Oct").

export type BurnSource = "measured" | "configured" | "standard" | "missing";
export type BurnMode = "AUTO" | "MEASURED" | "CONFIGURED";

export interface Rejection { reason: string; window?: string; start?: string; end?: string; plate?: string; detail?: string }

export interface Measured {
  rated_burn_l_per_100km: number | null;
  display?: string | null;
  label?: string | null;
  l_per_100km?: number | null;
  loaded_km?: number | null;
  loaded_l_per_100km?: number | null;
  loaded_mean_load_ratio?: number | null;
  other_km?: number | null;
  other_l_per_100km?: number | null;
  distance_km?: number | null;
  litres?: number | null;
  rated_method?: "loaded_trips" | "overall_assumed" | string | null;
  fuel_source?: "can_bus" | "fuel_level" | "mixed" | string | null;
  period_start?: string | null;
  period_end?: string | null;
  period_days?: number | null;
  vehicles_count?: number | null;
  rejections?: Rejection[] | null;
  confidence?: "high" | "medium" | "low" | "insufficient" | "rejected" | string | null;
  sufficient?: boolean;
  usable?: boolean;
  unusable_reason?: "not_enough_data" | "stale" | "tracker_disconnected" | "rejected" | "not_measured" | string | null;
  note?: string | null;
  computed_at?: string | null;
}

export interface InUse { value: number | null; source: BurnSource | string; label?: string | null }

export interface VehicleTypeFuel {
  id: number;
  name: string;
  shared_default?: boolean;
  capacity_t?: number | null;
  configured_l_per_100km?: number | null;
  configured_source?: "configured" | "standard" | string;
  burn_mode?: BurnMode | string;
  in_use: InUse;
  measured?: Measured | null;
  can_use_measured?: boolean;
}

export interface VehicleFuel {
  id: number;
  plate: string;
  vehicle_type_id?: number | null;
  vehicle_type?: string | null;
  measured?: Measured | null;
}

export interface LastRun {
  status: "ok" | "partial" | "skipped" | "failed" | "running" | string;
  message?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  provider?: string | null;
  summary?: { matched?: number; unmatched?: string[]; no_fuel_sensor?: string[]; api_errors?: number; types_measured?: number; vehicles_in_tracker?: number } | null;
}

export interface FuelActuals {
  connection: { provider: string | null; reason?: string | null; can_measure?: boolean };
  last_run: LastRun | null;
  refresh_queued?: boolean;
  /** "Refresh now" can run again from this time (SAST ISO); null = now. */
  refresh_next_at?: string | null;
  vehicle_types: VehicleTypeFuel[];
  vehicles: VehicleFuel[];
  rules?: { period_days?: number; min_distance_km?: number; assumed_load_ratio?: number; max_age_days?: number; refresh?: string };
}

/** The vehicle types API's read-only `fuel_use_in_use`. */
export interface FuelUseInUse {
  value: number | null;
  source: BurnSource | string;
  label?: string | null;
  configured?: number | null;
  burn_mode?: BurnMode | string;
  measured?: Measured | null;
}

/** costing `resolution.rated_burn` / `snapshot.rated_burn`. */
export interface RatedBurn {
  value: number | null;
  source: BurnSource | string;
  label?: string | null;
  configured?: number | null;
  measured?: Measured | null;
  mode?: BurnMode | string;
  chosen_by?: "measured" | "settings" | "quote" | null | string;
  measured_at?: string | null;
}

// ---------------------------------------------------------------- formatting

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Half-up on the decimal form, space thousands, comma decimals ("18 400", "40,2"). */
export function fmtFigure(v: number, dp = 0): string {
  const f = 10 ** dp;
  const r = Math.sign(v) * Math.round(Math.abs(v) * f + 1e-9) / f;
  const [int, dec] = Math.abs(r).toFixed(dp).split(".");
  const txt = (int ?? "").replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (dec ? `,${dec}` : "");
  return (r < 0 && /[1-9]/.test(txt) ? "−" : "") + txt;
}

/** "40,2 L/100 km"; null for no figure. */
export function l100(v: unknown): string | null {
  const n = num(v);
  return n == null ? null : `${fmtFigure(n, 1)} L/100 km`;
}

/** km as the backend labels it: to the nearest 100 from 1 000 km. */
export function kmText(v: unknown): string | null {
  const n = num(v);
  if (n == null) return null;
  return `${fmtFigure(n >= 1000 ? Math.round(n / 100) * 100 : n)} km`;
}

/** "6 Oct" in SAST (UTC+2, no DST), whatever the device zone. */
export function sastDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (m) return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const d = new Date(t + 2 * 3600 * 1000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "6 Oct, 02:31" in SAST. */
export function sastDayTime(iso: string | null | undefined): string | null {
  const day = sastDay(iso);
  if (!day || !iso) return null;
  const d = new Date(new Date(iso).getTime() + 2 * 3600 * 1000);
  return `${day}, ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- pricing figure

/** The rated burn a quote on this type uses (= server resolve_rated_burn),
 *  for the local compute() while the server's costing is not in yet. With
 *  `useConfigured` (this quote: "Use my figure"), the typed figure. */
export function burnInUse(
  vt: { fuel_consumption_l_per_100km?: unknown; fuel_use_in_use?: FuelUseInUse | null } | null | undefined,
  useConfigured = false,
): number | null {
  if (!vt) return null;
  const typed = num(vt.fuel_consumption_l_per_100km);
  const inUse = vt.fuel_use_in_use;
  if (!inUse) return typed;
  if (useConfigured && inUse.source === "measured") return num(inUse.configured) ?? typed;
  return num(inUse.value) ?? (inUse.source === "missing" ? null : typed);
}

// ---------------------------------------------------------------- vehicle types table

export interface FuelCell {
  value: string;          // "40,2 L/100 km" | "Not set"
  tag: string | null;     // "Measured" | "Your figure" | "Standard estimate"
  sub: string | null;     // "Cartrack, 18 400 km, last 90 days" | "Measured: 40,2 L/100 km"
  offerUseMeasured: boolean;
  missing: boolean;
}

export function fuelCell(row: VehicleTypeFuel): FuelCell {
  const m = row.measured ?? null;
  const days = m?.period_days ?? 90;
  if (row.in_use.source === "measured") {
    const km = m?.rated_method === "loaded_trips" ? m?.loaded_km : m?.distance_km;
    return { value: l100(row.in_use.value) ?? "Not set", tag: "Measured",
      sub: `Cartrack, ${kmText(km) ?? "0 km"}, last ${days} days`, offerUseMeasured: false, missing: false };
  }
  if (row.in_use.source === "missing" || num(row.in_use.value) == null) {
    return { value: "Not set", tag: null, sub: null, offerUseMeasured: false, missing: true };
  }
  const tag = row.in_use.source === "standard" ? "Standard estimate" : "Your figure";
  const usable = !!(m && m.usable && num(m.rated_burn_l_per_100km) != null);
  return { value: l100(row.in_use.value)!, tag,
    sub: usable ? `Measured: ${l100(m!.rated_burn_l_per_100km)}` : null,
    offerUseMeasured: usable && !!row.can_use_measured, missing: false };
}

/** Which of the two options shows as selected (AUTO follows what prices). */
export function selectedMode(row: VehicleTypeFuel): "MEASURED" | "CONFIGURED" {
  if (row.burn_mode === "CONFIGURED") return "CONFIGURED";
  if (row.burn_mode === "MEASURED") return row.in_use.source === "measured" ? "MEASURED" : "CONFIGURED";
  return row.in_use.source === "measured" ? "MEASURED" : "CONFIGURED";
}

// ---------------------------------------------------------------- detail

export function periodHeading(m: Measured): string {
  const a = sastDay(m.period_start), b = sastDay(m.period_end);
  return a && b ? `Measured fuel use (Cartrack, ${a} to ${b})` : "Measured fuel use (Cartrack)";
}

const FUEL_SOURCE: Record<string, string> = {
  can_bus: "engine fuel counter (CAN)", fuel_level: "tank level sensor", mixed: "both",
};

export function fuelSourceText(s: string | null | undefined): string | null {
  return s ? FUEL_SOURCE[s] ?? null : null;
}

/** The figure lines of the detail, in order. */
export function measuredLines(m: Measured): string[] {
  const out: string[] = [];
  if (num(m.rated_burn_l_per_100km) != null) out.push(`Full-load figure used for quotes: ${l100(m.rated_burn_l_per_100km)}`);
  if (num(m.l_per_100km) != null) out.push(`Average on all km: ${l100(m.l_per_100km)} over ${kmText(m.distance_km)}`);
  if ((num(m.loaded_km) ?? 0) > 0) {
    const ratio = num(m.loaded_mean_load_ratio);
    out.push(`On recorded loads: ${l100(m.loaded_l_per_100km)} over ${kmText(m.loaded_km)}`
      + (ratio != null ? ` (average load ${Math.round(ratio * 100)}%)` : ""));
    if (num(m.other_l_per_100km) != null) out.push(`Not on a recorded load: ${l100(m.other_l_per_100km)}`);
  }
  if (num(m.vehicles_count) != null) out.push(`Trucks: ${m.vehicles_count}`);
  const src = fuelSourceText(m.fuel_source);
  if (src) out.push(`Fuel data: ${src}`);
  return out;
}

export function methodSentence(method: string | null | undefined): string | null {
  if (method === "loaded_trips") return "Worked out from your recorded loads and their weights.";
  if (method === "overall_assumed") return "Worked out from all km; km not on a recorded load are counted as half-loaded on average.";
  return null;
}

export type Tone = "good" | "neutral" | "warn" | "bad";

export function confidenceChip(m: Measured, minKm = 2000): { text: string; tone: Tone } {
  switch (m.confidence) {
    case "high": return { text: "High", tone: "good" };
    case "medium": return { text: "Medium", tone: "neutral" };
    case "low": return { text: "Low", tone: "warn" };
    case "rejected": return { text: "Failed checks", tone: "bad" };
    default: return { text: `Not enough data yet (needs ${fmtFigure(minKm)} km)`, tone: "neutral" };
  }
}

/** Why a figure that exists can't price quotes (null when it can, or none). */
export function unusableText(m: Measured): string | null {
  if (m.usable || num(m.rated_burn_l_per_100km) == null) return null;
  switch (m.unusable_reason) {
    case "stale": return `Out of date (last measured ${sastDay(m.computed_at) ?? "earlier"})`;
    case "tracker_disconnected": return "Reconnect Cartrack to use this";
    case "rejected": return m.note || "Failed checks";
    default: return null;
  }
}

const REASONS: Record<string, string> = {
  odometer_reset: "Odometer reset",
  terminal_changed: "Tracker unit replaced",
  burn_outlier: "Unrealistic fuel reading",
  distance_implausible: "Unrealistic distance",
  sensor_not_calibrated: "Fuel sensor not calibrated",
  fuel_level_provisional: "Fuel reading not final yet",
  fuel_counter_reset: "Fuel counter reset",
  no_fuel_data: "No fuel data",
  api_error: "Tracker didn't answer",
  differs_from_type: "Truck differs from the others",
  outside_accepted_period: "Load in a rejected period",
};

export function rejectionText(r: Rejection): string {
  const base = REASONS[r.reason] ?? "Left out";
  const when = r.start ? sastDay(r.start) : null;
  if (r.reason === "differs_from_type") return [r.plate, base, r.detail].filter(Boolean).join(", ");
  return [r.plate, base, when].filter(Boolean).join(", ");
}

/** "Left out" list: at most `max` lines, then "and n more". */
export function leftOut(rejections: Rejection[] | null | undefined, max = 5): { lines: string[]; more: string | null } {
  const list = (rejections ?? []).filter((r) => r && r.reason && r.reason !== "too_short");
  const lines = list.slice(0, max).map(rejectionText);
  return { lines, more: list.length > max ? `and ${list.length - max} more` : null };
}

// ---------------------------------------------------------------- header strip

export interface Strip {
  main: string;
  lines: string[];
  link: { text: string; to: "fleet" | "integrations" } | null;
  canRefresh: boolean;
  /** "You can refresh again at 14:35" while the 15-minute cooldown runs. */
  cooldown: string | null;
}

/** "14:35" (SAST) from an ISO time. */
export function sastTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const d = new Date(t + 2 * 3600 * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** The cooldown line, or null when "Refresh now" can run (`now` for tests). */
export function cooldownText(nextAt: string | null | undefined, now: Date = new Date()): string | null {
  if (!nextAt) return null;
  const t = new Date(nextAt).getTime();
  if (!Number.isFinite(t) || t <= now.getTime()) return null;
  return `You can refresh again at ${sastTime(nextAt)}`;
}

export const REFRESH_FAILED = "Last refresh failed: Cartrack didn't answer. Your last measured figures are kept.";
export const REFRESH_PARTIAL = "Last refresh couldn't reach every truck. Their last measured figures are kept.";

export function headerStrip(d: Pick<FuelActuals, "connection" | "last_run" | "refresh_queued" | "refresh_next_at">, now: Date = new Date()): Strip {
  const provider = d.connection?.provider ?? null;
  const reason = d.connection?.reason ?? "";
  if (provider !== "cartrack") {
    if (/ctrlfleet/i.test(reason)) {
      return { main: "CtrlFleet doesn't share fuel data, so fuel use can't be measured. Your figures are used.",
        lines: [], link: null, canRefresh: false, cooldown: null };
    }
    return { main: "Connect Cartrack to measure fuel use per truck.", lines: [],
      link: { text: "Integrations", to: "integrations" }, canRefresh: false, cooldown: null };
  }
  const run = d.last_run;
  // A failed run updated nothing: no "Last updated" for it. Its own text
  // (the tracker's error) is for the dev team, never shown here.
  const when = run?.status === "failed" ? null : sastDayTime(run?.finished_at ?? null);
  const main = `Fuel use measured by Cartrack weekly.${when ? ` Last updated ${when}.` : ""}`;
  const lines: string[] = [];
  if (run?.status === "partial") lines.push(REFRESH_PARTIAL);
  if (run?.status === "failed") lines.push(REFRESH_FAILED);
  const unmatched = run?.summary?.unmatched?.length ?? 0;
  const noSensor = run?.summary?.no_fuel_sensor?.length ?? 0;
  let link: Strip["link"] = null;
  if (unmatched > 0) {
    lines.push(`${unmatched} Cartrack truck${unmatched === 1 ? " doesn't" : "s don't"} match a truck here (registration differs).`);
    link = { text: "Fleet", to: "fleet" };
  }
  if (noSensor > 0) lines.push(`${noSensor} truck${noSensor === 1 ? " has" : "s have"} no fuel sensor in Cartrack.`);
  return { main, lines, link, canRefresh: true, cooldown: d.refresh_queued ? null : cooldownText(d.refresh_next_at, now) };
}

// ---------------------------------------------------------------- vehicle detail

export interface TruckCard {
  value: string | null;
  lines: string[];
  chip: { text: string; tone: Tone } | null;
  typeLine: string | null;
  amber: string | null;
}

/** Card "Fuel use (last 90 days)" on a truck; null when nothing measured. */
export function truckCard(v: VehicleFuel, type: VehicleTypeFuel | null | undefined, minKm = 2000): TruckCard | null {
  const m = v.measured;
  if (!m) return null;
  const lines: string[] = [];
  if (num(m.l_per_100km) != null) lines.push(`Average ${l100(m.l_per_100km)} over ${kmText(m.distance_km)}`);
  const src = fuelSourceText(m.fuel_source);
  if (src) lines.push(`Fuel data: ${src}`);
  if (!m.fuel_source && m.note) lines.push(m.note);
  const typeFig = type ? num(type.in_use.value) : null;
  const truckAvg = num(m.l_per_100km);
  const typeAvg = num(type?.measured?.l_per_100km);
  const amber = truckAvg != null && typeAvg != null && typeAvg > 0 && truckAvg > typeAvg * 1.15 && type
    ? "Uses more than other trucks of this type" : null;
  return {
    value: l100(m.rated_burn_l_per_100km),
    lines,
    chip: m.fuel_source ? confidenceChip(m, minKm) : null,
    typeLine: typeFig != null ? `Type figure: ${l100(typeFig)}` : null,
    amber,
  };
}

// ---------------------------------------------------------------- quote fuel line

export interface QuoteBurnLine {
  label: string;
  /** "(your choice for this quote)" is part of `label` when true. */
  quoteChoice: boolean;
  /** Link "Use measured" (removes use_configured_burn). */
  offerUseMeasured: boolean;
  /** "Use my figure for this quote" (sets use_configured_burn). */
  offerUseMine: boolean;
}

export function quoteBurnLine(rb: RatedBurn | null | undefined): QuoteBurnLine | null {
  if (!rb || !rb.label) return null;
  const quoteChoice = rb.chosen_by === "quote";
  const base = rb.label.split("; measured ")[0] ?? rb.label;
  return {
    // One bracket: "Your figure: 42,0 L/100 km (your choice for this quote)".
    label: quoteChoice ? `${base.replace(/ \(vehicle type settings\)$/, "")} (your choice for this quote)` : base,
    quoteChoice,
    offerUseMeasured: quoteChoice,
    offerUseMine: rb.source === "measured" && num(rb.configured) != null,
  };
}

/** Hover / tap detail: "Full-load figure; this load burns 37,9 L/100 km". */
export function burnDetail(loadedBurn: number | null | undefined): string {
  const b = num(loadedBurn);
  return b != null ? `Full-load figure; this load burns ${l100(b)}` : "Full-load figure";
}

/** Label for a quote's own fuel use from the vehicle type list while the
 *  server's costing is not in yet (same words as the server). */
export function localRatedBurn(
  vt: { fuel_consumption_l_per_100km?: unknown; fuel_use_in_use?: FuelUseInUse | null } | null | undefined,
  useConfigured = false,
): RatedBurn | null {
  if (!vt) return null;
  const inUse = vt.fuel_use_in_use;
  if (!inUse) {
    const typed = num(vt.fuel_consumption_l_per_100km);
    return typed == null ? null : { value: typed, source: "configured", label: `Your figure: ${l100(typed)} (vehicle type settings)`, configured: typed };
  }
  if (useConfigured && inUse.source === "measured") {
    const c = num(inUse.configured);
    if (c == null) return { ...inUse, chosen_by: "measured" };
    return { value: c, source: "configured", label: `Your figure: ${l100(c)} (vehicle type settings)`,
      configured: c, measured: inUse.measured ?? null, mode: inUse.burn_mode, chosen_by: "quote" };
  }
  return { value: num(inUse.value), source: inUse.source, label: inUse.label ?? null, configured: num(inUse.configured),
    measured: inUse.measured ?? null, mode: inUse.burn_mode,
    chosen_by: inUse.source === "measured" ? "measured" : (inUse.measured?.usable ? "settings" : null) };
}

/** What "Use measured figure" (warning action use_measured_burn) does here. */
export function measuredActionFor(opts: { quoteUsesConfigured: boolean; typeMode: string | null | undefined; isAdmin: boolean }):
  "clear_quote_choice" | "switch_type" | "ask_admin" | "none" {
  if (opts.quoteUsesConfigured) return "clear_quote_choice";
  if (opts.typeMode === "CONFIGURED") return opts.isAdmin ? "switch_type" : "ask_admin";
  return "none";
}

export const ASK_ADMIN = "Ask an admin to switch";

// ---------------------------------------------------------------- reopen

export interface BurnSnap { value: number | null; source?: string | null; measured_at?: string | null }

/** = backend quote_costing.burn_change(): why the truck's fuel use differs
 *  from when the quote was priced; null when the same (< 0,05) or unknown. */
export function burnChange(then: BurnSnap | null | undefined, now: BurnSnap | null | undefined):
  { then: number; now: number; source_then: string | null; source_now: string | null; text: string } | null {
  if (!then || !now) return null;
  const a = num(then.value), b = num(now.value);
  if (a == null || b == null || Math.abs(a - b) < 0.05) return null;
  const figs = `(${fmtFigure(a, 1)} → ${fmtFigure(b, 1)} L/100 km)`;
  const sa = then.source ?? null, sb = now.source ?? null;
  const text = sa === "measured" && sb === "measured" ? `Fuel use updated from Cartrack ${figs}.`
    : sb === "measured" ? `Fuel use now measured by Cartrack ${figs}.`
    : sa === "measured" ? `Fuel use now from your figure ${figs}.`
    : `Truck fuel use changed ${figs}.`;
  return { then: a, now: b, source_then: sa, source_now: sb, text };
}

/** The reopen notice with the fuel-use sentence the server appends. */
export function noticeWithBurn(notice: string | null | undefined, then: BurnSnap | null | undefined, now: BurnSnap | null | undefined): string | null {
  if (!notice) return notice ?? null;
  const bc = burnChange(then, now);
  return bc && !notice.includes(bc.text) ? `${notice} ${bc.text}` : notice;
}

/** "R 7 120" (whole rand, space thousands). */
export function randWhole(v: unknown): string | null {
  const n = num(v);
  return n == null ? null : `R ${fmtFigure(n)}`;
}

/** The fuel amount a saved quote was priced on: its snapshot's fuel lines. */
export function snapshotFuelAmount(snapshot: { lines?: { key?: string; amount?: number | null }[] | null } | null | undefined): number | null {
  const lines = (snapshot?.lines ?? []).filter((l) => l && (l.key === "fuel" || l.key === "fuel_return"));
  if (!lines.length || lines.some((l) => num(l.amount) == null)) return null;
  return Math.round(lines.reduce((t, l) => t + (num(l.amount) ?? 0), 0) * 100) / 100;
}

/** Under the fuel line of a reopened quote that keeps its price: the figure
 *  AND the fuel amount it was priced on (the row itself shows today's). */
export function pricedOnText(snap: RatedBurn | null | undefined, pricedFuel?: number | null): string | null {
  const v = l100(snap?.value);
  if (!snap || !v) return null;
  const amt = randWhole(pricedFuel);
  const tail = amt ? `: fuel ${amt}` : "";
  if (snap.source === "measured") return `Priced on ${v} measured by Cartrack${tail}`;
  if (snap.source === "standard") return `Priced on the standard estimate, ${v}${tail}`;
  return `Priced on your figure, ${v}${tail}`;
}
