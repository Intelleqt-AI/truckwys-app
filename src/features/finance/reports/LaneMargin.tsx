import { money, moneyWhole, pct, plural } from '@/lib/ledger';
import { EST_COST, EST_REV, costBasisText, useLaneMargin } from '../lanes';
import { statementCsv } from './export';
import type { ReportProps } from './library';
import type { CellFlag, SRow, Statement, Tile } from './types';
import { Check, Empty, ReportFrame, ReportState, StatementTable } from './ui';

// Lane margin from the backend (reports/margin-by-lane/): invoiced revenue excl.
// VAT net of credit notes, less load- and trip-linked expenses excl. VAT. Where a
// load has no expense, the backend's cost model fills in and says so; those
// figures are drawn as estimates, never like recorded ones. Loads its own data.

export function LaneMargin(props: ReportProps) {
  const { companyName } = props;
  const q = useLaneMargin();
  if (!q.data) return <ReportState loading={q.isLoading} error={q.isError} onRetry={() => void q.refetch()} />;
  const { lanes, summary } = q.data;

  const rows: SRow[] = lanes.map((l): SRow => {
    const costEst = l.cost_basis !== 'actual';
    const revEst = l.revenue_basis !== 'actual';
    const costTip =
      l.cost_basis === 'mixed'
        ? `${costBasisText(l)}. ${l.estimated_cost != null ? `${money(l.estimated_cost)} of the cost is estimated. ` : ''}${EST_COST}`
        : EST_COST;
    const revTip =
      l.revenue_basis === 'mixed' ? `${l.loads_uninvoiced} of ${plural(l.loads, 'load')} not invoiced yet. ${EST_REV}` : EST_REV;
    const flags: Record<number, CellFlag> = {};
    if (revEst) flags[2] = { est: true, title: revTip };
    if (costEst && l.cost != null) {
      flags[3] = { est: true, title: costTip };
      flags[4] = { est: true, title: 'Margin uses an estimated cost or revenue; see the cost and revenue cells.' };
      flags[5] = { est: true, title: 'Margin uses an estimated cost or revenue.' };
      flags[6] = { est: false, title: costTip };
    } else if (!costEst && revEst && l.margin != null) {
      flags[4] = { est: true, title: revTip };
      flags[5] = { est: true, title: revTip };
    }
    return {
      key: l.lane,
      cells: [l.lane, l.loads, l.revenue_excl_vat, l.cost, l.margin, l.margin_pct, costBasisText(l)],
      flags,
    };
  });

  const totalRev = summary.total_revenue_excl_vat;
  const costed = lanes.filter((l) => l.cost != null);
  const totalCost = costed.reduce((s, l) => s + (l.cost ?? 0), 0);
  const costedRev = costed.reduce((s, l) => s + l.revenue_excl_vat, 0);
  const totalMargin = costed.length ? costedRev - totalCost : null;
  const anyEst = summary.loads_estimated_cost > 0 || summary.revenue_basis !== 'actual';
  const table: Statement = {
    columns: [
      { label: 'Lane' },
      { label: 'Loads', type: 'int', phone: false },
      { label: 'Revenue excl. VAT', type: 'money' },
      { label: 'Cost excl. VAT', type: 'money' },
      { label: 'Margin', type: 'money' },
      { label: 'Margin %', type: 'pct' },
      { label: 'Cost basis', phone: false },
    ],
    rows: [
      ...rows,
      {
        key: 'tot',
        kind: 'grand',
        cells: [
          'Total',
          lanes.reduce((s, l) => s + l.loads, 0),
          totalRev,
          costed.length ? totalCost : null,
          totalMargin,
          totalMargin != null && costedRev > 0 ? (totalMargin / costedRev) * 100 : null,
          costBasisText(summary),
        ],
        flags: anyEst
          ? { 3: { est: summary.cost_basis !== 'actual', title: EST_COST }, 4: { est: true, title: 'Includes estimated figures.' } }
          : undefined,
      },
    ],
  };
  const totalLoads = summary.loads_actual_cost + summary.loads_estimated_cost + summary.loads_no_cost;

  const tiles: Tile[] = [
    {
      label: 'Costed from expenses',
      value: `${summary.loads_actual_cost} of ${totalLoads}`,
      note: summary.loads_estimated_cost ? `${plural(summary.loads_estimated_cost, 'load')} estimated` : 'No estimates',
    },
    ...(summary.best_lane ? [{ label: 'Best lane', value: pct(summary.best_lane.margin_pct, 0), note: summary.best_lane.lane }] : []),
    ...(summary.worst_lane && summary.worst_lane.lane !== summary.best_lane?.lane
      ? [{ label: 'Weakest lane', value: pct(summary.worst_lane.margin_pct, 0), note: summary.worst_lane.lane }]
      : []),
    { label: 'Revenue excl. VAT', value: moneyWhole(totalRev), amount: totalRev },
  ];

  const nEst = summary.loads_estimated_cost;
  const gaps =
    nEst > 0
      ? [`${plural(nEst, 'load')} ${nEst === 1 ? 'has' : 'have'} no linked expense, so ${nEst === 1 ? 'its' : 'their'} cost is estimated (shown as est.).`]
      : undefined;

  return (
    <ReportFrame
      title="Lane margin"
      sub="Delivered loads · excl. VAT, actual vs estimate"
      companyName={companyName}
      info={[
        "Revenue: what was invoiced for the lane's loads, excl. VAT, less credit notes. A load not invoiced yet counts at its agreed price and is marked est.",
        'Cost: expenses linked to the load or its trip, excl. VAT. A load with no linked expense is costed by the cost model and marked est.',
        'Cost basis: Actual (every load costed from expenses), Estimate (none), or Mixed (some), with the count.',
        'Margin % is over the revenue of the loads that could be costed. Delivered, completed, invoiced and in-transit loads, all dates.',
      ]}
      tiles={lanes.length ? tiles : undefined}
      table={table}
      gaps={gaps}
      csv={() =>
        statementCsv('Lane margin', 'Excl. VAT; est. = modelled cost or uninvoiced load price', {
          ...table,
          columns: [
            ...table.columns,
            { label: 'Revenue basis' },
            { label: 'Loads costed from expenses' },
            { label: 'Loads with estimated cost' },
          ],
          rows: table.rows.map((r, i) => {
            const l = lanes[i];
            return i < lanes.length && l
              ? { ...r, cells: [...r.cells, l.revenue_basis, l.loads_actual_cost, l.loads_estimated_cost] }
              : { ...r, cells: [...r.cells, summary.revenue_basis, summary.loads_actual_cost, summary.loads_estimated_cost] };
          }),
        })
      }
      csvName="lane-margin"
    >
      {lanes.length === 0 ? (
        <Empty line="No delivered loads with a route yet." />
      ) : (
        <StatementTable
          table={table}
          caption="Lane margin"
          footer={
            <>
              <Check>Revenue is invoiced, excl. VAT and net of credit notes; costs are excl. VAT.</Check>
              {anyEst && <Check ok={false}>Figures marked est. are modelled, not recorded. Link expenses to loads to make them actual.</Check>}
            </>
          }
        />
      )}
    </ReportFrame>
  );
}

export default LaneMargin;
