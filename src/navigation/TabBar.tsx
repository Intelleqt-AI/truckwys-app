import { useEffect } from 'react';
import { View, Pressable, Platform } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/ui/icons';
import { Mono } from '@/components/ui/Text';
import { Glass } from '@/components/ui/Glass';
import { useTheme } from '@/theme/ThemeProvider';

// Material 3 navigation bar, in Truckwys tokens.
// Docked full-width surface with a hairline top edge; every destination keeps
// its label; the active icon gets a pill indicator that expands in place
// (M3 motion — no sliding element, so nothing can misalign or reflow).
const TAB_ICON: Record<string, IconName> = {
  Home: 'home',
  Bookings: 'file',
  Fleet: 'truck',
  Finance: 'receipt',
};

const CONTENT_H = 62;
const IND_W = 56;
const IND_H = 30;

// M3 "emphasized decelerate" easing.
const EASE = Easing.bezier(0.05, 0.7, 0.1, 1);

function Destination({
  focused,
  label,
  icon,
}: {
  focused: boolean;
  label: string;
  icon: IconName;
}) {
  const { scheme, colors } = useTheme();
  const t = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    t.value = withTiming(focused ? 1 : 0, { duration: 260, easing: EASE });
  }, [focused, t]);

  // Indicator expands horizontally from the centre and fades in.
  const indicator = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ scaleX: 0.4 + t.value * 0.6 }],
  }));

  // Accent-alpha fill reads clearly on both themes (accentDim is ~white in light).
  const indicatorBg = scheme === 'dark' ? 'rgba(77,158,255,0.22)' : 'rgba(37,99,235,0.14)';
  const iconColor = focused ? colors.accent : colors.muted;
  const labelColor = focused ? colors.fg : colors.faint;

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5 }}>
      <View style={{ width: IND_W, height: IND_H, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              width: IND_W,
              height: IND_H,
              borderRadius: IND_H / 2,
              backgroundColor: indicatorBg,
            },
            indicator,
          ]}
        />
        <Icon name={icon} size={22} color={iconColor} strokeWidth={focused ? 2.2 : 1.8} />
      </View>
      <Mono
        style={{
          fontSize: 10,
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

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
      <Glass
        intensity={50}
        radius={0}
        style={{
          borderLeftWidth: 0,
          borderRightWidth: 0,
          borderBottomWidth: 0,
          // Breathing room even on devices with no gesture inset.
          paddingBottom: Math.max(insets.bottom, 10),
          paddingTop: 6,
        }}
      >
        <View style={{ height: CONTENT_H, flexDirection: 'row' }}>
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
                style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.75 : 1 })}
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
      </Glass>
    </View>
  );
}
