import { useEffect, useState } from 'react';
import { View, Pressable, Platform } from 'react-native';
import Animated, {
  useAnimatedStyle,
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

// Floating frosted-glass tab bar. One shared indicator pill SLIDES between
// fixed-width cells (spring); every tab keeps its label.
const TAB_ICON: Record<string, IconName> = {
  Home: 'home',
  Bookings: 'file',
  Fleet: 'truck',
  Finance: 'receipt',
};

const H_MARGIN = 16;
const BAR_HEIGHT = 68;
const IND_W = 86;
const IND_H = 60;

function Destination({
  focused,
  label,
  icon,
}: {
  focused: boolean;
  label: string;
  icon: IconName;
}) {
  const { colors } = useTheme();
  const iconColor = focused ? colors.accent : colors.muted;
  const labelColor = focused ? colors.fg : colors.faint;

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 1 }}>
      <View style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={22} color={iconColor} strokeWidth={focused ? 2.2 : 1.8} />
      </View>
      <Mono
        style={{
          fontSize: 9.5,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: labelColor,
          fontWeight: focused ? '700' : '500',
        }}
      >
        {label}
      </Mono>
    </View>
  );
}

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { scheme } = useTheme();
  const [innerW, setInnerW] = useState(0);

  // Accent-alpha fill reads clearly on both themes (accentDim is ~white in light).
  const indicatorBg = scheme === 'dark' ? 'rgba(77,158,255,0.22)' : 'rgba(37,99,235,0.14)';

  const count = state.routes.length;
  const cellW = innerW ? innerW / count : 0;
  const x = useSharedValue(0);

  useEffect(() => {
    if (!cellW) return;
    x.value = withSpring(cellW * state.index + (cellW - IND_W) / 2, {
      damping: 20,
      stiffness: 190,
      mass: 0.7,
    });
  }, [state.index, cellW, x]);

  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: H_MARGIN, right: H_MARGIN, bottom: insets.bottom + 14 }}
    >
      <Glass
        radius={BAR_HEIGHT / 3}
        intensity={45}
        style={{
          height: BAR_HEIGHT,
          shadowColor: '#000',
          shadowOpacity: 0.3,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: 14,
        }}
      >
        <View
          style={{ flex: 1, paddingHorizontal: 2 }}
          onLayout={(e) => setInnerW(e.nativeEvent.layout.width - 4)}
        >
          {cellW > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[
                {
                  position: 'absolute',
                  left: 2,
                  top: (BAR_HEIGHT - 2 - IND_H) / 2,
                  width: IND_W,
                  height: IND_H,
                  borderRadius: IND_H / 3,
                  backgroundColor: indicatorBg,
                },
                slide,
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
                  <Destination
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
