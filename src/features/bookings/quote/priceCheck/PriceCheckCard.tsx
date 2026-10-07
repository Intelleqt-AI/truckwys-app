import { useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Badge, Card, Icon, Mono, Txt } from '@/components/ui';
import { formatDate } from '@/lib/formatters';
import { Skeleton } from '@/components/feedback';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
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
  type Choice,
  type ItemKey,
  type ReviewItem,
} from './types';

// The "Market price check" card that replaces the old win-model panel. Port of
// the web's AIPriceAnalysisPanel: nothing runs on its own, a check is started
// with a button, and every number comes from the backend. Switching an item
// between Mine and Market moves the quote to that combination at once, and is
// a lookup, never a recalculation here.

/** A small bordered button. TouchableOpacity, as the app does for new buttons. */
function SmallButton({
  label,
  onPress,
  disabled,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      // 36 drawn + 8 = a 44 hit area.
      hitSlop={{ top: 4, bottom: 4 }}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel ?? label}
      className={`min-h-[36px] items-center justify-center rounded-control border border-line-active bg-surface px-3 ${
        disabled ? 'opacity-40' : ''
      }`}
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
  onChoose,
  routeError,
  onOpenFuelSettings,
}: {
  pc: PriceCheck;
  /** Lane benchmark average, 0 when not loaded. */
  benchmarkAvg: number;
  benchmarkRecommendation?: string | null;
  guard: GuardInfo | null;
  /** Moves the quote to the market or the person's own figure for one item. */
  onChoose: (t: ItemKey, c: Choice) => void;
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
        <Txt className="text-caption text-muted" accessibilityLiveRegion="polite">
          {elapsed >= 3 ? `Checking… ${elapsed} s` : 'Checking…'}
        </Txt>
        <SmallButton label="Cancel" onPress={pc.cancelCheck} />
      </View>
    );
  } else if (!unavailable) {
    const label = outOfDate || entry ? 'Re-check' : failure?.code === 'failed' ? 'Retry' : 'Check';
    tools = (
      <View className="flex-row items-center gap-2">
        {outOfDate ? (
          <Badge label="Out of date" tone="warning" />
        ) : entry ? (
          <Txt className="text-caption text-muted">{checkedAgo(entry.at, now)}</Txt>
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
        <Skeleton height={48} radius={radius.control} />
        <Skeleton height={36} radius={radius.control} />
        <Skeleton height={36} radius={radius.control} />
      </View>
    );
  } else if (entry && combo) {
    body = figuresChanged ? (
      <Txt className="text-sub text-muted">Figures changed. Re-check.</Txt>
    ) : (
      <View className={loading ? 'opacity-60' : ''}>
        <Stats pc={pc} />
        <ItemRows pc={pc} crossBorder={crossBorder} onChoose={onChoose} />
      </View>
    );
  } else if (outOfDate) {
    body = (
      <Txt className="text-sub text-muted">Trip changed. Re-check.</Txt>
    );
  } else if (unavailable) {
    const t = failText ?? { title: 'Not available yet', text: '' };
    body = <Txt className="text-sub text-muted">{t.title}</Txt>;
  } else if (failText && !entry) {
    body = (
      <Txt className="text-sub text-muted">
        {failText.title}
        {failText.text ? `. ${failText.text}` : ''}
      </Txt>
    );
  } else if (routeError) {
    body = <Txt className="text-sub text-muted">Route failed. Change an address to retry.</Txt>;
  }
  // A re-check that was turned away keeps the result and says why.
  const notice = entry && failText && !unavailable ? failText.title : null;

  return (
    <Card>
      <View className="p-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <Txt className="text-callout font-semibold text-fg">Market check</Txt>
          </View>
          {tools}
        </View>

        {(benchmarkAvg > 0 || body) && (
          <View className="mt-3">
            {benchmarkAvg > 0 && (
              <Txt className="mb-2 text-caption text-muted">
                Lane average <Mono className="text-caption text-fg">{moneyWhole(benchmarkAvg)}</Mono>
              </Txt>
            )}
            {body}
          </View>
        )}

        {!!notice && <Txt className="mt-3 text-caption text-warning">{notice}</Txt>}

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
            hitSlop={{ top: 4, bottom: 4 }}
            className="mt-3 min-h-[36px] flex-row items-center gap-1"
          >
            <Icon name={detailsOpen ? 'chevronUp' : 'chevronDown'} size={15} color={colors.faint} />
            <Txt className="text-sub text-muted">{detailsOpen ? 'Hide' : 'Details'}</Txt>
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
          <Txt
            className={`flex-1 text-sub font-semibold ${
              guard.riskLevel === 'AT_RISK' ? 'text-danger' : 'text-warning'
            }`}
            accessibilityHint={clean(guard.message)}
          >
            {guard.riskLevel === 'AT_RISK' ? 'Margin at risk' : 'Margin below guardrail'}
          </Txt>
        </View>
      )}
    </Card>
  );
}

// ── headline figure + win chance ────────────────────────────────────────────
function Stats({ pc }: { pc: PriceCheck }) {
  const { combo, total, quoteNote, winText, winNote, winStale } = pc;
  if (!combo) return null;
  return (
    <View className="mb-3 flex-row gap-3">
      <View className="flex-1 rounded-control border border-line bg-surface-hover p-3">
        <Txt className="text-caption text-faint">Your quote</Txt>
        <Txt
          className="mt-0.5 text-heading font-semibold text-fg"
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {moneyWhole(total)}
        </Txt>
        {combo.below_floor || combo.below_target ? (
          <Txt className={`mt-0.5 text-caption font-medium ${combo.below_floor ? 'text-danger' : 'text-warning'}`}>
            {combo.below_floor ? 'Below cost' : 'Below target margin'}
          </Txt>
        ) : (
          <Txt className="mt-0.5 text-caption text-muted">{quoteNote}</Txt>
        )}
      </View>
      <View className="flex-1 rounded-control border border-line bg-surface-hover p-3">
        <Txt className="text-caption text-faint">Win chance</Txt>
        <Txt
          className={`mt-0.5 ${
            winText === 'Not scored' ? 'text-callout font-semibold text-muted' : 'text-heading font-semibold text-fg'
          }`}
          numberOfLines={1}
        >
          {winText}
        </Txt>
        <Txt className={`mt-0.5 text-caption ${winStale ? 'text-warning' : 'text-muted'}`}>{winNote}</Txt>
      </View>
    </View>
  );
}

// ── the four items, each with a Mine | Market switch ────────────────────────
function ItemRows({
  pc,
  crossBorder,
  onChoose,
}: {
  pc: PriceCheck;
  crossBorder: number;
  onChoose: (t: ItemKey, c: Choice) => void;
}) {
  const { breakdown, choices } = pc;
  return (
    <View className="overflow-hidden rounded-control border border-line">
      {TOPICS.map((t, i) => {
        const item = breakdown[t];
        if (!item) return null;
        return (
          <ItemRow
            key={t}
            t={t}
            item={item}
            chosen={choices?.[t] ?? 'mine'}
            loading={pc.loading}
            onChoose={onChoose}
            first={i === 0}
          />
        );
      })}
      {crossBorder > 0 && (
        <View className="flex-row items-center justify-between border-t border-line-row px-3 py-2.5">
          <Txt className="text-callout text-muted">Cross-border</Txt>
          <Txt className="text-sub text-fg">
            {money(crossBorder)} <Txt className="text-caption text-faint">not checked</Txt>
          </Txt>
        </View>
      )}
    </View>
  );
}

/** Mine | Market: shows which figure the quote uses now; tap the other to switch. */
function ChoiceSwitch({
  label,
  chosen,
  loading,
  onChoose,
}: {
  label: string;
  chosen: Choice;
  loading: boolean;
  onChoose: (c: Choice) => void;
}) {
  const options: { value: Choice; text: string }[] = [
    { value: 'mine', text: 'Mine' },
    { value: 'ai', text: 'Market' },
  ];
  return (
    <View
      className={`flex-row overflow-hidden rounded-control border border-line-active ${
        loading ? 'opacity-40' : ''
      }`}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
    >
      {options.map((o) => {
        const on = chosen === o.value;
        return (
          <TouchableOpacity
            key={o.value}
            onPress={() => onChoose(o.value)}
            disabled={on || loading}
            activeOpacity={0.7}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled: loading }}
            accessibilityLabel={`${label}: ${o.value === 'ai' ? 'market figure' : 'my figure'}`}
            // 44 tall: the segments sit inside an overflow-hidden track, which
            // would clip a hitSlop, so the size is real rather than padded.
            className={`min-h-[44px] min-w-[64px] items-center justify-center px-3 ${
              on ? 'bg-raised' : 'bg-surface'
            }`}
          >
            <Mono className={`text-caption ${on ? 'font-semibold text-fg' : 'font-medium text-muted'}`}>
              {o.text}
            </Mono>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function ItemRow({
  t,
  item,
  chosen,
  loading,
  onChoose,
  first,
}: {
  t: ItemKey;
  item: ReviewItem;
  chosen: Choice;
  loading: boolean;
  onChoose: (t: ItemKey, c: Choice) => void;
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
            <Txt className="text-caption text-faint">{item.verdict === 'accurate' ? 'at market' : 'yours kept'}</Txt>
          </Txt>
        )}
      </View>
      <View className="mt-1.5 flex-row items-center justify-between gap-2">
        <View className="flex-1">
          <Badge label={chip.label} tone={chip.tone} />
        </View>
        {item.toggleable && (
          <ChoiceSwitch
            label={ITEM_LABELS[t]}
            chosen={chosen}
            loading={loading}
            onChoose={(c) => onChoose(t, c)}
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
  const { breakdown } = pc;
  const fuelDetail = breakdown.fuel?.detail || {};
  return (
    <View className="mt-3 gap-3 border-t border-line-row pt-3">
      {fuelSettingStale && onOpenFuelSettings && (
        <Txt className="text-sub text-link" onPress={onOpenFuelSettings}>
          Your diesel {perLitre(fuelDetail.your_price_per_litre)} · update
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
                    <Txt className="text-caption text-faint">
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
              <Txt className="mt-0.5 text-caption text-faint">Source: {hosts.join(', ')}</Txt>
            )}
          </View>
        );
      })}
    </View>
  );
}
