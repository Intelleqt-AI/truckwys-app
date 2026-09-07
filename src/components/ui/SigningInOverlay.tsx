import { View, ActivityIndicator } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Txt } from './Text';
import { useTheme } from '@/theme/ThemeProvider';

export interface SigningInOverlayProps {
  visible: boolean;
}

/**
 * Brief full-screen cover shown while a web -> app auth handoff link (see
 * useAuthHandoff) is being exchanged for a session. Without this, opening the
 * app via that link renders Login for however long the network round-trip
 * takes, with no visible sign anything is happening — this fills that gap the
 * same way SaveSuccessOverlay fills the "did my save land" gap.
 *
 * Rendered as a SIBLING of NavigationContainer in RootNavigator, not inside
 * AuthStack/LoginScreen — this is app-shell feedback for the handoff itself,
 * not a Login screen change, so LoginScreen.tsx stays untouched.
 */
export function SigningInOverlay({ visible }: SigningInOverlayProps) {
  const { colors } = useTheme();
  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(150)}
      pointerEvents="auto"
      className="absolute inset-0 items-center justify-center bg-black/70 px-8"
    >
      <View className="w-full max-w-[280px] items-center rounded-sm border border-line bg-surface px-6 py-7">
        <ActivityIndicator color={colors.accent} size="large" />
        <Txt className="mt-4 text-center text-heading font-semibold text-fg">Signing you in…</Txt>
      </View>
    </Animated.View>
  );
}
