import { View } from 'react-native';
import { DetailRow, Mono, Txt } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';
import { MARKET_RANGE_LABEL, type DecisionView } from '@/lib/pricing';
import { useTheme } from '@/theme/ThemeProvider';

const money = (n: number) => formatCurrency(n, { maximumFractionDigits: 0 });
// "R 34–46k": a rough estimate is shown as roughly as it is known.
const roughRange = (low: number, high: number) => `R ${Math.round(low / 1000)}–${Math.round(high / 1000)}k`;
const round100 = (v: number) => Math.round(v / 100) * 100;
// "TruckWys platform, 16 accepted quotes, last 180 days" -> "TruckWys platform · 16 accepted quotes".
const sourceParts = (s: string) => s.split(/\s*[,·]\s*/).filter(Boolean);
const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

/** A line of small print under a row (a source, a basis). */
function Note({ children, last }: { children: string; last?: boolean }) {
  return (
    <View className={`px-3.5 pb-3 ${last ? '' : 'border-b border-line-row'}`}>
      <Txt className="text-caption text-faint">{children}</Txt>
    </View>
  );
}

/**
 * The rows of "How it was priced" (put inside a `Group`): the price picked, the
 * cost floor and its parts (each cost appears once), price less floor =
 * margin, the market at the time and the chance to win, as stored with the
 * quote. The margin appears once per screen: when the page already shows it,
 * this block shows only how it was reached. Money is whole rand here.
 */
export function PricingDecisionRows({
  decision: d,
  marginShownElsewhere = false,
  floorIncomplete = false,
  tollsUnknown = false,
}: {
  decision: DecisionView;
  /** The page's own price card already shows the margin. */
  marginShownElsewhere?: boolean;
  /** A cost is not known now: the stored floor is not shown, and no margin. */
  floorIncomplete?: boolean;
  /** The tolls are unknown now: the stored R 0 / old figure is not shown. */
  tollsUnknown?: boolean;
}) {
  const { colors } = useTheme();
  const pickedText = d.picked
    ? d.recommended && d.recommended !== d.picked
      ? `${d.picked} · ${d.recommended} was recommended`
      : d.recommended === d.picked
        ? `${d.picked} (recommended)`
        : d.picked
    : null;
  const rows: React.ReactNode[] = [];
  if (d.stale) {
    rows.push(
      <View key="stale" className="border-b border-line-row px-3.5 py-3">
        <Txt className="text-sub text-warning">
          Priced at {money(d.finalPrice)} excl. VAT; the total has changed since. These figures are for that price.
        </Txt>
      </View>,
    );
  }
  if (pickedText) rows.push(<DetailRow key="picked" label="Price picked" value={pickedText} mono={false} />);
  if (d.floor !== null) {
    rows.push(
      <DetailRow
        key="floor"
        label="Cost floor"
        hint="Fuel, tolls, driver, border fees and operating costs"
        value={floorIncomplete || tollsUnknown ? 'Incomplete' : money(d.floor)}
        valueColor={floorIncomplete || tollsUnknown ? colors.faint : undefined}
      />,
    );
    for (const [i, l] of (d.floorLines ?? []).entries()) {
      const unknown = tollsUnknown && /^tolls?$/i.test(l.label.trim());
      const estimate = !!l.source && /estimate/i.test(l.source);
      rows.push(
        <DetailRow
          key={`line-${i}-${l.label}`}
          label={`${l.label}${estimate ? ' · Estimate' : ''}`}
          // A cost with no figure on record reads "Not set" (the floor leaves it out), never "R 0".
          value={unknown ? '—' : l.missing ? 'Not set' : l.note || money(l.amount)}
          mono={!(l.missing || l.note)}
          valueColor={l.missing || unknown ? colors.warning : undefined}
        />,
      );
    }
    if (d.floorLinesDerived) {
      rows.push(<Note key="derived">Operating costs here are the floor less the other lines.</Note>);
    }
  }
  if (d.margin && !marginShownElsewhere && !floorIncomplete && !tollsUnknown) {
    rows.push(
      <DetailRow
        key="margin"
        label={d.stale ? `Margin at ${money(d.finalPrice)}` : 'Margin'}
        value={`${money(d.margin.amount)}${d.margin.pct !== null ? ` · ${d.margin.pct}%` : ''}`}
        valueColor={d.belowFloor ? colors.danger : undefined}
      />,
    );
  }
  if (d.market) {
    if (d.market.estimate) {
      // Never called the market when it is an estimate.
      rows.push(
        <DetailRow key="market" label="Rough SA estimate" value={roughRange(d.market.low, d.market.high)} />,
        <Note key="market-note">Not used.</Note>,
      );
    } else {
      rows.push(
        <DetailRow
          key="market"
          label="Market"
          hint={MARKET_RANGE_LABEL}
          // Market figures to the nearest R 100, as in the builder.
          value={`${money(round100(d.market.low))} to ${money(round100(d.market.high))}`}
        />,
      );
      if (d.market.label) {
        rows.push(<Note key="market-note">{sourceParts(d.market.label).slice(0, 2).join(' · ')}</Note>);
      }
    }
  }
  if (d.likelihood) {
    rows.push(
      <DetailRow key="chance" label="Chance to win when priced" value={d.likelihood.text} mono={d.likelihood.model} />,
    );
    if (d.likelihood.basis) {
      rows.push(
        <Note key="chance-note">
          {d.likelihood.model ? `Chance to win ${lower(d.likelihood.basis)}` : d.likelihood.basis}
        </Note>,
      );
    }
  }
  // The last row carries no divider.
  return <View>{rows}</View>;
}

/** "Agreed R X (quoted R Y)", and the margin at the agreed price when the server sent it. */
export function AgreedPriceRows({
  agreed,
  quoted,
  margin,
}: {
  agreed: number;
  quoted: number;
  margin: { amount: number; pct: number | null } | null;
}) {
  const rand = (n: number) =>
    Math.abs(Math.round(n * 100)) % 100 === 0 ? money(n) : formatCurrency(n);
  return (
    <View className="border-t border-line-row px-3.5 py-3">
      <Txt className="text-callout text-fg">
        Agreed {rand(agreed)} <Txt className="text-callout text-muted">(quoted {rand(quoted)})</Txt>
      </Txt>
      {margin && (
        <Mono className="mt-0.5 text-caption text-muted">
          Margin at the agreed price: {money(margin.amount)}
          {margin.pct !== null ? ` · ${margin.pct < 0 ? '−' : ''}${Math.abs(margin.pct)}%` : ''}
        </Mono>
      )}
    </View>
  );
}
