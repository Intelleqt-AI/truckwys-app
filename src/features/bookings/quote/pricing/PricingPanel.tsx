import { useState, type ComponentProps } from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';
import { Badge, Card, Icon, Mono, Txt } from '@/components/ui';
import { Skeleton } from '@/components/feedback';
import { formatCurrency, formatDate, formatNumber } from '@/lib/formatters';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { MarketRange } from './MarketRange';
import { LikelihoodCurve } from './LikelihoodCurve';
import {
  BAND_LABEL,
  likelihoodShort,
  lkTone,
  readPrice,
  rowLikelihoods,
  signedPct,
  type Band,
  type Choice,
  type ChoiceKey,
  type Likelihood,
  type PricingAnalysis,
} from './analysis';
import type { PricingState } from './usePricingAnalysis';

// The Pricing analysis panel (port of the web's PricingPanel): the cost floor,
// the market and three prices (Safe, Balanced, Stretch), each with its margin
// and chance to win. Everything shown comes from the endpoint; the only maths
// here is price less the builder's floor. Choices can be applied only from an
// analysis of exactly the quote's current values.

export type PricingPhase = 'blocked' | 'needs' | 'route' | 'route_error' | 'ready';

export interface PricingPanelProps {
  state: PricingState;
  phase: PricingPhase;
  blockedReason?: string | null;
  customerName: string | null;
  /** The price in the bar, excl. VAT. */
  price: number;
  /** ONE FLOOR: the builder's costing floor. Every margin in the panel is a price less this. */
  costFloor?: number | null;
  onApplyPrice: (price: number, key: ChoiceKey) => void;
  /** For the analysing steps: what is already known. */
  distanceKm?: number;
  /** Opens the company's pricing settings (the target margin). */
  onOpenSettings?: () => void;
  /** The builder's first block warning, so the panel and the price bar lead with the same blocker. */
  firstBlockCode?: string | null;
}

type BadgeTone = NonNullable<ComponentProps<typeof Badge>['tone']>;
const money = (n: number) => formatCurrency(n, { maximumFractionDigits: 0 });
const NBSP = ' ';
/** Money never splits across lines: NBSP inside figures. Nothing else is rewritten. */
const tidy = (t: string) => t.replace(/R (?=\d)/g, `R${NBSP}`).replace(/(\d) (?=\d{3}\b)/g, `$1${NBSP}`);
const plural = (n: number, one: string, many = `${one}s`) => `${formatNumber(n)} ${n === 1 ? one : many}`;
const listAnd = (xs: string[]) =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

const LK_TEXT: Record<string, string> = {
  likely: 'text-success',
  even: 'text-warning',
  less_likely: 'text-danger',
  none: 'text-muted',
};
const RISK_TONE: Record<string, BadgeTone> = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
  unknown: 'neutral',
};
const OUTCOME: Record<string, { tone: BadgeTone; label: string }> = {
  accepted: { tone: 'success', label: 'Accepted' },
  rejected: { tone: 'danger', label: 'Declined' },
  open: { tone: 'info', label: 'Open' },
  expired: { tone: 'neutral', label: 'Expired' },
  draft: { tone: 'neutral', label: 'Draft' },
};

/** Steps the analysis builds, in order (also the empty-state explainer). */
const STEPS = [
  { key: 'route', title: 'Route and costs' },
  { key: 'floor', title: 'Cost floor' },
  { key: 'market', title: 'Market' },
  { key: 'choices', title: 'Three prices' },
];

const BANDS_WORDS = 'Chance to win as Likely, Even chance or Less likely';
/**
 * The panel subtitle. The server sends it ready to show (`likelihood.headline`);
 * an older server gets the same sentences built from its structured fields.
 */
function headlineOf(d: PricingAnalysis): string {
  const lk = d.likelihood;
  if (lk?.headline) return lk.headline;
  if (!lk) return 'Cost floor, market and three prices';
  if (lk.level === 'model' && lk.model)
    return `Chance to win from ${lk.model.basisLabel || plural(lk.model.nClosed, 'closed quote')}.`;
  const noThresholds = !lk.rules || lk.rules.likelyMax == null || lk.rules.evenMax == null;
  if (noThresholds) return 'No chance to win yet: no real quotes on this lane.';
  const s = `${lk.short ?? ''} ${lk.reason ?? ''}`;
  if (/outside|only seen prices/i.test(s))
    return `${BANDS_WORDS}: these prices are outside what your model has learned from.`;
  if (/trains tonight/i.test(s)) return `${BANDS_WORDS} until your model trains tonight.`;
  const cnt = (lk.short ?? '').match(/(\d+)\s+of\s+(\d+)/) ?? (lk.reason ?? '').match(/needs (\d+)[^;]*; you have (\d+)/);
  if (cnt) {
    const [have, need] = /needs/.test(cnt[0]) ? [cnt[2], cnt[1]] : [cnt[1], cnt[2]];
    return `${BANDS_WORDS}. A % needs ${need} closed quotes (you have ${have}).`;
  }
  return `${BANDS_WORDS}.`;
}

export function PricingPanel(p: PricingPanelProps) {
  const { state, phase } = p;
  const loading = state.status === 'loading';
  const refreshing = state.status === 'refreshing';
  const busy = loading || refreshing || phase === 'route';

  return (
    <Card>
      <View className="p-4" accessibilityLabel="Pricing analysis">
        <View className="flex-row items-center justify-between gap-3">
          <Txt className="text-callout font-semibold text-fg" accessibilityRole="header">
            Pricing analysis
          </Txt>
          {busy && (
            <View className="flex-row items-center gap-1.5" accessibilityLiveRegion="polite">
              <ActivityIndicator size="small" />
              <Txt className="text-caption text-muted">
                {loading || phase === 'route' ? 'Analysing' : 'Updating'}
              </Txt>
            </View>
          )}
        </View>
        <View className="mt-3">
          <Body {...p} />
        </View>
      </View>
    </Card>
  );
}

function Msg({ children }: { children: string }) {
  return <Txt className="text-sub font-medium text-fg">{children}</Txt>;
}

/** A small bordered button. TouchableOpacity, as the app does for new buttons. */
function TryNow({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Try now"
      className="mt-2 min-h-[44px] self-start items-center justify-center rounded-control border border-line-active bg-surface px-3"
    >
      <Mono className="text-caption font-medium text-fg">Try now</Mono>
    </TouchableOpacity>
  );
}

function Body(p: PricingPanelProps) {
  const { state, phase } = p;
  if (phase === 'blocked') return <Txt className="text-sub text-muted">{p.blockedReason || 'Paused until the quote can be priced.'}</Txt>;
  if (phase === 'needs') return <Steps start={-1} facts={[]} />;
  if (phase === 'route_error') return <Msg>{"Route couldn't be priced."}</Msg>;
  if (phase === 'route' || (state.status === 'loading' && !state.data)) {
    return <Steps start={phase === 'route' ? 0 : 1} facts={stepFacts(p)} />;
  }
  if (!state.data) {
    if (state.status === 'unavailable') return <Msg>Not available on this account.</Msg>;
    if (state.status === 'offline') {
      return (
        <View>
          <Msg>No connection — retrying.</Msg>
          <TryNow onPress={state.retry} />
        </View>
      );
    }
    if (state.status === 'error') {
      return (
        <View>
          <Msg>Unavailable right now — retrying.</Msg>
          <TryNow onPress={state.retry} />
        </View>
      );
    }
    return <Steps start={1} facts={stepFacts(p)} />;
  }
  return <Result {...p} data={state.data} />;
}

/**
 * The four steps. `start` is the step in progress: earlier ones are done and
 * say what they found; -1 is the plain explainer (nothing running).
 */
function Steps({ start, facts }: { start: number; facts: (string | null)[] }) {
  const { colors } = useTheme();
  return (
    <View className="gap-2.5" accessibilityLabel="Analysis progress">
      {STEPS.map((s, i) => {
        const done = i < start;
        const active = i === start;
        return (
          <View key={s.key} className="flex-row items-start gap-2.5">
            <View
              className="h-5 w-5 items-center justify-center rounded-full border border-line-active"
              style={done ? { backgroundColor: colors.raised } : undefined}
            >
              {done ? (
                <Icon name="check" size={11} color={colors.fg} />
              ) : (
                <Txt className="text-micro text-faint">{i + 1}</Txt>
              )}
            </View>
            <View className="flex-1">
              <Txt className={`text-sub font-medium ${done || active || start < 0 ? 'text-fg' : 'text-faint'}`}>
                {s.title}
              </Txt>
              {active ? (
                <View className="mt-1.5">
                  <Skeleton width="70%" height={10} radius={radius.control} />
                </View>
              ) : done && facts[i] ? (
                <Txt className="text-caption text-muted">{facts[i]}</Txt>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function stepFacts(p: PricingPanelProps): (string | null)[] {
  const d = p.state.data;
  const m = d?.market;
  const rec = d?.choices.find((c) => c.recommended);
  return [
    p.distanceKm ? `${formatNumber(Math.round(p.distanceKm))} km` : null,
    // Facts from the answer only: never the build-up standing in for the floor.
    d?.costFloor ? `${money(d.costFloor.total)} floor` : null,
    !d
      ? null
      : !m || !m.available
        ? 'No quotes on this lane yet'
        : m.isEstimate
          ? 'Rough estimate only, no real quotes'
          : `${plural(m.n, 'accepted quote')} · median ${money(m.median ?? 0)}`,
    !d ? null : rec ? `Recommended: ${rec.label} ${money(rec.price)}` : d.choices.length ? `${d.choices.length} prices` : 'Needs the missing costs first',
  ];
}

// ------------------------------------------------------------------ result

function Result(p: PricingPanelProps & { data: PricingAnalysis }) {
  const { data, state } = p;
  const failedRefresh = state.status === 'error' || state.status === 'offline' || state.status === 'unavailable';
  // ONE FLOOR: a result for other inputs (stale, offline, still refreshing)
  // is visibly out of date and its prices can't be applied.
  const outOfDate = !state.isCurrent || state.status !== 'ready';
  const realMarket = !!data.market?.available && !data.market.isEstimate;
  const noModel = data.likelihood?.level !== 'model';
  const mp = data.modelProgress;
  const gate = p.firstBlockCode && BLOCK_WORDS[p.firstBlockCode] ? null : firstGate(data.missing);

  return (
    <View className={outOfDate ? 'opacity-60' : ''}>
      {failedRefresh && (
        <View className="mb-3 flex-row flex-wrap items-center gap-x-2">
          {/* Retries are capped (and a refused request isn't retried), so it
              doesn't promise one: "Try now" is always there. */}
          <Txt className="text-sub text-warning">Prices out of date.</Txt>
          <TouchableOpacity
            onPress={state.retry}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel="Try now"
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            className="min-h-[44px] justify-center"
          >
            <Txt className="text-sub font-medium text-link">Try now</Txt>
          </TouchableOpacity>
        </View>
      )}
      {/* No evidence, said plainly at the top (not under "Why these prices"). */}
      {(!realMarket || noModel) && (
        <View className="mb-3 gap-1">
          {!realMarket && (
            <Txt className="text-sub text-muted">
              No market data for this lane yet. Prices are your costs plus your margin.
            </Txt>
          )}
          {noModel && (
            <Txt className="text-sub text-muted">
              Win chance appears after {mp?.wonNeeded ?? 200} won and {mp?.lostNeeded ?? 200} lost quotes
              {mp && mp.won != null && mp.lost != null ? ` (you have ${mp.won} and ${mp.lost})` : ''}.
            </Txt>
          )}
        </View>
      )}
      <Alerts data={data} customerName={p.customerName} />
      {data.choices.length === 0 && (p.firstBlockCode && BLOCK_WORDS[p.firstBlockCode] ? true : !!gate) && (
        <Txt className="mb-3 text-sub text-muted">
          {p.firstBlockCode && BLOCK_WORDS[p.firstBlockCode]
            ? `No prices until ${BLOCK_WORDS[p.firstBlockCode]}.`
            : `No prices until ${gate} ${gate === 'tolls' ? 'are' : 'is'} known.`}
        </Txt>
      )}
      {data.choices.length > 0 && (
        <ChoicesSection
          data={data}
          price={p.price}
          floor={p.costFloor}
          disabled={outOfDate}
          onApply={p.onApplyPrice}
          onOpenSettings={p.onOpenSettings}
        />
      )}
      <MarketSection data={data} price={p.price} floor={p.costFloor} />
      <WhySection data={data} price={p.price} />
      <EvidenceSection data={data} customerName={p.customerName} />
    </View>
  );
}

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View className="mt-4" accessibilityLabel={title}>
      <View className="mb-2 flex-row items-center justify-between gap-2">
        <Txt className="text-sub font-semibold text-fg" accessibilityRole="header">
          {title}
        </Txt>
        {aside}
      </View>
      {children}
    </View>
  );
}

// ---- alerts: at most two, lane first, then the customer
const LANE_CODES = ['empty_return_unpaid', 'market_below_floor'];
/** Short titles for the panel's alerts; the server's sentence is on tap. */
const ALERT_TITLE: Record<string, string> = {
  empty_return_unpaid: 'Lane pays below cost with empty return',
  market_below_floor: 'Market pays below your floor',
  lane_below_floor: 'Market pays below your floor',
  market_below_cost: 'Market pays below your floor',
  price_sensitive: 'Price-sensitive client on this lane',
};
type AlertItem = { key: string; tone: 'danger' | 'warning' | 'info'; message: string };

/** "{name} accepted 2 of their last 10 quotes on this lane. Declined at R 26 600 and R 28 700."
 *  Built only for an older server that doesn't send `price_sensitive` itself. */
function derivedPriceSensitive(d: PricingAnalysis, name: string): string | null {
  const c = d.customer;
  if (!c) return null;
  const la = c.laneAcceptance;
  const decided = c.recentLaneQuotes.filter((q) => q.outcome === 'accepted' || q.outcome === 'rejected');
  const median = d.market?.available && !d.market.isEstimate ? d.market.median : null;
  const declinedAbove = decided
    .slice(0, 4)
    .filter((q) => q.outcome === 'rejected' && median != null && q.price > median).length;
  if (!((la && la.decided >= 5 && (la.ratePct ?? 100) <= 30) || declinedAbove >= 2)) return null;
  const declined = decided
    .filter((q) => q.outcome === 'rejected')
    .slice(0, 2)
    .map((q) => q.price)
    .sort((a, b) => b - a);
  const won = la?.won ?? decided.filter((q) => q.outcome === 'accepted').length;
  const of = la?.decided ?? decided.length;
  return `${name} accepted ${won} of their last ${of} quotes on this lane.${
    declined.length ? ` Declined at ${listAnd(declined.map((x) => money(x)))}.` : ''
  }`;
}

function alertsFor(data: PricingAnalysis, customerName: string | null): AlertItem[] {
  const name = data.customer?.name || customerName || 'This client';
  const lane =
    data.attention.find((a) => LANE_CODES.includes(a.code)) ??
    data.warnings.find((w) => w.code === 'market_below_floor' || w.code === 'lane_below_floor' || w.code === 'market_below_cost');
  const risk = data.customer?.paymentRisk;
  const riskAtt = data.attention.find((a) => /payment/.test(a.code)) ?? data.warnings.find((w) => /payment/.test(w.code));
  const sens = data.attention.find((a) => a.code === 'price_sensitive');
  const out: AlertItem[] = [];
  if (lane) out.push({ key: lane.code, tone: 'warning', message: lane.message });
  if (riskAtt || risk?.attention) {
    const band = risk?.band ?? ((riskAtt as { level?: string })?.level === 'high' ? 'high' : 'medium');
    const msg =
      riskAtt?.message ||
      `${name} ${risk!.label.charAt(0).toLowerCase()}${risk!.label.slice(1)}: ${risk!.basis ?? ''}`.trim();
    out.push({ key: 'payment_risk', tone: band === 'high' ? 'danger' : 'warning', message: msg });
  } else if (sens) {
    out.push({ key: 'price_sensitive', tone: 'info', message: sens.message });
  } else if (!data.r5) {
    const m = derivedPriceSensitive(data, name);
    if (m) out.push({ key: 'price_sensitive', tone: 'info', message: m });
  }
  return out;
}

function Alerts({ data, customerName }: { data: PricingAnalysis; customerName: string | null }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState<string | null>(null);
  const alerts = alertsFor(data, customerName);
  if (!alerts.length) return null;
  const dot = { danger: colors.dangerDot, warning: colors.warningDot, info: colors.infoDot };
  return (
    <View className="mb-3 gap-2">
      {alerts.map((a) => {
        // One line: the first sentence (or the part before a colon); the rest on tap.
        const m = a.message.match(/^(.+?[.:])\s+(.+)$/s);
        const head = ALERT_TITLE[a.key] ?? (m ? m[1]! : a.message).replace(/[.:]$/, '');
        const more = !!(m || ALERT_TITLE[a.key]);
        const expanded = open === a.key;
        return (
          <TouchableOpacity
            key={a.key}
            onPress={more ? () => setOpen(expanded ? null : a.key) : undefined}
            disabled={!more}
            activeOpacity={0.7}
            accessibilityRole={more ? 'button' : 'text'}
            accessibilityState={more ? { expanded } : undefined}
            className="rounded-control border border-line bg-surface-hover px-3 py-2.5"
          >
            <View className="flex-row items-center gap-2">
              <View style={{ width: 7, height: 7, borderRadius: 7, backgroundColor: dot[a.tone] }} />
              <Txt className="flex-1 text-sub font-medium text-fg">{tidy(head)}</Txt>
              {more && <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={14} color={colors.faint} />}
            </View>
            {expanded && <Txt className="mt-1.5 text-sub text-muted">{tidy(a.message)}</Txt>}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** Say why there are no prices when fuel, tolls or border costs aren't known yet. */
const MISSING_GATES = ['fuel', 'tolls', 'border'];
const GATE_WORDS: Record<string, string> = { fuel: 'the fuel price', tolls: 'tolls', border: 'the border cost' };
const firstGate = (missing: string[]) => {
  const k = MISSING_GATES.find((g) => missing.includes(g));
  return k ? GATE_WORDS[k]! : null;
};
/** "No prices until …" for the builder's first blocker (same order as the price bar). */
const BLOCK_WORDS: Record<string, string> = {
  distance_missing: 'the route is known',
  distance_estimated: 'the distance is confirmed',
  no_vehicle: 'a truck is chosen',
  truck_burn_missing: "the truck's fuel use is set",
  overload: 'the load fits the truck',
  diesel_missing: 'the fuel price is known',
  tolls_unknown: 'tolls are known',
  border_costs_missing: 'border costs are known',
  driver_nights_unknown: 'the driving time is known',
};

// ---- choices
const ORDER: ChoiceKey[] = ['safe', 'balanced', 'stretch'];
const sortChoices = (cs: Choice[]) => [...cs].sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));

function ChoicesSection({
  data,
  price,
  floor,
  disabled,
  onApply,
  onOpenSettings,
}: {
  data: PricingAnalysis;
  price: number;
  floor?: number | null;
  disabled: boolean;
  onApply: PricingPanelProps['onApplyPrice'];
  onOpenSettings?: () => void;
}) {
  const applied = readPrice(data, price, floor).matchedChoice;
  const choices = sortChoices(data.choices);
  // One format per row: all % or all bands.
  const lks = rowLikelihoods(data, choices);
  const bands = choices.map((c) => {
    const l = lks.get(c.key);
    return l && l.level === 'rules' ? l.band : undefined;
  });
  // Every row the same band: say it once, above the rows.
  const sameBand: Band | null = bands.every((b) => b != null && b === bands[0]) ? (bands[0] as Band) : null;
  const target = data.targetMarginPct != null ? Math.round(data.targetMarginPct) : null;
  return (
    <Section
      title="Choose a price"
      aside={
        target != null ? (
          <View className="flex-row items-center">
            <Txt className="text-caption text-faint">Target margin {target}% · </Txt>
            <TouchableOpacity
              onPress={onOpenSettings}
              disabled={!onOpenSettings}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Settings"
              hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
            >
              <Txt className="text-caption text-link">Settings</Txt>
            </TouchableOpacity>
          </View>
        ) : null
      }
    >
      {sameBand && (
        <Txt className="mb-2 text-sub text-muted">
          All three: <Txt className={`text-sub font-medium ${LK_TEXT[sameBand]}`}>{BAND_LABEL[sameBand]}</Txt>
        </Txt>
      )}
      <View className="gap-2">
        {choices.map((c) => {
          const l = lks.get(c.key) ?? null;
          const shown = sameBand || !l || (l.level === 'rules' && l.band == null) ? null : l;
          return (
            <ChoiceRow
              key={c.key}
              c={c}
              lk={shown}
              ariaLk={l && !(l.level === 'rules' && l.band == null) ? l : null}
              applied={applied === c.key}
              onApply={() => onApply(c.price, c.key)}
              disabled={disabled}
              floor={floor}
            />
          );
        })}
      </View>
    </Section>
  );
}

function ChoiceRow({
  c,
  lk,
  ariaLk,
  applied,
  onApply,
  disabled,
  floor,
}: {
  c: Choice;
  lk: Likelihood | null;
  ariaLk: Likelihood | null;
  applied: boolean;
  onApply: () => void;
  disabled: boolean;
  floor?: number | null;
}) {
  const { colors } = useTheme();
  // Margin against the current costing floor (the analysis's own when none is given).
  const margin = floor != null ? c.price - floor : c.margin;
  const marginPct = floor != null ? (c.price > 0 ? (margin / c.price) * 100 : 0) : c.marginPct;
  const chance = ariaLk
    ? ariaLk.level === 'model'
      ? `${Math.round(ariaLk.pct)}% chance to win`
      : `${ariaLk.label} to win`
    : null;
  // Never "Recommended" on a price that is less likely to win.
  const showRec = c.recommended && !(ariaLk && lkTone(ariaLk) === 'less_likely');
  return (
    <TouchableOpacity
      onPress={onApply}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected: applied, disabled }}
      accessibilityHint={disabled ? 'Prices out of date. Choices from the current analysis only.' : undefined}
      accessibilityLabel={`${c.label}${showRec ? ', recommended' : ''}: ${money(c.price)}, margin ${money(margin)} or ${signedPct(marginPct)}${
        chance ? `, ${chance}` : ''
      }. ${applied ? 'In your quote.' : 'Use this price.'}`}
      // 1.5px in both states, so applying a price never nudges the rows; the
      // applied one is the ink outline.
      style={{ borderWidth: 1.5 }}
      className={`min-h-[44px] rounded-control px-3 py-2.5 ${
        applied ? 'border-fg bg-surface' : 'border-line bg-surface'
      }`}
    >
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-1 flex-row flex-wrap items-center gap-x-2">
          {applied && <Icon name="check" size={12} color={colors.fg} strokeWidth={2.6} />}
          <Txt className="text-callout font-semibold text-fg">{c.label}</Txt>
          {showRec && <Badge label="Recommended" tone="accent" />}
        </View>
        <Mono className="text-callout font-semibold text-fg">{money(c.price)}</Mono>
      </View>
      <View className="mt-0.5 flex-row items-center justify-between gap-2">
        <Txt className="text-caption text-muted">
          {money(margin)} · {signedPct(marginPct)}
        </Txt>
        {lk ? (
          <Txt className={`text-caption font-medium ${LK_TEXT[lkTone(lk)]}`}>{likelihoodShort(lk)}</Txt>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

// ---- market
function TierLine({ m }: { m: NonNullable<PricingAnalysis['market']> }) {
  // Compact: who and how many.
  const who = m.tier === 'platform' ? 'TruckWys' : m.tier === 'company' ? 'Your quotes' : null;
  const parts = [who, m.n > 0 ? plural(m.n, 'quote') : null, m.vehicleSpecific && m.vehicleName ? m.vehicleName : null].filter(
    Boolean,
  ) as string[];
  if (!parts.length) return null;
  return <Txt className="text-caption text-muted">{parts.map(tidy).join(' · ')}</Txt>;
}

function MarketSection({ data, price, floor: builderFloor }: { data: PricingAnalysis; price: number; floor?: number | null }) {
  const m = data.market;
  const floor = builderFloor !== undefined ? builderFloor : (data.costFloor?.total ?? null);
  if (m?.isEstimate && m.p25 != null && m.p75 != null) {
    const range = `R${NBSP}${formatNumber(Math.round(m.p25 / 1000))}–${formatNumber(Math.round(m.p75 / 1000))}k`;
    // The server flags an estimate that sits low against the floor; an older
    // server gets the same test here.
    const low =
      data.warnings.some((w) => w.code === 'estimate_below_floor') ||
      (!data.r5 && data.costFloor != null && m.p75 < 1.1 * data.costFloor.total);
    return (
      <Section title="Market">
        <Txt className="text-sub text-muted">
          {low ? `Estimate ${range}, below your floor. Not used.` : `Estimate ${range}. Not used.`}
        </Txt>
      </Section>
    );
  }
  return (
    <Section title="Market">
      {!m || !m.available ? (
        <Txt className="text-sub text-muted">No quotes on this lane yet.</Txt>
      ) : (
        <View>
          <TierLine m={m} />
          {m.oneWayX2 && <Txt className="text-caption text-muted">One-way quotes ×2.</Txt>}
          {/* Any typed price, 0 included, so the marker never vanishes mid-edit. */}
          <MarketRange market={m} floor={floor} price={price} />
          <View className="mt-1 flex-row flex-wrap gap-x-4">
            <Txt className="text-caption text-muted" accessibilityLabel="Middle half of the market">
              Middle half{NBSP}
              <Mono className="text-caption text-muted">
                {money(m.p25 ?? 0)} – {money(m.p75 ?? 0)}
              </Mono>
            </Txt>
            <Txt className="text-caption text-muted">
              Median <Mono className="text-caption text-muted">{money(m.median ?? 0)}</Mono>
            </Txt>
          </View>
        </View>
      )}
    </Section>
  );
}

// ---- why these prices
const WHY_CODES = ['cost', 'market', 'margin', 'recommendation'];
function whyReasons(d: PricingAnalysis): string[] {
  if (d.reasoningItems.length)
    return d.reasoningItems.filter((r) => WHY_CODES.includes(r.code)).map((r) => tidy(r.text)).slice(0, 4);
  // Older server: the cost, market and margin sentences (its first three),
  // in the house words, then the recommendation without the curve-peak sentence.
  const name = d.customer?.name;
  const base = d.reasoning
    .filter((r) => !(name && r.includes(name)) && !/^Last quote|likelihood|payment/i.test(r))
    .slice(0, 3)
    .map((r) => r.replace(/\(middle (R)/g, '(median $1').replace(/\bmiddle\b(?! half)/g, 'median'));
  const rec = d.recommendation?.reason?.replace(/\s*The model's best expected profit[^.]*\./i, '').trim();
  return [...base, ...(rec && !/middle of what|empty run home/i.test(rec) ? [rec] : [])].map(tidy).slice(0, 4);
}

function Disclosure({ label, open, onPress }: { label: string; open: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      className="min-h-[44px] flex-row items-center gap-1"
    >
      <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} color={colors.faint} />
      <Txt className="text-sub text-muted">{label}</Txt>
    </TouchableOpacity>
  );
}

function WhySection({ data, price }: { data: PricingAnalysis; price: number }) {
  const [open, setOpen] = useState(false);
  const lk = data.likelihood;
  const model = lk?.level === 'model' ? lk.model : null;
  const reasons = whyReasons(data);
  if (!reasons.length && !lk) return null;
  // "You" only when the bar price is not one of the three.
  const atChoice = data.choices.some((c) => Math.abs(c.price - price) < 0.005);
  const t = lk?.rules;
  const hasBands = !model && t && t.likelyMax != null && t.evenMax != null;
  return (
    <View className="mt-2">
      <Disclosure label="Why these prices" open={open} onPress={() => setOpen((v) => !v)} />
      {open && (
        <View className="gap-2 pb-1 pl-1">
          <Txt className="text-sub text-muted">{headlineOf(data)}</Txt>
          {reasons.map((r) => (
            <Txt key={r} className="text-sub text-muted">
              {'•  '}
              {r}
            </Txt>
          ))}
          {model && (
            <View>
              <LikelihoodCurve curve={model.curve} range={model.range} choices={data.choices} price={!atChoice ? price : null} />
              <Txt className="mt-1 text-caption text-faint">
                Chance to win by price, from {model.basisLabel || plural(model.nClosed, 'closed quote')}.
              </Txt>
            </View>
          )}
          {hasBands && (
            <View className="gap-1">
              <BandRow band="likely" text={`up to ${money(t!.likelyMax ?? 0)}`} />
              {t!.evenMax! > t!.likelyMax! && (
                <BandRow band="even" text={`${money(t!.likelyMax ?? 0)} to ${money(t!.evenMax ?? 0)}`} />
              )}
              <BandRow band="less_likely" text={`above ${money(t!.evenMax ?? 0)}`} />
              {t!.basis.length > 0 && (
                <Txt className="mt-1 text-caption text-faint">From: {t!.basis.map(tidy).join(' · ')}</Txt>
              )}
            </View>
          )}
          {!model && !hasBands && <Txt className="text-sub text-muted">Not enough data yet.</Txt>}
        </View>
      )}
    </View>
  );
}

function BandRow({ band, text }: { band: Band; text: string }) {
  return (
    <View className="flex-row items-center justify-between gap-2">
      <Txt className={`text-sub font-medium ${LK_TEXT[band]}`}>{BAND_LABEL[band]}</Txt>
      <Mono className="text-sub text-muted">{text}</Mono>
    </View>
  );
}

// ---- customer
function EvidenceSection({ data, customerName }: { data: PricingAnalysis; customerName: string | null }) {
  const [histOpen, setHistOpen] = useState(false);
  const c = data.customer;
  if (!c) return null;
  // A return trip compares against one-way history: say so on the table.
  const oneWay = !!data.market?.oneWayX2;
  const name = c.name || customerName || 'This client';
  const acc = c.acceptance;
  const la = c.laneAcceptance;
  const quotes = c.recentLaneQuotes.filter((q) => q.outcome !== 'draft').slice(0, 5);
  // Payment advice is said once, in the alert; here only the chip.
  const inAlert = alertsFor(data, customerName).some((a) => a.key === 'payment_risk');
  return (
    <Section title={name}>
      <View className="gap-1.5">
        <View className="flex-row items-center justify-between gap-2">
          <Txt className="text-sub text-faint">Accepts</Txt>
          <Txt className="text-sub text-fg">
            {acc && acc.decided > 0
              ? `${acc.won} of ${acc.decided}${la ? ` · ${la.won} of ${la.decided} here` : ''}`
              : 'None decided'}
          </Txt>
        </View>
        {!inAlert && (
          <View className="flex-row items-center justify-between gap-2">
            <Txt className="text-sub text-faint">Payment</Txt>
            {c.paymentRisk ? (
              <Badge label={c.paymentRisk.label} tone={RISK_TONE[c.paymentRisk.band] ?? 'neutral'} />
            ) : (
              <Txt className="text-sub text-fg">No history</Txt>
            )}
          </View>
        )}
      </View>
      {/* The lane's last quotes are detail: on tap. */}
      {quotes.length > 0 ? (
        <View className="mt-1">
          <Disclosure
            label={`On this lane · ${quotes.length}${oneWay ? ' one-way' : ''}`}
            open={histOpen}
            onPress={() => setHistOpen((v) => !v)}
          />
          {histOpen && (
            <View className="gap-2 pl-1" accessibilityLabel={`Last quotes to ${name} on this lane`}>
              {quotes.map((q, i) => {
                const o = OUTCOME[q.outcome] ?? { tone: 'neutral' as BadgeTone, label: q.outcome };
                return (
                  <View key={q.id ?? i} className="flex-row items-center justify-between gap-2">
                    <Txt className="text-sub text-muted">{q.date ? formatDate(q.date) : '—'}</Txt>
                    <Mono className="text-sub text-fg">{money(q.price)}</Mono>
                    <Badge label={o.label} tone={o.tone} />
                  </View>
                );
              })}
            </View>
          )}
        </View>
      ) : (
        <Txt className="mt-1 text-sub text-muted">No quotes on this lane yet.</Txt>
      )}
    </Section>
  );
}
