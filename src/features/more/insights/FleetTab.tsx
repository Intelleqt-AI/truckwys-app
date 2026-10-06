import { useMemo } from 'react';
import { View } from 'react-native';
import { Mono, Txt } from '@/components/ui';
import { ErrorState, ListSkeleton } from '@/components/feedback';
import { RankedList, type RankedRow } from '@/components/viz';
import { num } from '@/lib/ledger';
import { useLedger } from '@/lib/useLedger';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { randWhole } from './findings';
import { InsightCard, InsightEmpty, TabIntro, TabScroll } from './InsightCard';

const KEYS = ['vehicles'] as const;
const WORKING = ['IN_USE', 'AVAILABLE'];

/**
 * Insights > Fleet: which trucks bring in the revenue, from the figure recorded on
 * each truck's profile. Trip counts and costs are not part of it, so it says to
 * compare with care. Reads only.
 */
export function FleetTab() {
  const ledger = useLedger([...KEYS]);
  const { nav, goTab } = useAppNavigation();
  const data = ledger.data;

  const view = useMemo(() => {
    if (!data) return null;
    const list = data.vehicles;
    const working = list.filter((v) => WORKING.includes((v.status || '').toUpperCase())).length;
    const earning = list.filter((v) => num(v.revenue_generated) > 0);
    const rows: RankedRow[] = list.map((v) => ({
      id: String(v.id),
      label: v.plate,
      meta: [v.make, v.model].filter(Boolean).join(' '),
      value: num(v.revenue_generated),
      onPress: () => nav.navigate('VehicleDetail', { id: v.id }),
    }));
    return {
      count: list.length,
      working,
      earning: earning.length,
      earned: earning.reduce((s, v) => s + num(v.revenue_generated), 0),
      rows,
    };
    // `nav` is stable for the screen's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (ledger.loading) {
    return (
      <View className="p-screen">
        <ListSkeleton rows={3} />
      </View>
    );
  }
  if (ledger.error || !data || !view) return <ErrorState onRetry={ledger.retry} message="Couldn't load your trucks." />;

  const partial = data.partial.length ? ` Based on the ${data.partial.join(', ')}.` : '';

  return (
    <TabScroll keys={KEYS}>
      <TabIntro text="Which trucks bring in the revenue" />

      {view.count === 0 ? (
        <InsightCard title="Revenue by truck">
          <InsightEmpty text="No trucks yet." action={{ label: 'Add a truck', onPress: () => goTab('Fleet', { tab: 'vehicles' }) }} />
        </InsightCard>
      ) : (
        <InsightCard
          title="Revenue by truck"
          description="All time, as recorded on each truck's profile"
          info={`Revenue recorded on each truck's profile. Trip counts and costs are not included, so compare with care.${partial}`}
        >
          {/* Fleet counts are attributes, not decisions: one line in the card, not three tiles. */}
          <View className="mb-4 flex-row gap-3 border-b border-line-row pb-3">
            <View className="flex-1">
              <Txt className="text-caption text-faint">Trucks</Txt>
              <Mono className="mt-0.5 text-callout font-semibold text-fg">{view.count}</Mono>
            </View>
            <View className="flex-1">
              <Txt className="text-caption text-faint">Available or in use</Txt>
              <Mono className="mt-0.5 text-callout font-semibold text-fg">{view.working}</Mono>
              <Txt className="text-caption text-faint">{`${view.count - view.working} in maintenance or other`}</Txt>
            </View>
            <View className="flex-1">
              <Txt className="text-caption text-faint">With revenue recorded</Txt>
              <Mono className="mt-0.5 text-callout font-semibold text-fg">{view.earning}</Mono>
              <Txt className="text-caption text-faint">{`${randWhole(view.earned)} between them`}</Txt>
            </View>
          </View>
          <RankedList
            rows={view.rows}
            format={randWhole}
            topN={8}
            noValueLabel="No revenue recorded"
            empty="No truck has revenue recorded yet."
          />
        </InsightCard>
      )}
    </TabScroll>
  );
}
