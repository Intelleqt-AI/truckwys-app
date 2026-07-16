import { useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/ui/icons';
import { Mono } from '@/components/ui/Text';
import { Glass } from '@/components/ui/Glass';
import { useTheme } from '@/theme/ThemeProvider';
import { useUnreadCount } from '@/features/more/api';

// Floating, rounded, frosted-glass bottom bar with an animated highlight pill
// that slides to the active tab. Lifts ~20px off the bottom.
const TAB_ICON: Record<string, IconName> = {
  Home: 'home',
  Bookings: 'file',
  Fleet: 'truck',
  Finance: 'receipt',
  More: 'grid',
};

const H_MARGIN = 16;
const BAR_HEIGHT = 62;
const PILL_INSET = 8;

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { data: unread } = useUnreadCount();
  const [barW, setBarW] = useState(0);

  const count = state.routes.length;
  const tabW = barW ? barW / count : 0;
  const x = useSharedValue(0);

  useEffect(() => {
    x.value = withTiming(state.index * tabW, { duration: 220, easing: Easing.out(Easing.cubic) });
  }, [state.index, tabW, x]);

  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: H_MARGIN, right: H_MARGIN, bottom: insets.bottom + 20 }}
    >
      <Glass
        radius={28}
        intensity={40}
        style={{
          height: BAR_HEIGHT,
          shadowColor: '#000',
          shadowOpacity: 0.3,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 12,
        }}
      >
        <View style={{ flex: 1 }} onLayout={(e) => setBarW(e.nativeEvent.layout.width)}>
          {/* Animated highlight pill */}
          {tabW > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[
                {
                  position: 'absolute',
                  top: PILL_INSET,
                  bottom: PILL_INSET,
                  left: PILL_INSET / 2,
                  width: tabW - PILL_INSET,
                  borderRadius: 20,
                  backgroundColor: colors.accentDim,
                },
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
                  style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 }}
                >
                  <View>
                    <Icon name={TAB_ICON[route.name] ?? 'grid'} size={22} color={color} strokeWidth={focused ? 2.2 : 1.7} />
                    {route.name === 'More' && !!unread && unread > 0 && (
                      <View
                        style={{
                          position: 'absolute',
                          top: -4,
                          right: -7,
                          minWidth: 15,
                          height: 15,
                          borderRadius: 8,
                          paddingHorizontal: 3,
                          backgroundColor: '#FF4949',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Mono style={{ fontSize: 9, color: '#fff', fontWeight: '700' }}>{unread > 9 ? '9+' : unread}</Mono>
                      </View>
                    )}
                  </View>
                  <Mono style={{ fontSize: 9, letterSpacing: 0.5, textTransform: 'uppercase', color, fontWeight: focused ? '600' : '400' }}>
                    {route.name}
                  </Mono>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Glass>
    </View>
  );
}
