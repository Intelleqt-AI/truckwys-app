import { useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Badge, Card, Icon, Mono, Txt } from '@/components/ui';
import { formatDate } from '@/lib/formatters';
import { useTheme } from '@/theme/ThemeProvider';
import type { PriceCheck } from './usePriceCheck';
import {
  ITEM_LABELS,
  MISSING,
  TOPICS,
  checkedAgo,
  chipFor,
  clean,
  detailLines,
  httpsHost,
  kindOf,
  money,
  moneyWhole,
  perLitre,
  safeSources,
  type ItemKey,
  type ReviewItem,
} from './types';

// The "Market price check" card that replaces the old win-model panel. Port of
// the web's AIPriceAnalysisPanel: nothing runs on its own, a check is started
// with a button, and every number comes from the backend. Switching an item
// between "use market" and "use mine" is a lookup, never a recalculation here.

/** A small bordered button. TouchableOpacity, as the app does for new buttons. */
function SmallButton({
  label,
  onPress,
  disabled,
  pressed,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  pressed?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, selected: pressed }}
      accessibilityLabel={accessibilityLabel ?? label}
      className={`min-h-[36px] items-center justify-center rounded-control border border-line-active px-3 ${
        pressed ? 'bg-surface-hover' : 'bg-surface'
      } ${disabled ? 'opacity-40' : ''}`}
    >
      <Mono className="text-caption font-medium text-fg">{label}</Mono>
    </TouchableOpacity>
  );
}

export interface GuardInfo {
  /** SAFE | CAUTION | AT_RISK */
  riskLevel: string;
  message: string;
  hint: string | null;
}

export function PriceCheckCard({
  pc,
  benchmarkAvg,
  benchmarkRecommendation,
  guard,
  routeError,
  onOpenFuelSettings,
}: {
  pc: PriceCheck;
  /** Lane benchmark average, 0 when not loaded. */
  benchmarkAvg: number;
  benchmarkRecommendation?: string | null;
  guard: GuardInfo | null;
  routeError?: boolean;
  onOpenFuelSettings?: () => void;
}) {
  const { colors } = useTheme();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const {
    loading,
    elapsed,
    unavailable,
    entry,
    combo,
    hasResult,
    outOfDate,
    figuresChanged,
    breakdown,
    choices,
    failText,
    failure,
    canCheck,
    waiting,
    secsLeft,
    now,
  } = pc;

  const showSkeleton = loading && !entry;
  const crossBorder = pc.review?.cross_border_zar ?? 0;

  // The fleet's own fuel price sitting well under the official one is worth a
  // line: every quote is under-priced on fuel until it is fixed.
  const fuelDetail = breakdown.fuel?.detail || {};
  const fuelSettingStale =
    hasResult &&
    breakdown.fuel?.verdict === 'needs_adjustment' &&
    Number(fuelDetail.market_price_per_litre) >= Number(fuelDetail.your_price_per_litre) * 1.05;

  // ── head tools: one control, whose label says what it does now ───────────
  let tools: React.ReactNode = null;
  if (loading) {
    tools = (
      <View className="flex-row items-center gap-2">
        <Txt className="text-micro text-muted" accessibilityLiveRegion="polite">
          {elapsed >= 3 ? `Checking… ${elapsed} s` : 'Checking…'}
        </Txt>
        <SmallButton label="Cancel" onPress={pc.cancelCheck} />
      </View>
    );
  } else if (!unavailable) {
    const label =
      outOfDate || entry ? 'Re-check' : failure?.code === 'failed' ? 'Try again' : 'Check price';
    tools = (
      <View className="flex-row items-center gap-2">
        {outOfDate ? (
          <Badge label="Out of date" tone="warning" />
        ) : entry ? (
          <Txt className="text-micro text-muted">{checkedAgo(entry.at, now)}</Txt>
        ) : null}
        <SmallButton
          label={label}
          onPress={() => void pc.runCheck()}
          disabled={!canCheck}
          accessibilityLabel={
            !canCheck && waiting && secsLeft != null ? `${label}. Try again in ${secsLeft} seconds` : label
          }
        />
      </View>
    );
  }

  // ── body ──────────────────────────────────────────────────────────────────
  let body: React.ReactNode = null;
  if (showSkeleton) {
    body = (
      <View className="gap-2" accessibilityElementsHidden>
        <View className="h-12 rounded-control bg-surface-hover" />
        <View className="h-9 rounded-control bg-surface-hover" />
        <View className="h-9 rounded-control bg-surface-hover" />
      </View>
    );
  } else if (entry && combo) {
    body = figuresChanged ? (
      <Txt className="text-sub text-muted">
        <Txt className="text-sub font-semibold text-fg">Your figures changed after the check. </Txt>
        Re-check for a price that matches them.
      </Txt>
    ) : (
      <View className={loading ? 'opacity-60' : ''}>
        <Stats pc={pc} />
        <ItemRows pc={pc} crossBorder={crossBorder} />
      </View>
    );
  } else if (outOfDate) {
    body = (
      <Txt className="text-sub text-muted">
        <Txt className="text-sub font-semibold text-fg">The trip changed since the last check. </Txt>
        Re-check for this route and trip.
      </Txt>
    );
  } else if (unavailable) {
    const t = failText ?? {
      title: "Price check isn't available yet",
      text: 'Your quote works as normal.',
    };
    body = (
      <Txt className="text-sub text-muted">
        <Txt className="text-sub font-semibold text-fg">{t.title}. </Txt>
        {t.text}
      </Txt>
    );
  } else if (failText && !entry) {
    body = (
      <Txt className="text-sub text-muted">
        <Txt className="text-sub font-semibold text-fg">{failText.title}. </Txt>
        {failText.text}
      </Txt>
    );
  } else if (routeError) {
    body = (
      <Txt className="text-sub text-muted">
        The route couldn&apos;t be calculated. Change an address or the truck to retry.
      </Txt>
    );
  }
  // A re-check that was turned away keeps the result and says why.
  const notice = entry && failText && !unavailable ? `${failText.title}. ${failText.text}` : null;

  return (
    <Card>
      <View className="p-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <Txt className="text-callout font-semibold text-fg">Market price check</Txt>
            <Txt className="mt-0.5 text-micro text-faint">Fuel, tolls, driver and rate vs market</Txt>
          </View>
          {tools}
        </View>

        {(benchmarkAvg > 0 || body) && (
          <View className="mt-3">
            {benchmarkAvg > 0 && (
              <Txt className="mb-2 text-micro text-muted">
                Lane benchmark <Mono className="text-micro text-fg">{moneyWhole(benchmarkAvg)}</Mono> average
                {benchmarkRecommendation ? ` · ${clean(benchmarkRecommendation)}` : ''}
              </Txt>
            )}
            {body}
          </View>
        )}

        {!!notice && <Txt className="mt-3 text-micro text-warning">{notice}</Txt>}

        {hasResult && detailsOpen && (
          <Details pc={pc} fuelSettingStale={fuelSettingStale} onOpenFuelSettings={onOpenFuelSettings} />
        )}

        {(hasResult || showSkeleton) && (
          <TouchableOpacity
            onPress={() => setDetailsOpen((v) => !v)}
            activeOpacity={0.6}
            disabled={showSkeleton}
            accessibilityRole="button"
            accessibilityState={{ expanded: detailsOpen }}
            className="mt-3 min-h-[36px] flex-row items-center gap-1"
          >
            <Icon name={detailsOpen ? 'chevronUp' : 'chevronDown'} size={15} color={colors.faint} />
            <Txt className="text-sub text-muted">{detailsOpen ? 'Hide details' : 'Show details'}</Txt>
          </TouchableOpacity>
        )}
      </View>

      {/* Revenue guard: unchanged from before, still the app's margin warning. */}
      {guard && guard.riskLevel !== 'SAFE' && (
        <View
          className={`flex-row gap-2.5 border-t border-line p-3 ${
            guard.riskLevel === 'AT_RISK' ? 'bg-danger-bg' : 'bg-warning-bg'
          }`}
        >
          <Icon
            name="alert"
            size={16}
            color={guard.riskLevel === 'AT_RISK' ? colors.dangerDot : colors.warningDot}
          />
          <Txt className="flex-1 text-sub text-muted">
            <Txt
              className={`text-sub font-semibold ${
                guard.riskLevel === 'AT_RISK' ? 'text-danger' : 'text-warning'
              }`}
            >
              {guard.riskLevel === 'AT_RISK' ? 'At risk' : 'Caution'}
            </Txt>
            {` · ${clean(guard.message)}`}
            {guard.hint ? `. ${clean(guard.hint)}` : ''}
          </Txt>
        </View>
      )}
    </Card>
  );
}

// ── headline figure + win chance ────────────────────────────────────────────
function Stats({ pc }: { pc: PriceCheck }) {
  const { combo, matches, noneVerified, headLabel, headNote, winText, winNote, winStale } = pc;
  if (!combo) return null;
  return (
    <View className="mb-3 flex-row gap-3">
      <View className="flex-1 rounded-control border border-line bg-surface-hover p-3">
        <Txt className="text-micro text-faint">{headLabel}</Txt>
        <Txt
          className={`mt-0.5 ${
            matches ? `text-callout font-semibold ${noneVerified ? 'text-muted' : 'text-fg'}` : 'text-heading font-semibold text-fg'
          }`}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {matches ? (noneVerified ? 'Nothing verified' : 'Matches your quote') : moneyWhole(combo.price_zar)}
        </Txt>
        <Txt className="mt-0.5 text-micro text-muted">{headNote}</Txt>
      </View>
      <View className="flex-1 rounded-control border border-line bg-surface-hover p-3">
        <Txt className="text-micro text-faint">Win chance</Txt>
        <Txt
          className={`mt-0.5 ${
            winText === 'Not scored' ? 'text-callout font-semibold text-muted' : 'text-heading font-semibold text-fg'
          }`}
          numberOfLines={1}
        >
          {winText}
        </Txt>
        <Txt className={`mt-0.5 text-micro ${winStale ? 'text-warning' : 'text-muted'}`}>{winNote}</Txt>
      </View>
    </View>
  );
}

// ── the four items, with "use market" / "use mine" ──────────────────────────
function ItemRows({ pc, crossBorder }: { pc: PriceCheck; crossBorder: number }) {
  const { breakdown, choices } = pc;
  return (
    <View className="overflow-hidden rounded-control border border-line">
      {TOPICS.map((t, i) => {
        const item = breakdown[t];
        if (!item) return null;
        return <ItemRow key={t} t={t} item={item} chosen={choices?.[t]} pc={pc} first={i === 0} />;
      })}
      {crossBorder > 0 && (
        <View className="flex-row items-center justify-between border-t border-line-row px-3 py-2.5">
          <Txt className="text-callout text-muted">Cross-border</Txt>
          <Txt className="text-sub text-fg">
            {money(crossBorder)} <Txt className="text-micro text-faint">not checked</Txt>
          </Txt>
        </View>
      )}
    </View>
  );
}

function ItemRow({
  t,
  item,
  chosen,
  pc,
  first,
}: {
  t: ItemKey;
  item: ReviewItem;
  chosen?: 'ai' | 'mine';
  pc: PriceCheck;
  first: boolean;
}) {
  const chip = chipFor(t, item);
  const mineOn = chosen !== 'ai';
  return (
    <View className={`px-3 py-2.5 ${first ? '' : 'border-t border-line-row'}`}>
      <View className="flex-row items-center justify-between gap-2">
        <Txt className="text-callout font-medium text-fg">{ITEM_LABELS[t]}</Txt>
        {item.toggleable ? (
          <Txt className="text-sub" accessibilityLabel={`Yours ${money(item.current_value_zar)}, market ${money(item.ai_value_zar)}`}>
            <Txt className={`text-sub ${mineOn ? 'font-semibold text-fg' : 'text-faint'}`}>
              {money(item.current_value_zar)}
            </Txt>
            <Txt className="text-sub text-faint">{'  →  '}</Txt>
            <Txt className={`text-sub ${mineOn ? 'text-faint' : 'font-semibold text-fg'}`}>
              {money(item.ai_value_zar)}
            </Txt>
          </Txt>
        ) : (
          <Txt className="text-sub text-fg">
            {money(item.current_value_zar)}{' '}
            <Txt className="text-micro text-faint">{item.verdict === 'accurate' ? 'at market' : 'yours kept'}</Txt>
          </Txt>
        )}
      </View>
      <View className="mt-1.5 flex-row items-center justify-between gap-2">
        <View className="flex-1">
          <Badge label={chip.label} tone={chip.tone} />
        </View>
        {item.toggleable && (
          <SmallButton
            label={chosen === 'ai' ? 'Use mine' : 'Use market'}
            pressed={chosen === 'ai'}
            onPress={() => pc.setChoice(t, chosen === 'ai' ? 'mine' : 'ai')}
            accessibilityLabel={`${ITEM_LABELS[t]}: ${chosen === 'ai' ? 'use my figure' : 'use the market figure'}`}
          />
        )}
      </View>
    </View>
  );
}

// ── details ─────────────────────────────────────────────────────────────────
function Details({
  pc,
  fuelSettingStale,
  onOpenFuelSettings,
}: {
  pc: PriceCheck;
  fuelSettingStale: boolean;
  onOpenFuelSettings?: () => void;
}) {
  const { breakdown, review } = pc;
  const fuelDetail = breakdown.fuel?.detail || {};
  return (
    <View className="mt-3 gap-3 border-t border-line-row pt-3">
      {fuelSettingStale && (
        <Txt className="text-sub text-warning">
          Your fuel price ({perLitre(fuelDetail.your_price_per_litre)}) is below the official{' '}
          {perLitre(fuelDetail.market_price_per_litre)}, so every quote is under-priced on fuel.
          {onOpenFuelSettings ? (
            <Txt className="text-sub text-link" onPress={onOpenFuelSettings}>
              {' '}
              Update it in settings
            </Txt>
          ) : null}
        </Txt>
      )}
      {TOPICS.filter((t) => breakdown[t]).map((t) => {
        const item = breakdown[t]!;
        const d = item.detail || {};
        const plazas = t === 'tolls' && Array.isArray(d.plazas) ? d.plazas : [];
        const sources = [
          ...(item.source_url ? [{ url: item.source_url, title: item.source_name || '' }] : []),
          ...(item.sources || []),
        ].filter((s, i, all) => all.findIndex((x) => x.url === s.url) === i);
        const hosts = safeSources(sources).map((s) => httpsHost(s.url)).filter(Boolean) as string[];
        return (
          <View key={t}>
            <Txt className="text-sub font-semibold text-fg">{ITEM_LABELS[t]}</Txt>
            {detailLines(t, item).map((l) => (
              <Txt key={l} className="mt-0.5 text-sub text-muted">
                {l}
              </Txt>
            ))}
            {plazas.length > 0 && (
              <View className="mt-1 gap-1">
                {d.toll_class ? (
                  <Txt className="text-sub text-muted">
                    {clean(d.toll_class)}, one way{d.vat_basis === 'excl_vat' ? ', excl. VAT' : ''}
                  </Txt>
                ) : null}
                {plazas.map((p) => (
                  <Txt key={p.plaza} className="text-sub text-muted">
                    <Txt className={`text-sub ${p.verified ? 'text-success-dot' : 'text-warning-dot'}`}>●</Txt>
                    {p.route ? `${clean(p.route)} ` : ''}
                    {p.plaza}: yours {p.your_tariff_zar != null ? money(p.your_tariff_zar) : MISSING}, published{' '}
                    {p.market_tariff_zar != null ? money(p.market_tariff_zar) : MISSING}
                    <Txt className="text-micro text-faint">
                      {'  '}
                      {p.verified
                        ? p.effective_from
                          ? `tariff from ${formatDate(p.effective_from)}`
                          : 'confirmed'
                        : clean(p.note) || 'not confirmed'}
                    </Txt>
                  </Txt>
                ))}
                {Array.isArray(d.other_plazas_mentioned) && d.other_plazas_mentioned.length > 0 && (
                  <Txt className="text-sub text-muted">
                    Also mentioned, not on this route: {d.other_plazas_mentioned.join(', ')}
                  </Txt>
                )}
              </View>
            )}
            {/* The backend's sentence restates the row for checked items, so it is
                shown only where it explains why a figure wasn't verified. */}
            {kindOf(t, item) === 'unverified' && (item.reason || item.verification_note) ? (
              <Txt className="mt-0.5 text-sub text-warning">
                {clean(item.reason) || clean(item.verification_note)}
              </Txt>
            ) : null}
            {hosts.length > 0 && (
              <Txt className="mt-0.5 text-micro text-faint">Source: {hosts.join(', ')}</Txt>
            )}
          </View>
        );
      })}
      {review?.return_leg ? (
        <Txt className="text-sub text-muted">
          One way: an empty run home costs about {moneyWhole(review.return_leg.total_zar)} (fuel{' '}
          {moneyWhole(review.return_leg.fuel_zar)}, tolls {moneyWhole(review.return_leg.tolls_zar)}, driver{' '}
          {moneyWhole(review.return_leg.driver_zar)}). It isn&apos;t in the price, so the base rate has to cover it.
        </Txt>
      ) : null}
    </View>
  );
}
