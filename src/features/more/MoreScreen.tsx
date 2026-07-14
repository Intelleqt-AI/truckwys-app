import { View, Alert, Pressable } from 'react-native';
import {
  Screen,
  AppHeader,
  Group,
  Avatar,
  Txt,
  Mono,
  Label,
  Icon,
  type IconName,
} from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { useTheme } from '@/theme/ThemeProvider';

const SECTIONS: { icon: IconName; label: string; route: string; danger?: boolean }[][] = [
  [
    { icon: 'users', label: 'Customers', route: 'Customers' },
    { icon: 'sparkle', label: 'Insights', route: 'Insights' },
    { icon: 'dollar', label: 'Fast Pay Capital', route: 'Capital' },
  ],
  [
    { icon: 'bell', label: 'Notifications', route: 'Notifications' },
    { icon: 'clock', label: 'Activity', route: 'Activity' },
    { icon: 'sparkle', label: 'AI Copilot', route: 'Copilot' },
  ],
  [
    { icon: 'settings', label: 'Settings', route: 'Settings' },
    { icon: 'shield', label: 'Support', route: 'Support' },
  ],
];

export function MoreScreen() {
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const { nav } = useAppNavigation();
  const { colors } = useTheme();

  const go = (route: string) => {
    if (route === 'Support') {
      nav.navigate('Stub', { title: 'Support', body: 'Reach the Truckwys team at support@truckwys.co.za.' });
    } else {
      nav.navigate(route as never);
    }
  };

  const confirmLogout = () =>
    Alert.alert('Sign out', 'Sign out of Truckwys on this device?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);

  return (
    <Screen>
      <AppHeader eyebrow="Account" title="More" />

      {/* Profile header */}
      <View className="mb-5 flex-row items-center gap-3 rounded-xs border border-line bg-surface p-4">
        <Avatar name={user?.name ?? user?.email} size={48} />
        <View className="flex-1">
          <Txt className="text-heading font-semibold text-fg">{user?.name ?? user?.email ?? 'Operator'}</Txt>
          <Mono className="mt-0.5 text-caption text-muted">{user?.email}</Mono>
        </View>
        {user?.role && <Label className="text-accent">{user.role}</Label>}
      </View>

      {SECTIONS.map((group, gi) => (
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
