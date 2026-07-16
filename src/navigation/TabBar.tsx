import { useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/ui/icons';
import { Mono } from '@/components/ui/Text';
import { Glass } from '@/components/ui/Glass';
import { useTheme } from '@/theme/ThemeProvider';

// Floating, rounded, frosted-glass bottom bar — Material-3 style: a single
// active-indicator pill slides behind the selected tab; only the active tab
// shows its label; icons stay a fixed size.
const TAB_ICON: Record<string, IconName> = {
  Home: 'home',
  Bookings: 'file',
  Fleet: 'truck',
  Finance: 'receipt',
};

const H_MARGIN = 20;
const BAR_HEIGHT = 64;
const PILL_W = 56;
const PILL_H = 32;
const PILL_TOP = 8;

function TabLabel({ focused, label, color }: { focused: boolean; label: string; color: string }) {
  const o = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    o.value = withTiming(focused ? 1 : 0, { duration: 200 });
  }, [focused, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View style={style}>
      <Mono style={{ fontSize: 9, letterSpacing: 0.5, textTransform: 'uppercase', color, fontWeight: '700' }}>
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
  const cellW = barW ? barW / count : 0;
  const x = useSharedValue(0);

  useEffect(() => {
    const target = cellW * state.index + (cellW - PILL_W) / 2;
    x.value = withTiming(target, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, [state.index, cellW, x]);

  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: H_MARGIN, right: H_MARGIN, bottom: insets.bottom + 16 }}
    >
      <Glass
        radius={30}
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
          {cellW > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[
                { position: 'absolute', top: PILL_TOP, width: PILL_W, height: PILL_H, borderRadius: PILL_H / 2, backgroundColor: colors.accentDim },
                pill,
              ]}
            />
          )}
          <View style={{ flex: 1, flexDirection: 'row' }}>
            {state.routes.map((route, index) => {
              const focused = state.index === index;
              const color = focused ? colors.accent : colors.faint;
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
                  style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 2, gap: 3 }}
                >
                  <View style={{ height: PILL_H, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={TAB_ICON[route.name] ?? 'grid'} size={22} color={color} strokeWidth={focused ? 2.2 : 1.8} />
                  </View>
                  <View style={{ height: 12, justifyContent: 'center' }}>
                    <TabLabel focused={focused} label={route.name} color={color} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Glass>
    </View>
  );
}
