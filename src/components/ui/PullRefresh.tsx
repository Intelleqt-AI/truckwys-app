import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { Mono } from './Text';

// Branded refresh indicator shown while a pull-to-refresh is in flight. The
// native RefreshControl spinner is suppressed (transparent) so only this shows —
// works identically on iOS and Android.
export function RefreshSpinner({ visible }: { visible: boolean }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const rot = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      rot.value = withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1, false);
    } else {
      cancelAnimation(rot);
      rot.value = 0;
    }
    return () => cancelAnimation(rot);
  }, [visible, rot]);

  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));

  if (!visible) return null;
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: insets.top + 6, left: 0, right: 0, alignItems: 'center', zIndex: 20 }}
    >
      <View
        className="flex-row items-center gap-2 rounded-pill border border-line bg-elevated px-3 py-1.5"
        style={{ shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 }}
      >
        <Animated.View
          style={[
            { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.line, borderTopColor: colors.accent },
            spin,
          ]}
        />
        <Mono className="text-micro tracking-wide uppercase text-muted">Refreshing</Mono>
      </View>
    </View>
  );
}
