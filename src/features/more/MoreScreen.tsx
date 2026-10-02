import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View, Alert, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Constants from 'expo-constants';
import { Screen, Group, Card, Avatar, Txt, Mono, Label, Icon, type IconName } from '@/components/ui';
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
    { icon: 'banknote', label: 'Fast Pay (coming soon)', route: 'Capital', allow: canSeeFinanceFeatures },
  ],
  [
    { icon: 'clock', label: 'Activity', route: 'Activity' },
    { icon: 'shield', label: 'Insurance', route: 'Insurance', allow: canSeeInsights },
    { icon: 'sparkle', label: 'Copilot', route: 'Copilot', allow: canSeeInsights },
  ],
  [
    { icon: 'settings', label: 'Settings', route: 'Settings', allow: canAccessSettings },
    { icon: 'shield', label: 'Support', route: 'Support' },
  ],
];

export function MoreScreen() {
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const { nav } = useAppNavigation();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const role = useRole();
  const [signingOut, setSigningOut] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

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

  const handleSignOut = async () => {
    if (signingOut) return; // guard a double tap
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      // signOut flips status to 'guest', which unmounts this screen — only
      // reset if we're somehow still mounted (i.e. signOut threw).
      if (mountedRef.current) setSigningOut(false);
    }
  };

  const confirmLogout = () =>
    Alert.alert('Sign out', 'Sign out of Truckwys on this device?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void handleSignOut() },
    ]);

  return (
    <Screen topInset={false} contentClassName="pt-3">
      {/* Profile header */}
      <Card className="mb-5 flex-row items-center gap-3 p-4">
        <Avatar
          name={user?.name ?? user?.email}
          uri={mediaUrl(user?.avatar as string | undefined)}
          size={48}
        />
        <View className="flex-1">
          <Txt className="text-heading font-semibold" numberOfLines={1}>
            {user?.name ?? user?.email ?? 'Operator'}
          </Txt>
          <Mono className="mt-0.5 text-caption text-muted" numberOfLines={1}>
            {user?.email}
          </Mono>
        </View>
        {user?.role && <Label className="text-muted">{user.role}</Label>}
      </Card>

      {visibleSections.map((group, gi) => (
        <Group key={gi}>
          {group.map((item, i) => (
            <TouchableOpacity
              key={item.label}
              onPress={() => go(item.route)}
              disabled={signingOut}
              activeOpacity={0.7}
              accessibilityRole="button"
              className={`min-h-[52px] flex-row items-center gap-3 px-4 py-3 ${
                signingOut ? 'opacity-50' : ''
              } ${i === group.length - 1 ? '' : 'border-b border-line-row'}`}
            >
              <Icon name={item.icon} size={19} color={colors.muted} />
              <Txt className="flex-1 text-body text-fg">{item.label}</Txt>
              <Icon name="chevronRight" size={16} color={colors.faint} />
            </TouchableOpacity>
          ))}
        </Group>
      ))}

      {/* Dev-only shortcut to preview the first-run onboarding wizard without
          needing a fresh admin/company that hasn't finished it yet — stripped
          from release builds since __DEV__ is a compile-time constant. */}
      {__DEV__ && (
        <Group>
          <TouchableOpacity
            onPress={() => nav.navigate('Onboarding' as never)}
            disabled={signingOut}
            activeOpacity={0.7}
            accessibilityRole="button"
            className={`min-h-[52px] flex-row items-center gap-3 px-4 py-3 ${
              signingOut ? 'opacity-50' : ''
            }`}
          >
            <Icon name="sparkle" size={19} color={colors.muted} />
            <Txt className="flex-1 text-body text-fg">Preview onboarding</Txt>
            <Mono className="text-caption text-faint">Dev</Mono>
            <Icon name="chevronRight" size={16} color={colors.faint} />
          </TouchableOpacity>
        </Group>
      )}

      <Group>
        <TouchableOpacity
          onPress={confirmLogout}
          disabled={signingOut}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ disabled: signingOut, busy: signingOut }}
          className={`min-h-[52px] flex-row items-center gap-3 px-4 py-3 ${
            signingOut ? 'opacity-50' : ''
          }`}
        >
          <View className="w-[19px] items-center">
            {signingOut ? (
              <ActivityIndicator size="small" color={colors.dangerDot} />
            ) : (
              <Icon name="logout" size={19} color={colors.dangerDot} />
            )}
          </View>
          <Txt className="flex-1 text-body text-danger">
            {signingOut ? 'Signing out…' : 'Sign out'}
          </Txt>
        </TouchableOpacity>
      </Group>

      <Mono className="mt-2 text-center text-caption text-faint">Truckwys · v{version}</Mono>
    </Screen>
  );
}
