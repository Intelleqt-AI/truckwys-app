import { DELIVERED, inPeriod, laneOf, money, moneyWhole, num, periodText, plural } from '@/lib/ledger';
import { statementCsv } from './export';
import type { ReportProps } from './library';
import type { SRow, Statement } from './types';
import { Check, Empty, PeriodControl, ReportFrame, StatementTable, usePeriod } from './ui';

export function RevenueByLane({ d, companyName }: ReportProps) {
  const [period, setPeriod] = usePeriod('last-12');
  const done = d.loads.filter((l) => DELIVERED.has((l.status || '').toUpperCase()) && inPeriod(l.delivery_date, period));
  const known = done.filter((l) => laneOf(l));
  const unknown = done.filter((l) => !laneOf(l));
  const lanes = [...new Set(known.map(laneOf))]
    .map((lane) => {
      const list = known.filter((l) => laneOf(l) === lane);
      const rev = list.reduce((s, l) => s + num(l.total_amount), 0);
      const withKm = list.filter((l) => num(l.distance) > 0);
      const km = withKm.reduce((s, l) => s + num(l.distance), 0);
      const kmRev = withKm.reduce((s, l) => s + num(l.total_amount), 0);
      return { lane, loads: list.length, rev, km: km || null, perKm: km > 0 ? kmRev / km : null };
    })
    .sort((a, b) => b.rev - a.rev);
  const total = done.reduce((s, l) => s + num(l.total_amount), 0);
  const unknownRev = unknown.reduce((s, l) => s + num(l.total_amount), 0);
  const kmAll = known.filter((l) => num(l.distance) > 0);
  const avgPerKm = kmAll.length
    ? kmAll.reduce((s, l) => s + num(l.total_amount), 0) / kmAll.reduce((s, l) => s + num(l.distance), 0)
    : null;

  const table: Statement = {
    columns: [
      { label: 'Lane' },
      { label: 'Loads', type: 'int' },
      { label: 'Distance', type: 'km', phone: false },
      { label: 'Revenue excl. VAT', type: 'money' },
      { label: 'Per km', type: 'money' },
      { label: 'Share', type: 'pct' },
    ],
    rows: [
      ...lanes.map<SRow>((l) => ({
        key: l.lane,
        cells: [l.lane, l.loads, l.km, l.rev, l.perKm, total > 0 ? (l.rev / total) * 100 : null],
      })),
      ...(unknown.length
        ? [
            {
              key: 'unknown',
              kind: 'muted' as const,
              cells: ['Route not recorded', unknown.length, null, unknownRev, null, total > 0 ? (unknownRev / total) * 100 : null],
            },
          ]
        : []),
      { key: 'tot', kind: 'grand', cells: ['Total', done.length, null, total, avgPerKm, total > 0 ? 100 : null] },
    ],
  };
  const topLane = lanes[0];

  return (
    <ReportFrame
      title="Revenue by lane"
      sub={`${periodText(period)} · load prices, excl. VAT`}
      companyName={companyName}
      info={[
        'Loads delivered or invoiced, by delivery date. Revenue here is the agreed load price, excluding VAT, not the invoiced amount; Lane margin shows invoiced revenue and costs.',
        'City names are cleaned so "JHB" and "Johannesburg" count as one. Loads without a route are listed apart.',
        'Per km uses only loads with a recorded distance.',
      ]}
      controls={<PeriodControl period={period} onChange={setPeriod} />}
      tiles={
        done.length
          ? [
              { label: 'Delivered revenue', value: moneyWhole(total), note: plural(done.length, 'load'), amount: total },
              { label: 'Top lane', value: moneyWhole(topLane?.rev ?? 0), note: topLane?.lane, amount: topLane?.rev ?? 0 },
              ...(avgPerKm != null
                ? [
                    {
                      label: 'Average per km',
                      value: money(avgPerKm),
                      note: `${plural(kmAll.length, 'load')} with distance`,
                      amount: avgPerKm,
                    },
                  ]
                : []),
            ]
          : undefined
      }
      table={table}
      csv={() => statementCsv(`Revenue by lane, ${periodText(period)}`, 'Delivered loads, excl. VAT, by delivery date', table)}
      csvName={`revenue-by-lane-${period.from}-to-${period.to}`}
    >
      {done.length === 0 ? (
        <Empty line={`No loads delivered in ${periodText(period)}.`} />
      ) : (
        <StatementTable
          table={table}
          caption="Revenue by lane"
          footer={<Check>Total equals the {plural(done.length, 'delivered load')} in the period.</Check>}
        />
      )}
    </ReportFrame>
  );
}
