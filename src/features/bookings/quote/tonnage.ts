// Tonnage quotes (rate per tonne): display helpers and API shapes shared by the
// quote builder, the load and quote screens and the contracts list. The maths
// lives in rules.ts (computeTonnage, golden-checked against the backend).
// Same helpers as the web app (src/lib/tonnage.ts).
import { fmtNum, fmtRand, type Tonnage, type TonnageTruck } from "./rules";

/** "30 t", "22,75 t", "27,5 t": SA format, up to 2 decimals, no trailing zeros. */
export function fmtTonnes(v: number | string | null | undefined): string {
  const n = Number(v);
  if (v === null || v === undefined || v === "" || !Number.isFinite(n)) return "—";
  let txt = fmtNum(n, 2);
  if (txt.includes(",")) txt = txt.replace(/0+$/, "").replace(/,$/, "");
  return `${txt} t`;
}

/** "R 1 300/t", "R 1 300,50/t"; whole: costs to the rand ("R 4 996/t"). */
export function fmtRatePerTonne(v: number | string | null | undefined, whole = false): string {
  const n = Number(v);
  if (v === null || v === undefined || v === "" || !Number.isFinite(n)) return "—";
  return `${fmtRand(n, whole || Number.isInteger(n) ? 0 : 2)}/t`;
}

/** "Superlink 34 t" */
export const truckText = (t: Pick<TonnageTruck, "name" | "payload_t">) => `${t.name || "Truck"} ${fmtTonnes(t.payload_t)}`;

/** One line: which truck the quote is priced on, and why. */
export function basisReason(t: Tonnage | null | undefined, held = false): string | null {
  if (!t) return null;
  const basis = t.trucks.find((x) => x.is_basis);
  if (!basis) return null;
  if (held) return `Priced on ${truckText(basis)}.`;
  if (t.basis_reason === "chosen") return `Priced on ${truckText(basis)}, your choice.`;
  if (t.basis_reason === "costs_unknown") return `Priced on ${truckText(basis)} until costs are known.`;
  return t.trucks.length > 1
    ? `Priced on ${truckText(basis)}: highest cost per tonne, so any truck covers it.`
    : `Priced on ${truckText(basis)}, the only truck that fits.`;
}

/** "1 load", "20 loads" */
export const loadsText = (n: number | null | undefined) => (n == null ? "—" : `${fmtNum(n)} load${n === 1 ? "" : "s"}`);

/** Load API `tonnage` (core.services.tonnage_jobs.load_billing). */
export interface LoadTonnage {
  tonnes: number; tonnes_source: "actual" | "planned"; min_tonnes: number | null; billable_tonnes: number;
  rate_per_tonne: number; amount: number; awaiting_weighbridge: boolean; flag: string | null;
}

/** Quote API `volume_contract`. */
export interface VolumeContract {
  total_tonnes: number; booked_tonnes: number; delivered_tonnes?: number; remaining_tonnes: number;
  loads_booked: number; loads_planned: number | null; tonnes_per_load: number | null;
  /** The most one call-off can carry (the largest eligible truck), when known. */
  max_tonnes_per_load?: number | null;
  contract_start?: string | null; contract_end?: string | null;
  loads?: { id: number; load_number: string; status: string; pickup_date: string | null; planned_tonnes: number | null;
    actual_tonnes: number | null; weighbridge_slip: string | null; total_amount: number }[];
}

/** Share of the contract booked, 0–100 (whole). */
export const contractPct = (c: VolumeContract) =>
  c.total_tonnes > 0 ? Math.min(100, Math.round((c.booked_tonnes / c.total_tonnes) * 100)) : 0;

/** "1 Oct – 31 Dec 2026" style period in SAST from yyyy-mm-dd strings. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function periodText(start?: string | null, end?: string | null): string | null {
  const p = (s?: string | null) => {
    const m = s ? /^(\d{4})-(\d{2})-(\d{2})/.exec(s) : null;
    return m ? { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) } : null;
  };
  const a = p(start), b = p(end);
  if (!a && !b) return null;
  const f = (x: { y: number; m: number; d: number }, year: boolean) => `${x.d} ${MONTHS[x.m]}${year ? ` ${x.y}` : ""}`;
  if (a && b) return `${f(a, a.y !== b.y)} to ${f(b, true)}`;
  return a ? `From ${f(a, true)}` : `Until ${f(b!, true)}`;
}

/** "31,24" or "31.24" tonnes (comma or point decimals), above 0 and up to 100. */
export const parseTonnes = (text: string): number | null => {
  const n = Number(text.replace(/\s/g, "").replace(",", "."));
  return text.trim() !== "" && Number.isFinite(n) && n > 0 && n <= 100 ? n : null;
};

export { nextAutoBasis, AUTO_BASIS_START, callOffCap, checkCallOff, type AutoBasis } from './tonnageRules';
