import { useEffect, useState } from 'react';
import { View, Pressable, Platform } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  FadeIn,
  FadeOut,
  LinearTransition,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/ui/icons';
import { Txt } from '@/components/ui/Text';
import { Glass } from '@/components/ui/Glass';
import { useTheme } from '@/theme/ThemeProvider';

// Floating pill bottom bar. Equal-width cells (the bar itself never reflows);
// a frosted-glass indicator pill springs to the active cell, and the active
// tab shows icon + label INLINE inside it (reference layout).
const TAB_ICON: Record<string, IconName> = {
  Home: 'home',
  Bookings: 'file',
  Fleet: 'truck',
  Finance: 'receipt',
};

const H_MARGIN = 20;
const BAR_HEIGHT = 62;
const PILL_H = 46;

function TabCell({ focused, label, icon }: { focused: boolean; label: string; icon: IconName }) {
  const { colors } = useTheme();
  const color = focused ? colors.fg : colors.faint;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        layout={LinearTransition.duration(220)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}
      >
        <Icon name={icon} size={22} color={color} strokeWidth={focused ? 2.2 : 1.8} />
        {focused && (
          <Animated.View entering={FadeIn.duration(180).delay(60)} exiting={FadeOut.duration(100)}>
            <Txt style={{ fontSize: 14, fontWeight: '600', color }} numberOfLines={1}>
              {label}
            </Txt>
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { scheme } = useTheme();
  const [barW, setBarW] = useState(0);
  // Frosted-glass pill: accent-tinted translucent fill + bright hairline edge
  // (reference look) — strong enough to read on the near-solid Android bar.
  const pillBg = scheme === 'dark' ? 'rgba(120,170,255,0.22)' : 'rgba(37,99,235,0.12)';
  const pillEdge = scheme === 'dark' ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.95)';

  const count = state.routes.length;
  const cellW = barW ? barW / count : 0;
  const pillW = cellW ? cellW - 14 : 0;
  const x = useSharedValue(0);

  useEffect(() => {
    if (!cellW) return;
    x.value = withSpring(cellW * state.index + (cellW - pillW) / 2, {
      damping: 20,
      stiffness: 180,
      mass: 0.7,
    });
  }, [state.index, cellW, pillW, x]);

  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: H_MARGIN, right: H_MARGIN, bottom: insets.bottom + 16 }}
    >
      <Glass
        radius={BAR_HEIGHT / 2}
        intensity={40}
        style={{
          height: BAR_HEIGHT,
          shadowColor: '#000',
          shadowOpacity: 0.3,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: 14,
        }}
      >
        <View style={{ flex: 1 }} onLayout={(e) => setBarW(e.nativeEvent.layout.width)}>
          {pillW > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[
                {
                  position: 'absolute',
                  top: (BAR_HEIGHT - 2 - PILL_H) / 2,
                  width: pillW,
                  height: PILL_H,
                  borderRadius: PILL_H / 2,
                  backgroundColor: pillBg,
                  borderWidth: 1,
                  borderColor: pillEdge,
                },
                pill,
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
                <Pressable
                  key={route.key}
                  onPress={onPress}
                  accessibilityRole="button"
                  accessibilityState={{ selected: focused }}
                  accessibilityLabel={route.name}
                  style={{ flex: 1 }}
                >
                  <TabCell
                    focused={focused}
                    label={route.name}
                    icon={TAB_ICON[route.name] ?? 'grid'}
                  />
                </Pressable>
              );
            })}
          </View>
        </View>
      </Glass>
    </View>
  );
}
