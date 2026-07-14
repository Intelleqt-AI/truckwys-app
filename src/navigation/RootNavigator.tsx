import { useEffect } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme, type Theme } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import { AuthStack } from './AuthStack';
import { AppNavigator } from './AppNavigator';
import { useAuthStore, forceSignOut } from '@/stores/authStore';
import { setUnauthorizedHandler } from '@/lib/api/client';
import { useTheme } from '@/theme/ThemeProvider';

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

export function RootNavigator() {
  const status = useAuthStore((s) => s.status);
  const hydrate = useAuthStore((s) => s.hydrate);
  const navTheme = useNavTheme();

  useEffect(() => {
    setUnauthorizedHandler(forceSignOut);
    void hydrate();
    return () => setUnauthorizedHandler(null);
  }, [hydrate]);

  useEffect(() => {
    if (status !== 'loading') void SplashScreen.hideAsync();
  }, [status]);

  if (status === 'loading') return null; // splash stays visible

  return (
    <NavigationContainer theme={navTheme}>
      {status === 'authed' ? <AppNavigator /> : <AuthStack />}
    </NavigationContainer>
  );
}
