import { useEffect, useState } from 'react';
import { View, Pressable, Platform } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/ui/icons';
import { Mono } from '@/components/ui/Text';
import { Glass } from '@/components/ui/Glass';
import { useTheme } from '@/theme/ThemeProvider';

// Slack-style bottom bar: one Liquid Glass pill docked near the bottom edge.
// The active destination sits in a rounded highlight whose radius matches the
// bar's inner curve and springs between cells; each item scales on tap.
const TAB_ICON: Record<string, IconName> = {
  Home: 'home',
  Bookings: 'file',
  Fleet: 'truck',
  Finance: 'receipt',
};

const H_MARGIN = 32; // narrower bar (larger side margins)
const BAR_HEIGHT = 58;
const HPAD = 6; // inner horizontal padding
const V_INSET = 5; // highlight sits 5px inside the bar edge (bigger pill)
const HL_H = BAR_HEIGHT - V_INSET * 2; // highlight height
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
  // Two decoupled shared values: focusScale is only touched in the effect,
  // press only in handlers — never both (keeps the reanimated rule happy).
  const focusScale = useSharedValue(focused ? 1 : 0.96);
  const press = useSharedValue(1);

  // Active item springs up a touch; inactive rests slightly smaller.
  useEffect(() => {
    focusScale.value = withSpring(focused ? 1 : 0.96, { damping: 15, stiffness: 200, mass: 0.6 });
  }, [focused, focusScale]);

  const content = useAnimatedStyle(() => ({
    transform: [{ scale: focusScale.value * press.value }],
  }));

  const iconColor = focused ? colors.accent : colors.muted;
  const labelColor = focused ? colors.fg : colors.faint;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        press.value = withSpring(0.9, { damping: 18, stiffness: 320, mass: 0.5 });
      }}
      onPressOut={() => {
        press.value = withSpring(1, { damping: 15, stiffness: 200, mass: 0.6 });
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      style={{ flex: 1 }}
    >
      <Animated.View
        style={[{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 }, content]}
      >
        <Icon name={icon} size={22} color={iconColor} strokeWidth={focused ? 2.2 : 1.8} />
        <Mono
          style={{
            fontSize: 9.5,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            color: labelColor,
            fontWeight: focused ? '700' : '500',
          }}
        >
          {label}
        </Mono>
      </Animated.View>
    </Pressable>
  );
}

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { scheme } = useTheme();
  const [innerW, setInnerW] = useState(0);

  // Accent-tinted highlight reads on both themes over the glass bar.
  const highlightBg = scheme === 'dark' ? 'rgba(77,158,255,0.20)' : 'rgba(37,99,235,0.12)';

  const count = state.routes.length;
  const cellW = innerW ? innerW / count : 0;
  const hlW = cellW ? cellW - 8 : 0; // bigger active highlight
  const x = useSharedValue(0);

  useEffect(() => {
    if (!cellW) return;
    x.value = withSpring(cellW * state.index + (cellW - hlW) / 2, {
      damping: 20,
      stiffness: 200,
      mass: 0.7,
    });
  }, [state.index, cellW, hlW, x]);

  const highlight = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: H_MARGIN, right: H_MARGIN, bottom: insets.bottom }}
    >
      <Glass
        interactive
        radius={BAR_HEIGHT / 2}
        intensity={50}
        style={{
          height: BAR_HEIGHT,
          shadowColor: '#000',
          shadowOpacity: 0.28,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 14,
        }}
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
                  width: hlW,
                  height: HL_H,
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
  );
}
