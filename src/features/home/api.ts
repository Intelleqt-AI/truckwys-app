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

// Aggregates the Overview dashboard from the same endpoints the web app uses.
// Each source fails soft so one dead endpoint never blanks the whole screen.
export interface OverviewData {
  finance: FinanceSummary;
  quotes: QuoteLite[];
  loads: LoadLite[];
  activeLoads: number;
  totalVehicles: number;
  activeVehicles: number;
  advancesPending: number;
  heat: number[];
}

const DAY = 24 * 60 * 60 * 1000;

// Sentinel for a sub-request that failed, so we can tell "the server said zero"
// apart from "we never got an answer".
const FAILED = Symbol('failed');

async function loadOverview(): Promise<OverviewData> {
  const [finance, quotesData, loadsData, vehiclesData, fleet, advancesData] = await Promise.all([
    fetchData('dashboard/finance/').catch(() => FAILED),
    fetchData('quotes/?limit=20').catch(() => FAILED),
    fetchData('loads/').catch(() => FAILED),
    fetchData('vehicles/').catch(() => []),
    fetchData('fleet/overview/').catch(() => null),
    fetchData('advances/').catch(() => []),
  ]);

  // These three are the whole dashboard: revenue/outstanding, recent quotes,
  // and active loads. Rendering them as zeros because a request blipped makes
  // the app look like the business has no data — which is exactly what "the
  // overview sometimes looks empty" was. Throwing instead means React Query
  // keeps showing the last good numbers and retries in the background.
  if (finance === FAILED && quotesData === FAILED && loadsData === FAILED) {
    throw new Error('Could not load your overview');
  }

  const quotes = quotesData === FAILED ? [] : asArray(quotesData).map(normalizeQuote);
  const loads = loadsData === FAILED ? [] : asArray(loadsData).map(normalizeLoad);
  const vehicles = asArray(vehiclesData);
  const advances = asArray(advancesData);

  const activeLoads = loads.filter((l) =>
    ['IN_TRANSIT', 'LOADING', 'ASSIGNED', 'PENDING'].includes(l.status),
  ).length;

  const fleetActive =
    (fleet as { active_vehicles?: number } | null)?.active_vehicles ??
    vehicles.filter((v) => ['AVAILABLE', 'IN_USE'].includes(String((v as { status?: string }).status).toUpperCase())).length;

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

  return {
    finance: normalizeFinance(finance === FAILED ? null : (finance as Record<string, unknown> | null)),
    quotes,
    loads,
    activeLoads,
    totalVehicles: vehicles.length,
    activeVehicles: fleetActive,
    advancesPending: advances.filter(
      (a) => String((a as { status?: string }).status).toUpperCase() === 'PENDING',
    ).length,
    heat,
  };
}

export function useOverview() {
  return useQuery({
    queryKey: ['overview'],
    queryFn: loadOverview,
    // A failed background refresh must never blank a dashboard that was
    // already showing good numbers.
    placeholderData: (prev) => prev,
  });
}
