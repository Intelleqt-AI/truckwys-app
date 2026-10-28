import type { ReactNode } from 'react';
import { View, TouchableOpacity } from 'react-native';
import Animated from 'react-native-reanimated';
import { ArrowUpDown } from 'lucide-react-native';
import { Card, Icon, Mono, Txt } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { tapHaptic, useQuoteMotion } from './motion';

/**
 * The route as one object: every location is a row on a vertical rail, with
 * markers that match the map's pins (collection green, stops blue and numbered,
 * delivery red), so the form and the map speak the same colour key.
 *
 * Layout notes:
 *  - The rail is drawn per row (a short lead-in, the marker, then a connector
 *    that flexes to the row's bottom), not as one absolute line, so it stretches
 *    when a row grows (suggestions, the coordinates panel) without measuring.
 *  - Everything stays inside the Card, whose overflow is hidden.
 *  - Rows are plain children, so the screen keeps wrapping each one (plus its
 *    "Check this" hint) in the Views its scroll-to-field refs point at.
 */
export type RailMarker = 'pickup' | 'stop' | 'delivery' | 'add';

export function RouteTimeline({ children }: { children: ReactNode }) {
  return <Card>{children}</Card>;
}

// Where the marker's centre sits: the row's 12px top padding plus half of the
// 20px caption line, so it lines up with the location's caption.
const LEAD = 12;
const MARKER_BOX = 20;

function Marker({ marker, index }: { marker: RailMarker; index?: number }) {
  const { colors } = useTheme();
  if (marker === 'pickup') {
    return (
      <View
        style={{
          width: 12,
          height: 12,
          borderRadius: 12,
          borderWidth: 3,
          borderColor: colors.successDot,
          backgroundColor: colors.surface,
        }}
      />
    );
  }
  if (marker === 'stop') {
    return (
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 18,
          backgroundColor: colors.infoDot,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Mono
          className="text-micro font-semibold"
          style={{ color: colors.onAccent }}
          maxFontSizeMultiplier={1}
        >
          {index}
        </Mono>
      </View>
    );
  }
  if (marker === 'delivery') {
    return (
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 16,
          backgroundColor: colors.dangerDot,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View style={{ width: 6, height: 6, borderRadius: 6, backgroundColor: colors.surface }} />
      </View>
    );
  }
  return (
    <View
      style={{
        width: 18,
        height: 18,
        borderRadius: 18,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: colors.lineStrong,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name="plus" size={12} color={colors.faint} strokeWidth={2.4} />
    </View>
  );
}

/**
 * One row on the rail: the gutter (connector + marker) and the row's content.
 * `animate` turns on the entrance/exit for rows that come and go (stops); it is
 * false for the first render of a reopened quote so every stop doesn't play it.
 */
export function RailRow({
  marker,
  index,
  first,
  last,
  animate,
  children,
}: {
  marker: RailMarker;
  /** 1-based stop number, for the numbered stop marker. */
  index?: number;
  first?: boolean;
  last?: boolean;
  animate?: boolean;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const m = useQuoteMotion();
  const line = colors.lineStrong;
  return (
    <Animated.View
      className="flex-row"
      entering={animate ? m.enterDown : undefined}
      exiting={animate ? m.exit : undefined}
      layout={animate ? m.layout : undefined}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ width: 40, alignItems: 'center' }}
      >
        <View style={{ width: 2, height: LEAD, backgroundColor: first ? 'transparent' : line }} />
        <View style={{ height: MARKER_BOX, alignItems: 'center', justifyContent: 'center' }}>
          <Marker marker={marker} index={index} />
        </View>
        <View style={{ width: 2, flex: 1, backgroundColor: last ? 'transparent' : line }} />
      </View>
      <View className="min-w-0 flex-1 py-3 pr-3">{children}</View>
    </Animated.View>
  );
}

/**
 * Swap Collection and Delivery: a small bordered chip in Delivery's caption line,
 * so it reads as a control and never overlaps the suggestions list. 24 drawn,
 * 44 with hitSlop.
 */
export function SwapRouteButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={() => {
        tapHaptic();
        onPress();
      }}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel="Swap collection and delivery"
      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
      className="h-6 flex-row items-center gap-1 rounded-chip border border-line-active px-2.5"
    >
      <ArrowUpDown size={12} color={colors.muted} strokeWidth={2.2} />
      <Mono className="text-caption font-medium text-muted">Swap</Mono>
    </TouchableOpacity>
  );
}

/** "Add stop" as a rail row: a real tappable row with a dashed marker, not bare text. */
export function AddStopRow({ onPress, animate }: { onPress: () => void; animate?: boolean }) {
  return (
    <RailRow marker="add" animate={animate}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel="Add stop"
        // Drawn on the caption line so it sits level with its marker; the row's own
        // 12px padding above and below makes the 44pt target.
        className="min-h-[20px] justify-center self-start"
        hitSlop={{ top: 12, bottom: 12, right: 16 }}
      >
        <Txt className="text-callout font-medium text-fg">Add stop</Txt>
      </TouchableOpacity>
    </RailRow>
  );
}
