import { useQuery } from '@tanstack/react-query';
import { fetchData } from '@/lib/api/client';
import { asArray } from '@/lib/api/list';
import {
  normalizeFinance,
  normalizeQuote,
  normalizeLoad,
  type FinanceSummary,
  type QuoteLite,
  type LoadLite,
} from '@/types/domain';

// The Overview dashboard used to be one query fanning out to all six of these
// endpoints via Promise.all, with HomeScreen gated behind a single isLoading —
// so the screen stayed on its skeleton until the *slowest* of the six
// returned, and a sluggish `advances/` blanked the revenue hero exactly as
// hard as a sluggish `dashboard/finance/` would. Split into three sibling
// queries (still all keyed under 'overview', so the prefix-based invalidation
// in queryInvalidation.ts needs no change) so HomeScreen can paint each
// section as soon as its own data lands.
const DAY = 24 * 60 * 60 * 1000;

// Sentinel for a sub-request that failed, so we can tell "the server said
// zero" apart from "we never got an answer" within a query that combines more
// than one endpoint.
const FAILED = Symbol('failed');

// ── Finance — the hero + bento pair ─────────────────────────────────────────
export interface OverviewFinance {
  finance: FinanceSummary;
}

async function loadFinance(): Promise<OverviewFinance> {
  const finance = await fetchData('dashboard/finance/');
  return { finance: normalizeFinance(finance as Record<string, unknown> | null) };
}

export function useOverviewFinance() {
  return useQuery({
    queryKey: ['overview', 'finance'],
    queryFn: loadFinance,
    // A failed background refresh must never blank a hero that was already
    // showing good numbers.
    placeholderData: (prev) => prev,
  });
}

// ── Jobs — recent quotes/bookings, active count, the utilisation heatmap ───
export interface OverviewJobs {
  quotes: QuoteLite[];
  loads: LoadLite[];
  activeLoads: number;
  heat: number[];
}

async function loadJobs(): Promise<OverviewJobs> {
  const [quotesData, loadsData] = await Promise.all([
    fetchData('quotes/?limit=20').catch(() => FAILED),
    fetchData('loads/').catch(() => FAILED),
  ]);

  // These two are recent activity + the active count + the heatmap. Throwing
  // when both are down (rather than rendering zeros) keeps React Query
  // showing the last good numbers via placeholderData and retrying in the
  // background, instead of the section looking like there's no data at all.
  if (quotesData === FAILED && loadsData === FAILED) {
    throw new Error('Could not load recent activity');
  }

  const quotes = quotesData === FAILED ? [] : asArray(quotesData).map(normalizeQuote);
  const loads = loadsData === FAILED ? [] : asArray(loadsData).map(normalizeLoad);

  const activeLoads = loads.filter((l) =>
    ['IN_TRANSIT', 'LOADING', 'ASSIGNED', 'PENDING'].includes(l.status),
  ).length;

  // 28-day activity heatmap bucketed into 4 intensity levels.
  const counts = new Array(28).fill(0) as number[];
  const now = Date.now();
  loads.forEach((l) => {
    if (!l.createdAt) return;
    const daysAgo = Math.floor((now - new Date(l.createdAt).getTime()) / DAY);
    if (daysAgo >= 0 && daysAgo < 28) {
      const bucket = 27 - daysAgo;
      counts[bucket] = (counts[bucket] ?? 0) + 1;
    }
  });
  const max = Math.max(1, ...counts);
  const heat = counts.map((c) => (c === 0 ? 0 : Math.min(3, Math.ceil((c / max) * 3))));

  return { quotes, loads, activeLoads, heat };
}

export function useOverviewJobs() {
  return useQuery({
    queryKey: ['overview', 'jobs'],
    queryFn: loadJobs,
    placeholderData: (prev) => prev,
  });
}

// ── Fleet — CommandBar's "Fleet ready" + "Advances pending", utilisation ────
export interface OverviewFleet {
  totalVehicles: number;
  activeVehicles: number;
  advancesPending: number;
}

async function loadFleet(): Promise<OverviewFleet> {
  const [vehiclesData, fleet, advancesData] = await Promise.all([
    fetchData('vehicles/').catch(() => []),
    fetchData('fleet/overview/').catch(() => null),
    fetchData('advances/').catch(() => []),
  ]);

  const vehicles = asArray(vehiclesData);
  const advances = asArray(advancesData);

  const fleetActive =
    (fleet as { active_vehicles?: number } | null)?.active_vehicles ??
    vehicles.filter((v) => ['AVAILABLE', 'IN_USE'].includes(String((v as { status?: string }).status).toUpperCase())).length;

  return {
    totalVehicles: vehicles.length,
    activeVehicles: fleetActive,
    advancesPending: advances.filter(
      (a) => String((a as { status?: string }).status).toUpperCase() === 'PENDING',
    ).length,
  };
}

export function useOverviewFleet() {
  return useQuery({
    queryKey: ['overview', 'fleet'],
    queryFn: loadFleet,
    placeholderData: (prev) => prev,
  });
}

// Composed for call-site convenience — HomeScreen reads `.data`/`.isLoading`
// off each independently so a section can paint as soon as its own query
// resolves, without waiting on the other two.
export function useOverview() {
  return {
    finance: useOverviewFinance(),
    jobs: useOverviewJobs(),
    fleet: useOverviewFleet(),
  };
}
