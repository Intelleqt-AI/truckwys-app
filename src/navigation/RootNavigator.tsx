import { useEffect } from 'react';
import { View } from 'react-native';
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
  type Theme,
  type LinkingOptions,
} from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import { AuthStack } from './AuthStack';
import { AppNavigator } from './AppNavigator';
import { useAuthStore, forceSignOut } from '@/stores/authStore';
import { setUnauthorizedHandler } from '@/lib/api/client';
import { useTheme } from '@/theme/ThemeProvider';
import { WEB_APP_URL } from '@/lib/legal';
import { useAuthHandoff } from '@/features/auth/useAuthHandoff';
import { SigningInOverlay } from '@/components/ui';
import type { AppStackParamList } from './types';

// Build a React Navigation theme from our tokens so native transitions/backgrounds
// match the deep canvas (no white flash between screens).
function useNavTheme(): Theme {
  const { scheme, colors } = useTheme();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      background: colors.bgDeep,
      card: colors.surface,
      text: colors.fg,
      border: colors.line,
      primary: colors.accent,
      notification: colors.accent,
    },
  };
}

// Deep links, e.g. truckwys://bookings/12 from an email or a shared link. The
// scheme has always been declared in app.config.ts but was never wired up.
// Notification taps do NOT come through here — they carry a `link` in the FCM
// payload and are routed by usePushNotifications.
const linking: LinkingOptions<AppStackParamList> = {
  // The https prefix needs an apple-app-site-association file hosted on that
  // domain plus the associatedDomains entitlement before iOS honours it; until
  // then only the truckwys:// scheme resolves. Harmless either way.
  prefixes: ['truckwys://', `${WEB_APP_URL}`],
  config: {
    screens: {
      LoadDetail: 'bookings/:id',
      QuoteDetail: 'quotes/:id',
      InvoiceDetail: 'finance/invoices/:id',
      CustomerDetail: 'customers/:id',
      Notifications: 'notifications',
      Capital: 'capital',
      Insights: 'insights',
      Copilot: 'copilot',
    },
  },
};

export function RootNavigator() {
  const status = useAuthStore((s) => s.status);
  const hydrate = useAuthStore((s) => s.hydrate);
  const navTheme = useNavTheme();

  useEffect(() => {
    setUnauthorizedHandler(forceSignOut);
    void hydrate();
    return () => setUnauthorizedHandler(null);
  }, [hydrate]);

  // Listens for a web -> app auth handoff link (truckwys://auth/callback) and
  // signs the user in when one arrives. Must run before the loading gate below
  // and regardless of authed/guest status — see useAuthHandoff for why this
  // can't just go through the `linking` config underneath. `pending` drives
  // the brief "Signing you in…" overlay below, covering the gap where status
  // has already settled to 'guest' (so Login renders) but the code exchange
  // is still in flight — without it that gap looks like nothing is happening.
  const { pending: handoffPending } = useAuthHandoff();

  useEffect(() => {
    if (status !== 'loading') void SplashScreen.hideAsync();
  }, [status]);

  if (status === 'loading') return null; // splash stays visible

  return (
    // Wrapping View (not a bare fragment) so SigningInOverlay's `absolute
    // inset-0` has a same-size, non-scrolling ancestor to fill — same
    // requirement SaveSuccessOverlay documents for itself.
    <View style={{ flex: 1 }}>
      {/* Deep links only resolve against the authed stack; a link arriving
          while signed out lands on Login and is dropped, which is correct. */}
      <NavigationContainer theme={navTheme} linking={status === 'authed' ? linking : undefined}>
        {status === 'authed' ? <AppNavigator /> : <AuthStack />}
      </NavigationContainer>
      {/* status !== 'authed' guard is defense in depth: setSession and
          setPending(false) land in the same tick on success, but this keeps
          a stuck overlay impossible even if that ever changed. */}
      <SigningInOverlay visible={handoffPending && status !== 'authed'} />
    </View>
  );
}
