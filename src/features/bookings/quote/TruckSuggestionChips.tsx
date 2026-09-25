import { memo } from 'react';
import { View, TouchableOpacity } from 'react-native';
// Gesture-handler's ScrollView, not react-native's — same reason as
// RouteOptionChips.tsx: nested inside BottomSheetScrollView's
// PanGestureHandler tree, a plain ScrollView loses touch arbitration and
// never gets to claim a horizontal swipe.
import { ScrollView } from 'react-native-gesture-handler';
import { Label, Mono } from '@/components/ui';
import { describedCargoClass, type TruckSuggestion } from './suggestions';

/**
 * Truck suggestions for the Load section — mirrors web's QuoteBuilder.tsx
 * (commit "Suggest trucks for the load, ranked by cargo and capacity"), with
 * the reasoning surfaced differently: web puts it behind an info popover,
 * which this app has no equivalent of, so every card shows its own reasons
 * up front instead of hiding them behind a tap.
 *
 * Offered, not applied — accepting one runs the same apply path as picking it
 * from the dropdown (rate, capacity check and lane benchmark all switch on
 * together), never silently.
 */
function TruckSuggestionChipsImpl({
  suggestions,
  tonnes,
  cargo,
  onSelect,
}: {
  suggestions: TruckSuggestion[];
  tonnes: number;
  cargo: string;
  onSelect: (name: string) => void;
}) {
  if (!suggestions.length || !(tonnes > 0)) return null;

  const wanted = describedCargoClass(cargo);

  return (
    <View>
      {/* Deliberately NOT web's "{t}t needs at least a {t}t truck" — that line
          works there because the chips sit inline after it as a colon-led
          sentence, so it's a lead-in, not a title. Standing alone as an
          eyebrow above a card row (this app's layout), it just repeats the
          weight. Presentation only — ranking, rate and every card number stay
          identical to web. */}
      <Label className="mb-2 text-muted">Suggested for this {tonnes}t load</Label>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {suggestions.map((s) => {
          const best = s.fitLabel === 'Best fit';
          const a11yLabel = `${s.name}, rated ${s.cap} tonnes, you own ${s.owned}`;
          return (
            <TouchableOpacity
              key={s.vt.id || s.name}
              onPress={() => onSelect(s.name)}
              accessibilityRole="button"
              accessibilityLabel={a11yLabel}
              className="min-w-[152px] justify-center gap-1 rounded-control border border-line bg-surface px-3 py-2.5"
            >
              <View className="flex-row items-center gap-1.5">
                <Mono className="flex-shrink text-micro uppercase tracking-wide text-fg" numberOfLines={1}>
                  {s.name} ({s.cap}t)
                </Mono>
              </View>
              <Mono
                className={`text-nano uppercase tracking-wide ${best ? 'text-success' : 'text-faint'}`}
                numberOfLines={1}
              >
                {s.fitLabel}
              </Mono>
              <Mono className="text-micro text-faint" numberOfLines={1}>
                {s.spare <= 0 ? 'exact fit' : `${s.spare}t spare`} · {s.rate}
              </Mono>
              <Mono className="text-micro text-faint" numberOfLines={1}>
                you own {s.owned}
              </Mono>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {wanted === 'general' && (
        <Mono className="mt-1.5 text-micro text-faint">
          Add a cargo description for a better ranking.
        </Mono>
      )}
    </View>
  );
}

export const TruckSuggestionChips = memo(TruckSuggestionChipsImpl);
