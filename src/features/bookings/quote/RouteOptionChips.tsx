import { memo } from 'react';
import { View, TouchableOpacity } from 'react-native';
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
  /** The backend could not calculate tolls for this route; tollZar is then a
      meaningless 0, not "free". */
  tollsUnavailable: boolean;
}

/**
 * Route alternatives: name and tag, distance and time, tolls. A route whose
 * toll lookup failed says "Tolls unknown", never R 0.
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
    tollsUnavailable:
      r.tolls_unknown === true || r.tolls_unavailable === true || ('toll_cost_zar' in r && r.toll_cost_zar == null),
  }));
  const fastestIdx = stats.reduce(
    (best, s, i) =>
      s.durationMin > 0 && (best < 0 || s.durationMin < stats[best]!.durationMin) ? i : best,
    -1,
  );
  // A route whose tolls could not be calculated reports 0, which would
  // otherwise win "Cheapest" for a cost nobody knows.
  const cheapestIdx = stats.reduce(
    (best, s, i) =>
      s.tollsUnavailable ? best : best < 0 || s.tollZar < stats[best]!.tollZar ? i : best,
    -1,
  );

  return (
    <View>
      <Label className="mb-2 text-muted">Routes</Label>
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
          if (i === cheapestIdx) tags.push('Fewest tolls');
          const label = str(pick(r, ['label', 'summary']), `Route ${i + 1}`);
          const a11yLabel = [
            label,
            `${Math.round(s.distanceKm)} kilometres`,
            formatDuration(s.durationMin / 60),
            s.tollsUnavailable ? 'tolls unknown' : `${formatCurrency(s.tollZar)} in tolls`,
            tags.length ? tags.join(', ') : null,
          ]
            .filter(Boolean)
            .join(', ');

          return (
            <TouchableOpacity
              key={i}
              onPress={() => onSelect(i)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={a11yLabel}
              className={`min-w-[152px] justify-center gap-1 rounded-control border px-3 py-2.5 ${
                active ? 'border-line-strong bg-raised' : 'border-line bg-surface'
              }`}
            >
              <View className="flex-row items-center gap-1.5">
                <Mono
                  className={`flex-shrink text-caption font-medium ${active ? 'text-fg' : 'text-muted'}`}
                  numberOfLines={1}
                >
                  {label}
                </Mono>
                {tags[0] && (
                  <Mono
                    className="text-caption font-medium text-success"
                    numberOfLines={1}
                  >
                    {tags[0]}
                  </Mono>
                )}
              </View>
              <Mono className="text-caption text-faint" numberOfLines={1}>
                {Math.round(s.distanceKm)} km · {formatDuration(s.durationMin / 60)}
              </Mono>
              <Mono className={`text-caption ${s.tollsUnavailable ? 'text-danger' : 'text-faint'}`} numberOfLines={1}>
                {s.tollsUnavailable ? 'Tolls unknown' : `Tolls ${formatCurrency(s.tollZar, { maximumFractionDigits: 0 })}`}
              </Mono>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export const RouteOptionChips = memo(RouteOptionChipsImpl);
