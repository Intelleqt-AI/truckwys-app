import { memo } from 'react';
import { View, Pressable } from 'react-native';
// Gesture-handler's ScrollView, not react-native's — nested inside
// BottomSheetScrollView's PanGestureHandler tree, a plain ScrollView loses
// touch arbitration and never gets to claim a horizontal swipe (documented
// gorhom/bottom-sheet gotcha for any scrollable nested in sheet content).
import { ScrollView } from 'react-native-gesture-handler';
import { Label, Mono } from '@/components/ui';
import { num, pick, str } from '@/lib/api/list';
import { formatCurrency, formatDuration } from '@/lib/formatters';

interface RouteStat {
  distanceKm: number;
  durationMin: number;
  tollZar: number;
}

/**
 * Alternative-route chips — moved out of CreateQuoteScreen.tsx's render body
 * (Phase 2) verbatim, wrapped in memo. Phase 5: each card now carries the
 * actual decision information (distance/duration/tolls and, for the
 * non-selected routes, the delta against whichever route is selected) plus
 * FASTEST/CHEAPEST/RECOMMENDED tags computed client-side — all from fields
 * already in `routes[i]` and the response's `best_index`, no API change.
 * Same behaviour as before otherwise: only renders past one route, onPress
 * does exactly what it did inline.
 */
function RouteOptionChipsImpl({
  routes,
  selectedRouteIndex,
  bestIndex,
  onSelect,
}: {
  routes: Record<string, unknown>[];
  selectedRouteIndex: number;
  /** The response's own best_index — may be out of range or absent if the
      backend didn't return one; both are handled below. */
  bestIndex: number;
  onSelect: (index: number) => void;
}) {
  if (routes.length <= 1) return null;

  const stats: RouteStat[] = routes.map((r) => ({
    distanceKm: num(pick(r, ['distance_km'])),
    durationMin: num(pick(r, ['duration_minutes'])) || num(pick(r, ['duration_min'])),
    tollZar: num(pick(r, ['toll_cost_zar'])),
  }));
  const fastestIdx = stats.reduce(
    (best, s, i) =>
      s.durationMin > 0 && (best < 0 || s.durationMin < stats[best]!.durationMin) ? i : best,
    -1,
  );
  const cheapestIdx = stats.reduce(
    (best, s, i) => (best < 0 || s.tollZar < stats[best]!.tollZar ? i : best),
    -1,
  );
  const selected = stats[selectedRouteIndex];

  return (
    <View>
      <Label className="mb-2 text-muted">Alternative routes</Label>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {routes.map((r, i) => {
          const active = i === selectedRouteIndex;
          const s = stats[i]!;
          const tags: string[] = [];
          if (i === bestIndex) tags.push('Recommended');
          if (i === fastestIdx) tags.push('Fastest');
          if (i === cheapestIdx) tags.push('Cheapest');
          const label = str(pick(r, ['label', 'summary']), `Route ${i + 1}`);

          const deltaDistance = !active && selected ? s.distanceKm - selected.distanceKm : null;
          const deltaDuration = !active && selected ? s.durationMin - selected.durationMin : null;
          const deltaToll = !active && selected ? s.tollZar - selected.tollZar : null;
          const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '±');

          const a11yLabel = [
            label,
            `${Math.round(s.distanceKm)} kilometres`,
            formatDuration(s.durationMin / 60),
            `${formatCurrency(s.tollZar)} in tolls`,
            tags.length ? tags.join(', ') : null,
          ]
            .filter(Boolean)
            .join(', ');

          return (
            <Pressable
              key={i}
              onPress={() => onSelect(i)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={a11yLabel}
              className={`min-w-[152px] justify-center gap-1 rounded-xs border px-3 py-2.5 ${
                active ? 'border-accent bg-accent-dim' : 'border-line bg-surface'
              }`}
            >
              <View className="flex-row items-center gap-1.5">
                <Mono
                  className={`flex-shrink text-micro uppercase tracking-wide ${active ? 'text-accent' : 'text-muted'}`}
                  numberOfLines={1}
                >
                  {label}
                </Mono>
                {tags[0] && (
                  <Mono
                    className="text-nano uppercase tracking-wide text-success"
                    numberOfLines={1}
                  >
                    {tags[0]}
                  </Mono>
                )}
              </View>
              <Mono className="text-micro text-faint" numberOfLines={1}>
                {Math.round(s.distanceKm)} km · {formatDuration(s.durationMin / 60)}
              </Mono>
              {deltaDistance == null || deltaDuration == null || deltaToll == null ? (
                <Mono className="text-micro text-faint" numberOfLines={1}>
                  {formatCurrency(s.tollZar)} tolls
                </Mono>
              ) : (
                <Mono className="text-micro text-faint" numberOfLines={1}>
                  {sign(deltaDistance)}
                  {Math.round(Math.abs(deltaDistance))} km · {sign(deltaDuration)}
                  {Math.round(Math.abs(deltaDuration))} min · {sign(deltaToll)}
                  {formatCurrency(Math.abs(deltaToll))}
                </Mono>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export const RouteOptionChips = memo(RouteOptionChipsImpl);
