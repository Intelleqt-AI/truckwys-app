import { View } from 'react-native';
import { Group, DetailRow, StatCard, KpiRow, InfoTip, Txt, EmptyState } from '@/components/ui';
import { ListSkeleton, ErrorState } from '@/components/feedback';
import { useTheme } from '@/theme/ThemeProvider';
import { formatCurrency, formatCurrencyCompact, formatPercent } from '@/lib/formatters';
import { plural } from '@/lib/ledger';
import { costBasisText, EST_COST, EST_REV, useLaneMargin, type LaneRow } from './lanes';

// Lane margin: revenue excl. VAT (net of credit notes) against load- and
// trip-linked expenses excl. VAT, per route. Estimated figures carry "est." and a
// tip saying why, so a modelled cost is never mistaken for a recorded one.

const rand = (n: number) => formatCurrency(n, { maximumFractionDigits: 0 });

function laneHint(l: LaneRow): string {
  const revEst = l.revenue_basis !== 'actual';
  const parts = [
    plural(l.loads, 'load'),
    `revenue ${rand(l.revenue_excl_vat)}${revEst ? ' est.' : ''}`,
    l.cost != null ? `cost ${rand(l.cost)}${l.cost_basis !== 'actual' ? ' est.' : ''}` : 'no cost yet',
  ];
  return parts.join(' · ');
}

export function LaneMarginReport({ limit }: { limit?: number }) {
  const { colors } = useTheme();
  const { data, isLoading, isError, refetch } = useLaneMargin();

  if (isLoading) return <ListSkeleton rows={4} />;
  if (isError || !data) return <ErrorState onRetry={refetch} message="Couldn't load lane margins." />;
  const { lanes, summary } = data;
  if (lanes.length === 0) {
    return (
      <EmptyState
        icon="route"
        title="No lane data"
        body="Lane margins appear as you deliver loads that have a route."
      />
    );
  }

  const shown = limit ? lanes.slice(0, limit) : lanes;
  const anyEst = summary.loads_estimated_cost > 0 || summary.revenue_basis !== 'actual';
  const totalLoads = summary.loads_actual_cost + summary.loads_estimated_cost + summary.loads_no_cost;
  const tipText =
    'Revenue: what was invoiced for the lane’s loads, excl. VAT, less credit notes. A load not invoiced yet counts at its agreed price and is marked est. ' +
    'Cost: expenses linked to the load or its trip, excl. VAT. A load with no linked expense is costed by the cost model and marked est. ' +
    'Margin % is over the revenue of the loads that could be costed. Delivered, completed, invoiced and in-transit loads, all dates.';

  return (
    <View>
      <View className="mb-4">
        <KpiRow>
          <StatCard
            label="Costed from expenses"
            value={`${summary.loads_actual_cost} of ${totalLoads}`}
            note={
              summary.loads_estimated_cost
                ? `${plural(summary.loads_estimated_cost, 'load')} estimated`
                : 'No estimates'
            }
          />
          <StatCard label="Revenue excl. VAT" value={formatCurrencyCompact(summary.total_revenue_excl_vat)} />
        </KpiRow>
        {(summary.best_lane || summary.worst_lane) && (
          <View className="mt-3">
            <KpiRow>
              {summary.best_lane && (
                <StatCard
                  label="Best lane"
                  value={formatPercent(summary.best_lane.margin_pct, 0)}
                  note={summary.best_lane.lane}
                />
              )}
              {summary.worst_lane && summary.worst_lane.lane !== summary.best_lane?.lane && (
                <StatCard
                  label="Weakest lane"
                  value={formatPercent(summary.worst_lane.margin_pct, 0)}
                  note={summary.worst_lane.lane}
                />
              )}
            </KpiRow>
          </View>
        )}
      </View>

      <Group label="Margin by lane">
        {shown.map((l, i) => {
          const costEst = l.cost_basis !== 'actual';
          const revEst = l.revenue_basis !== 'actual';
          const est = l.margin_pct != null && (costEst || revEst);
          return (
            <DetailRow
              key={l.lane}
              label={l.lane}
              hint={laneHint(l)}
              value={l.margin_pct == null ? '—' : `${formatPercent(l.margin_pct, 1)}${est ? ' est.' : ''}`}
              mono={false}
              valueColor={l.margin != null && l.margin < 0 ? colors.danger : undefined}
              last={i === shown.length - 1}
            />
          );
        })}
      </Group>

      <View className="mb-2 flex-row items-center gap-1.5">
        <Txt className="flex-1 text-caption text-faint">
          {anyEst
            ? 'Figures marked est. are modelled, not recorded. Link expenses to loads to make them actual.'
            : 'Revenue is invoiced, excl. VAT and net of credit notes; costs are excl. VAT.'}
        </Txt>
        <InfoTip text={`${tipText}${anyEst ? ` ${EST_COST} ${EST_REV}` : ''}`} label="About lane margin" />
      </View>
      {lanes.some((l) => l.cost_basis === 'mixed') && (
        <Txt className="text-caption text-faint">
          {lanes
            .filter((l) => l.cost_basis === 'mixed')
            .slice(0, 3)
            .map((l) => `${l.lane}: ${costBasisText(l)}`)
            .join('. ')}
        </Txt>
      )}
    </View>
  );
}
