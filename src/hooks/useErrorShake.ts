import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

// ── useErrorShake: one motion cue for "this didn't go through" ─────────────
// A rejected submit (validation or API) shakes the field stack and fires an
// error haptic. Originally written for the auth stack (LoginScreen,
// ResetPasswordScreen, ForgotPasswordScreen, VerifyOtpScreen); lifted out to
// `src/hooks` so the Fleet forms can reuse it without importing from
// `features/auth`. `authComponents.tsx` re-exports this so those four
// existing imports keep working unchanged.
export function useErrorShake() {
  const shakeX = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));

  const trigger = () => {
    shakeX.value = withSequence(
      withTiming(-6, { duration: 45 }),
      withTiming(6, { duration: 90 }),
      withTiming(-4, { duration: 90 }),
      withTiming(0, { duration: 60 }),
    );
    if (Platform.OS !== 'web')
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

  return { shakeStyle, trigger };
}
