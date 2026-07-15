import { View, Pressable } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/ui/icons';
import { Mono } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { useUnreadCount } from '@/features/more/api';

// Bottom tab bar (design: hairline top, 5 items, icon + tracked mono caps label,
// accent when active). 44px+ targets.
const TAB_ICON: Record<string, IconName> = {
  Home: 'home',
  Bookings: 'file',
  Fleet: 'truck',
  Finance: 'receipt',
  More: 'grid',
};

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { data: unread } = useUnreadCount();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingTop: 8,
        paddingBottom: insets.bottom + 6,
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.line,
      }}
    >
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
            style={{ alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 10, minWidth: 56 }}
          >
            <View>
              <Icon name={TAB_ICON[route.name] ?? 'grid'} size={23} color={color} strokeWidth={focused ? 2 : 1.7} />
              {route.name === 'More' && !!unread && unread > 0 && (
                <View
                  style={{
                    position: 'absolute',
                    top: -3,
                    right: -6,
                    minWidth: 15,
                    height: 15,
                    borderRadius: 8,
                    paddingHorizontal: 3,
                    backgroundColor: '#FF4949',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Mono style={{ fontSize: 9, color: '#fff', fontWeight: '700' }}>
                    {unread > 9 ? '9+' : unread}
                  </Mono>
                </View>
              )}
            </View>
            <Mono
              style={{
                fontSize: 9,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                color,
                fontWeight: focused ? '600' : '400',
              }}
            >
              {route.name}
            </Mono>
          </Pressable>
        );
      })}
    </View>
  );
}
