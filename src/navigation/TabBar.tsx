import { useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/ui/icons';
import { Mono } from '@/components/ui/Text';
import { Glass } from '@/components/ui/Glass';
import { useTheme } from '@/theme/ThemeProvider';

// Floating, rounded, frosted-glass bottom bar. A highlight pill slides smoothly
// to the active tab; the active tab's icon+label scale up.
const TAB_ICON: Record<string, IconName> = {
  Home: 'home',
  Bookings: 'file',
  Fleet: 'truck',
  Finance: 'receipt',
};

const H_MARGIN = 20;
const BAR_HEIGHT = 66;
const PILL_INSET = 7;

function TabItem({ focused, label, icon }: { focused: boolean; label: string; icon: IconName }) {
  const { colors } = useTheme();
  const s = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    s.value = withTiming(focused ? 1 : 0, { duration: 220, easing: Easing.out(Easing.cubic) });
  }, [focused, s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 + s.value * 0.14 }, { translateY: -s.value * 1 }] }));
  const color = focused ? colors.accent : colors.faint;
  return (
    <Animated.View style={[{ alignItems: 'center', justifyContent: 'center', gap: 3 }, style]}>
      <Icon name={icon} size={22} color={color} strokeWidth={focused ? 2.3 : 1.7} />
      <Mono style={{ fontSize: 9, letterSpacing: 0.5, textTransform: 'uppercase', color, fontWeight: focused ? '700' : '400' }}>
        {label}
      </Mono>
    </Animated.View>
  );
}

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [barW, setBarW] = useState(0);

  const count = state.routes.length;
  const tabW = barW ? barW / count : 0;
  const x = useSharedValue(0);

  useEffect(() => {
    x.value = withTiming(state.index * tabW, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, [state.index, tabW, x]);

  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: H_MARGIN, right: H_MARGIN, bottom: insets.bottom + 18 }}
    >
      <Glass
        radius={16}
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
          {tabW > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[
                {
                  position: 'absolute',
                  top: PILL_INSET,
                  bottom: PILL_INSET,
                  left: PILL_INSET,
                  width: tabW - PILL_INSET * 2,
                  borderRadius: 14,
                  backgroundColor: colors.accentDim,
                },
                pill,
              ]}
            />
          )}
          <View style={{ flex: 1, flexDirection: 'row' }}>
            {state.routes.map((route, index) => {
              const focused = state.index === index;
              const onPress = () => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
              };
              return (
                <Pressable
                  key={route.key}
                  onPress={onPress}
                  accessibilityRole="button"
                  accessibilityState={{ selected: focused }}
                  accessibilityLabel={route.name}
                  style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                >
                  <TabItem focused={focused} label={route.name} icon={TAB_ICON[route.name] ?? 'grid'} />
                </Pressable>
              );
            })}
          </View>
        </View>
      </Glass>
    </View>
  );
}
