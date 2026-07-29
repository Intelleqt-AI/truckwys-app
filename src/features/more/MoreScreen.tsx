import { useLayoutEffect } from 'react';
import { View, Alert, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  Screen,
  Group,
  Avatar,
  Txt,
  Mono,
  Label,
  Icon,
  type IconName,
} from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useRole, canSeeInsights, canSeeFinanceFeatures, canAccessSettings } from '@/lib/access';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { mediaUrl } from '@/lib/api/client';
import { useTheme } from '@/theme/ThemeProvider';

type MenuItem = {
  icon: IconName;
  label: string;
  route: string;
  /** Roles allowed to see this item; omitted means everyone. */
  allow?: (role: string) => boolean;
};

const SECTIONS: MenuItem[][] = [
  [
    { icon: 'users', label: 'Customers', route: 'Customers', allow: canSeeInsights },
    { icon: 'sparkle', label: 'Insights', route: 'Insights', allow: canSeeInsights },
    { icon: 'dollar', label: 'Fast Pay Capital', route: 'Capital', allow: canSeeFinanceFeatures },
  ],
  [
    { icon: 'bell', label: 'Notifications', route: 'Notifications' },
    { icon: 'clock', label: 'Activity', route: 'Activity' },
    { icon: 'sparkle', label: 'AI Copilot', route: 'Copilot', allow: canSeeInsights },
  ],
  [
    { icon: 'settings', label: 'Settings', route: 'Settings', allow: canAccessSettings },
    { icon: 'shield', label: 'Support', route: 'Support' },
  ],
];

export function MoreScreen() {
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const { nav } = useAppNavigation();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const role = useRole();

  // Drop items this role can't reach, then any group left empty.
  const visibleSections = SECTIONS.map((group) =>
    group.filter((item) => !item.allow || item.allow(role)),
  ).filter((group) => group.length > 0);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'More',
      headerLargeTitle: false,
      headerTransparent: false,
      headerStyle: { backgroundColor: colors.bgDeep },
    });
  }, [navigation, colors.bgDeep]);

  const go = (route: string) => nav.navigate(route as never);

  const confirmLogout = () =>
    Alert.alert('Sign out', 'Sign out of Truckwys on this device?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);

  return (
    <Screen topInset={false} contentClassName="pt-3">
      {/* Profile header */}
      <View className="mb-5 flex-row items-center gap-3 rounded-xs border border-line bg-surface p-4">
        <Avatar name={user?.name ?? user?.email} uri={mediaUrl(user?.avatar as string | undefined)} size={48} />
        <View className="flex-1">
          <Txt className="text-heading font-semibold text-fg">{user?.name ?? user?.email ?? 'Operator'}</Txt>
          <Mono className="mt-0.5 text-caption text-muted">{user?.email}</Mono>
        </View>
        {user?.role && <Label className="text-accent">{user.role}</Label>}
      </View>

      {visibleSections.map((group, gi) => (
        <Group key={gi}>
          {group.map((item, i) => (
            <Pressable
              key={item.label}
              onPress={() => go(item.route)}
              className={`min-h-[52px] flex-row items-center gap-3 px-4 py-3 active:bg-surface-hover ${
                i === group.length - 1 ? '' : 'border-b border-line-row'
              }`}
            >
              <Icon name={item.icon} size={19} color={colors.muted} />
              <Txt className="flex-1 text-body text-fg">{item.label}</Txt>
              <Icon name="chevronRight" size={16} color={colors.faint} />
            </Pressable>
          ))}
        </Group>
      ))}

      <Group>
        <Pressable
          onPress={confirmLogout}
          className="min-h-[52px] flex-row items-center gap-3 px-4 py-3 active:bg-surface-hover"
        >
          <Icon name="logout" size={19} color="#FF4949" />
          <Txt className="flex-1 text-body text-danger">Sign out</Txt>
        </Pressable>
      </Group>

      <Mono className="mt-2 text-center text-micro text-faint">Truckwys · v1.0.0</Mono>
    </Screen>
  );
}
