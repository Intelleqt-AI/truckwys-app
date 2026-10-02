import { useEffect, useState } from 'react';
import { View, TouchableOpacity, Platform } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/ui/icons';
import { Mono } from '@/components/ui/Text';
import { Glass } from '@/components/ui/Glass';
import { useTheme } from '@/theme/ThemeProvider';
import { TAP_MIN } from '@/theme/tokens';

// Slack-style bottom bar: one Liquid Glass pill docked near the bottom edge.
// The active destination sits in a rounded highlight whose radius matches the
// bar's inner curve and springs between cells (instantly under Reduce Motion).
// v3: no shadow and no fade, just the glass surface with a 1px `line` hairline.
const TAB_ICON: Record<string, IconName> = {
  Home: 'home',
  Bookings: 'file',
  Fleet: 'truck',
  Finance: 'receipt',
};

const H_MARGIN = 32; // narrower bar (larger side margins)
const BAR_HEIGHT = 58; // minimum: the bar grows with Dynamic Type
const HPAD = 3; // inner horizontal padding
const V_INSET = 3; // highlight sits 3px inside the bar edge (near edge-to-edge)
const HL_RADIUS = BAR_HEIGHT / 2 - V_INSET; // matches the bar's inner curve

function Destination({
  focused,
  label,
  icon,
  onPress,
}: {
  focused: boolean;
  label: string;
  icon: IconName;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const focusScale = useSharedValue(focused ? 1 : 0.96);

  // Active item springs up a touch; inactive rests slightly smaller.
  useEffect(() => {
    const target = focused ? 1 : 0.96;
    focusScale.value = reduceMotion
      ? target
      : withSpring(target, { damping: 15, stiffness: 200, mass: 0.6 });
  }, [focused, focusScale, reduceMotion]);

  const content = useAnimatedStyle(() => ({
    transform: [{ scale: focusScale.value }],
  }));

  // v3: the active destination is ink-on-ink (navActive*), never accent blue.
  // That pill is #0E1116 in light, so the icon/label must use navActiveFg (the
  // text-primary token on that fill), not `fg`, which would vanish into it.
  const iconColor = focused ? colors.navActiveFg : colors.muted;
  const labelColor = focused ? colors.navActiveFg : colors.muted;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      style={{ flex: 1, minHeight: TAP_MIN }}
    >
      <Animated.View
        style={[
          { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: TAP_MIN },
          content,
        ]}
      >
        <Icon name={icon} size={22} color={iconColor} strokeWidth={focused ? 2.2 : 1.8} />
        {/* 11px is the spec'd tab label; no fixed height so it can scale. */}
        <Mono
          style={{
            fontSize: 11,
            lineHeight: 14,
            color: labelColor,
            fontWeight: focused ? '600' : '500',
          }}
        >
          {label}
        </Mono>
      </Animated.View>
    </TouchableOpacity>
  );
}

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [innerW, setInnerW] = useState(0);

  // Ink highlight (the web's active nav pill): #0E1116 in light, #262A31 in dark.
  const highlightBg = colors.navActiveBg;

  // Standard iOS floating-bar position: docked just above the home
  // indicator / Android nav bar, with a consistent gap on top of the safe
  // area so the bar never sits under the system nav area.
  const barBottom = Math.max(insets.bottom, 8) + 4;
  const reduceMotion = useReducedMotion();

  const count = state.routes.length;
  const cellW = innerW ? innerW / count : 0;
  // Full cell width: with HPAD=3 the pill sits 3px from the bar's left/right
  // edges at the end tabs, matching the 3px vertical inset (edge-to-edge look).
  const hlW = cellW;
  const x = useSharedValue(0);

  useEffect(() => {
    if (!cellW) return;
    const target = cellW * state.index + (cellW - hlW) / 2;
    x.value = reduceMotion ? target : withSpring(target, { damping: 20, stiffness: 200, mass: 0.7 });
  }, [state.index, cellW, hlW, x, reduceMotion]);

  const highlight = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
      <View
        pointerEvents="box-none"
        style={{ marginHorizontal: H_MARGIN, marginBottom: barBottom }}
      >
        <Glass
          radius={BAR_HEIGHT / 2}
          intensity={50}
          style={{ minHeight: BAR_HEIGHT, borderWidth: 1, borderColor: colors.line }}
        >
          <View
            style={{ flex: 1, paddingHorizontal: HPAD }}
            onLayout={(e) => setInnerW(e.nativeEvent.layout.width - HPAD * 2)}
          >
            {hlW > 0 && (
              <Animated.View
                pointerEvents="none"
                style={[
                  {
                    position: 'absolute',
                    left: HPAD,
                    top: V_INSET,
                    bottom: V_INSET,
                    width: hlW,
                    borderRadius: HL_RADIUS,
                    backgroundColor: highlightBg,
                  },
                  highlight,
                ]}
              />
            )}
            <View style={{ flex: 1, flexDirection: 'row' }}>
              {state.routes.map((route, index) => {
                const focused = state.index === index;
                const onPress = () => {
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!focused && !event.defaultPrevented) {
                    if (Platform.OS !== 'web') void Haptics.selectionAsync();
                    navigation.navigate(route.name);
                  }
                };
                return (
                  <Destination
                    key={route.key}
                    focused={focused}
                    label={route.name}
                    icon={TAB_ICON[route.name] ?? 'grid'}
                    onPress={onPress}
                  />
                );
              })}
            </View>
          </View>
        </Glass>
      </View>
    </View>
  );
}
