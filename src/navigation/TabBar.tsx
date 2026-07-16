import { View, Pressable } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/ui/icons';
import { Mono } from '@/components/ui/Text';
import { Glass } from '@/components/ui/Glass';
import { useTheme } from '@/theme/ThemeProvider';

// Floating pill bottom bar (Material-3 / "expressive"): the active tab is a
// filled rounded pill with icon + label inline; inactive tabs are icon-only.
// Widths morph smoothly via Reanimated layout animations.
const TAB_ICON: Record<string, IconName> = {
  Home: 'home',
  Bookings: 'file',
  Fleet: 'truck',
  Finance: 'receipt',
};

const H_MARGIN = 20;
const BAR_HEIGHT = 58;

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

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
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 8 }}>
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
                hitSlop={6}
              >
                <Animated.View
                  layout={LinearTransition.duration(240)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 7,
                    height: 40,
                    paddingHorizontal: focused ? 16 : 12,
                    borderRadius: 20,
                    backgroundColor: focused ? colors.accentDim : 'transparent',
                  }}
                >
                  <Icon name={TAB_ICON[route.name] ?? 'grid'} size={21} color={color} strokeWidth={focused ? 2.3 : 1.9} />
                  {focused && (
                    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
                      <Mono style={{ fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', color, fontWeight: '700' }}>
                        {route.name}
                      </Mono>
                    </Animated.View>
                  )}
                </Animated.View>
              </Pressable>
            );
          })}
        </View>
      </Glass>
    </View>
  );
}
