import { useState, type ReactNode } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Icon, Mono, Txt } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import type { RankedRow } from './types';

// ── RankedList: who brings in the most ──────────────────────────────────────
// Biggest first, each with a bar against the biggest and its share of the whole;
// only the top row's bar is the accent. Rows with no value are not ranked: they
// wait in a collapsed group so they do not look like a bar of zero.
export function RankedList({
  rows,
  format,
  topN = 8,
  noValueLabel,
  empty,
}: {
  rows: RankedRow[];
  format: (v: number) => string;
  topN?: number;
  /** "No revenue recorded": the group of rows with no value, and the text on each. */
  noValueLabel: string;
  /** Shown when no row has a value. */
  empty: string;
}) {
  const { colors } = useTheme();
  const [all, setAll] = useState(false);
  const [none, setNone] = useState(false);

  const ranked = rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  const unranked = rows.filter((r) => r.value <= 0);
  const max = ranked[0]?.value ?? 0;
  const total = ranked.reduce((s, r) => s + r.value, 0);
  const shown = all ? ranked : ranked.slice(0, topN);

  const line = (r: RankedRow, content: ReactNode, last: boolean) => {
    const body = (
      <View className={`min-h-[44px] justify-center py-2.5 ${last ? '' : 'border-b border-line-row'}`}>{content}</View>
    );
    return r.onPress ? (
      <TouchableOpacity key={r.id} onPress={r.onPress} activeOpacity={0.6} accessibilityRole="button">
        {body}
      </TouchableOpacity>
    ) : (
      <View key={r.id}>{body}</View>
    );
  };

  return (
    <View>
      {ranked.length === 0 ? (
        <Txt className="text-callout text-muted">{empty}</Txt>
      ) : (
        <View>
          {shown.map((r, i) =>
            line(
              r,
              <>
                <View className="flex-row items-baseline justify-between gap-3">
                  <Mono className="flex-1 text-callout font-medium text-fg" numberOfLines={1}>
                    {r.label}
                  </Mono>
                  <Mono className="text-callout text-fg">{format(r.value)}</Mono>
                </View>
                <View className="mt-1.5 h-[6px] overflow-hidden rounded-pill bg-surface-hover">
                  <View
                    className="h-[6px] rounded-pill"
                    style={{
                      width: `${Math.max(2, (r.value / max) * 100)}%`,
                      backgroundColor: i === 0 ? colors.accent : colors.chartMuted,
                      opacity: i === 0 ? 1 : 0.5,
                    }}
                  />
                </View>
                <View className="mt-1 flex-row justify-between gap-3">
                  <Txt className="flex-1 text-caption text-faint" numberOfLines={1}>
                    {r.meta ?? ''}
                  </Txt>
                  <Mono className="text-caption text-faint">{`${Math.round((r.value / total) * 100)}%`}</Mono>
                </View>
              </>,
              i === shown.length - 1 && ranked.length <= topN,
            ),
          )}
          {ranked.length > topN ? (
            <TouchableOpacity
              onPress={() => setAll((a) => !a)}
              activeOpacity={0.6}
              accessibilityRole="button"
              className="min-h-[44px] items-center justify-center"
            >
              <Mono className="text-caption font-medium text-link">
                {all ? `Show top ${topN}` : `Show all ${ranked.length}`}
              </Mono>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {unranked.length > 0 ? (
        <View className={ranked.length > 0 ? 'mt-2' : 'mt-3'}>
          <TouchableOpacity
            onPress={() => setNone((o) => !o)}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityState={{ expanded: none }}
            className="min-h-[44px] flex-row items-center gap-1.5"
          >
            <Mono className="text-caption font-medium text-faint">{`${noValueLabel} (${unranked.length})`}</Mono>
            <Icon name={none ? 'chevronUp' : 'chevronDown'} size={12} color={colors.faint} />
          </TouchableOpacity>
          {none
            ? unranked.map((r, i) =>
                line(
                  r,
                  <View className="flex-row items-baseline justify-between gap-3">
                    <Mono className="flex-1 text-callout text-muted" numberOfLines={1}>
                      {r.label}
                    </Mono>
                    <Txt className="text-caption text-faint" numberOfLines={1}>
                      {r.meta ?? ''}
                    </Txt>
                  </View>,
                  i === unranked.length - 1,
                ),
              )
            : null}
        </View>
      ) : null}
    </View>
  );
}
