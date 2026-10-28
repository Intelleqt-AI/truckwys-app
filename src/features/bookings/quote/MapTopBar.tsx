import { memo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import { AppSheet, Glass, Icon, Mono, Txt } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { useQuoteMotion } from './motion';

// The screen's own chrome over the map, since the native header is off here: a
// round back control, the route at a glance, and (test companies) the two
// testing tools. All on Glass — Liquid Glass on iOS 26, blur on older iOS, a
// near-solid surface on Android — so they hold against any map tile and follow
// light/dark, which a fixed white-on-translucent-black chevron did not.
//
// The touchables sit INSIDE the Glass with no opacity dip (activeOpacity 1,
// press shown by dimming the content): a GlassView must never have its own
// opacity animated or dimmed, it stops rendering. The pill's entrance is a
// scale for the same reason.
//
// The row is `box-none`, so the empty middle of it passes map gestures through.
// It stays ≤ 52 tall: the map reserves topInset + 64 above the route when it
// frames it (MapCanvas), and a taller bar would sit on the route.

function GlassCircle({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <Glass radius={radius.control} interactive style={{ width: 40, height: 40 }}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        activeOpacity={1}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <View style={{ opacity: pressed ? 0.55 : 1 }}>{children}</View>
      </TouchableOpacity>
    </Glass>
  );
}

function MapTopBarImpl({
  top,
  onBack,
  pillText,
  pillTolls,
  pillBusy,
  onPillPress,
  picking,
  tools,
  onClear,
  onExport,
}: {
  /** Safe-area top inset. */
  top: number;
  onBack: () => void;
  /** "≈ 562 km · 6h 10m", "Routing…", or null for no pill. */
  pillText: string | null;
  /** "R 1 020 tolls" / "Tolls unknown" — dropped on a narrow screen. */
  pillTolls: string | null;
  pillBusy: boolean;
  onPillPress: () => void;
  /** Placing a pin on the map: the pill steps aside (unmounted, not faded). */
  picking: boolean;
  /** Test companies: the Clear / Export working menu. */
  tools: boolean;
  onClear: () => void;
  onExport: () => void;
}) {
  const { colors } = useTheme();
  const m = useQuoteMotion();
  const { width } = useWindowDimensions();
  const [menuOpen, setMenuOpen] = useState(false);
  // The chosen tool waits for the sheet to finish leaving: iOS won't present an
  // Alert (Clear asks to confirm) while this sheet is still on its way out.
  const pending = useRef<(() => void) | null>(null);
  const run = (fn: () => void) => {
    pending.current = fn;
    setMenuOpen(false);
  };

  const showTolls = !!pillTolls && width >= 380;

  return (
    <View
      className="absolute left-0 right-0 flex-row items-center gap-2 px-4"
      style={{ top: top + 6 }}
      pointerEvents="box-none"
    >
      <GlassCircle label="Back" onPress={onBack}>
        <Icon name="chevronLeft" size={22} color={colors.fg} strokeWidth={2.4} />
      </GlassCircle>

      <View
        className="min-w-0 flex-1 flex-row items-center justify-end gap-2"
        pointerEvents="box-none"
      >
        {!picking && pillText ? (
          <Animated.View entering={m.zoom} className="min-w-0 shrink">
            <Glass radius={radius.control} interactive style={{ height: 40 }}>
              <TouchableOpacity
                onPress={onPillPress}
                activeOpacity={1}
                accessibilityRole="button"
                accessibilityLabel={`Route: ${pillText}${showTolls ? `, ${pillTolls}` : ''}. Go to the route`}
                style={{
                  flexGrow: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingHorizontal: 14,
                }}
              >
                {pillBusy ? (
                  <ActivityIndicator size="small" color={colors.muted} />
                ) : (
                  <Icon name="route" size={16} color={colors.fg} />
                )}
                <Mono className="shrink text-callout font-semibold text-fg" numberOfLines={1}>
                  {pillText}
                </Mono>
                {showTolls ? (
                  <Mono className="shrink text-caption text-muted" numberOfLines={1}>
                    · {pillTolls}
                  </Mono>
                ) : null}
              </TouchableOpacity>
            </Glass>
          </Animated.View>
        ) : null}

        {tools ? (
          <GlassCircle label="Testing tools" onPress={() => setMenuOpen(true)}>
            <Icon name="more" size={20} color={colors.fg} />
          </GlassCircle>
        ) : null}
      </View>

      {tools ? (
        <AppSheet
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          onDismissed={() => {
            const fn = pending.current;
            pending.current = null;
            fn?.();
          }}
          title="Testing tools"
        >
          <View className="px-3 pb-2 pt-1">
            <TouchableOpacity
              onPress={() => run(onExport)}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Export working"
              className="min-h-[48px] flex-row items-center gap-3 rounded-chip px-2.5 py-2"
            >
              <Icon name="download" size={18} color={colors.fg} />
              <Txt className="text-body">Export working</Txt>
            </TouchableOpacity>
            <View className="mx-1.5 my-1 h-px bg-line" />
            <TouchableOpacity
              onPress={() => run(onClear)}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Clear"
              className="min-h-[48px] flex-row items-center gap-3 rounded-chip px-2.5 py-2"
            >
              <Icon name="trash" size={18} color={colors.danger} />
              <Txt className="text-body" style={{ color: colors.danger }}>
                Clear
              </Txt>
            </TouchableOpacity>
          </View>
        </AppSheet>
      ) : null}
    </View>
  );
}

export const MapTopBar = memo(MapTopBarImpl);
