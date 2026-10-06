import { useMemo } from 'react';
import { View } from 'react-native';
import { Txt } from '@/components/ui';
import { ErrorState, ListSkeleton } from '@/components/feedback';
import { LaneScatter, type LanePoint } from '@/components/viz';
import { plural } from '@/lib/ledger';
import { useLedger } from '@/lib/useLedger';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { randWhole } from './findings';
import { InsightCard, InsightEmpty, TabIntro, TabScroll } from './InsightCard';
import { fleetRevenuePerKm, lanePoints, lastTwelveMonths, perKmLoads } from './series';

const KEYS = ['loads'] as const;
/** A lane needs this many trips before its rate counts as evidence. */
const MIN_TRIPS = 3;

/** One line: which lane to push and which sits below the fleet's rate (lanes with enough trips only). */
function laneTakeaway(points: LanePoint[], overall: number | null): string {
  const ev = points.filter((p) => !p.thin).sort((a, b) => b.perKm - a.perKm);
  if (points.length === 0) return 'Revenue per kilometre against trip length';
  if (ev.length === 0 || !overall) {
    return `No lane has ${MIN_TRIPS} trips yet, so none can be judged; each dot's rate is in the list.`;
  }
  const vs = (v: number) => Math.round((v / overall - 1) * 100);
  const top = ev[0]!;
  const low = ev.length > 1 ? ev[ev.length - 1]! : null;
  const head =
    vs(top.perKm) > 0
      ? `${top.label} earns ${randWhole(top.perKm)}/km, ${vs(top.perKm)}% above the fleet average`
      : `Your best-evidenced lane, ${top.label}, earns ${randWhole(top.perKm)}/km, ${Math.abs(vs(top.perKm))}% below the fleet average`;
  if (!low) return `${head}.`;
  return vs(low.perKm) < 0
    ? `${head}; ${low.label} is ${Math.abs(vs(low.perKm))}% below it.`
    : `${head}; ${low.label} earns ${randWhole(low.perKm)}/km.`;
}

/**
 * Insights > Lanes: which routes pay best per kilometre. One basis with the vehicle
 * and driver pages: delivered loads with a distance, last 12 months (series.ts).
 * Margin per lane after costs is a different question and lives in Finance >
 * Reports > Lane margin. Reads only.
 */
export function LanesTab() {
  const ledger = useLedger([...KEYS]);
  const { nav } = useAppNavigation();
  const data = ledger.data;

  const view = useMemo(() => {
    if (!data) return null;
    const period = lastTwelveMonths();
    const { points, noDistance } = lanePoints(perKmLoads(data.loads, period), MIN_TRIPS);
    return { points, noDistance, overall: fleetRevenuePerKm(data.loads, period) };
  }, [data]);

  if (ledger.loading) {
    return (
      <View className="p-screen">
        <ListSkeleton rows={3} />
      </View>
    );
  }
  if (ledger.error || !data || !view) return <ErrorState onRetry={ledger.retry} message="Couldn't load your lanes." />;

  const { points, noDistance, overall } = view;
  const partial = data.partial.length ? ` Based on the ${data.partial.join(', ')}.` : '';

  return (
    <TabScroll keys={KEYS}>
      <TabIntro text="Which routes pay best per kilometre" />

      <InsightCard
        title="Revenue per km by lane"
        description="Delivered loads, last 12 months"
        info={`Revenue per kilometre against trip length, from delivered loads in the last 12 months (this month and the 11 before it) with a pickup city, delivery city and distance. "Fleet" is the fleet's revenue per km on the same basis, the figure the vehicle and driver pages compare against. Shorter trips usually earn more per kilometre, so compare lanes of similar length. Lanes with fewer than ${MIN_TRIPS} trips are drawn hollow.${noDistance > 0 ? ` ${plural(noDistance, 'lane')} without a distance ${noDistance === 1 ? 'is' : 'are'} left out.` : ''}${partial}`}
      >
        {points.length === 0 ? (
          <InsightEmpty
            text="No delivered loads with a route and distance in the last 12 months."
            action={{ label: 'Quote a load', onPress: () => nav.navigate('CreateQuote') }}
          />
        ) : (
          <>
            <Txt className="mb-3 text-callout text-fg">{laneTakeaway(points, overall)}</Txt>
            <LaneScatter points={points} overallPerKm={overall} minTrips={MIN_TRIPS} height={300} />
          </>
        )}
      </InsightCard>
    </TabScroll>
  );
}
