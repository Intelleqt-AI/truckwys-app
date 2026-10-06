import { type ReactNode } from 'react';
import { View, Platform, type ViewStyle, type StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '@/theme/ThemeProvider';

// True iOS 26 Liquid Glass when the device supports it; graceful fallback to an
// expo-blur frosted surface on iOS < 26, and a near-solid surface on Android
// (where system blur is unreliable). Detected once — cheap, stable per launch.
//
// Loaded through require() in a try/catch rather than imported: expo-glass-effect
// is a 0.1.x preview module and is not guaranteed to exist in Expo Go, where a
// static import — plus the top-level availability call below — throws while the
// module graph is evaluating and takes the whole app down before either fallback
// can run. In a real build the require resolves and behaviour is unchanged.
const glass = (() => {
  if (Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-glass-effect') as typeof import('expo-glass-effect');
  } catch {
    return null;
  }
})();

const LIQUID = !!glass && glass.isLiquidGlassAvailable() && glass.isGlassEffectAPIAvailable();

// `#RRGGBB` surface token → `rgba(r,g,b,a)`. The surface tokens are 6-digit hex.
function withAlpha(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export function Glass({
  children,
  intensity = 30,
  radius = 0,
  interactive = false,
  tint,
  style,
}: {
  children?: ReactNode;
  intensity?: number;
  radius?: number;
  // iOS 26 only: enables the native interactive "iris" press highlight.
  interactive?: boolean;
  // iOS 26 only: tints the glass (used for the active-tab highlight).
  tint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { scheme, colors } = useTheme();

  // iOS 26 Liquid Glass. NOTE: never animate a GlassView's opacity to 0 — it
  // disables rendering; animate scale/translate instead.
  if (LIQUID && glass) {
    const GlassView = glass.GlassView;
    return (
      <GlassView
        glassEffectStyle="regular"
        isInteractive={interactive}
        tintColor={tint}
        colorScheme={scheme}
        style={[{ overflow: 'hidden', borderRadius: radius }, style]}
      >
        {children}
      </GlassView>
    );
  }

  // Android blur is unreliable/transparent on many devices — render a near-solid
  // frosted surface there instead so the bar is always clearly visible.
  if (Platform.OS === 'android') {
    // Card surface at 96%, derived from the token so it can't drift from it.
    const solid = withAlpha(colors.surface, 0.96);
    return (
      <View style={[{ overflow: 'hidden', borderRadius: radius, backgroundColor: solid, borderColor: colors.line, borderWidth: 1 }, style]}>
        {children}
      </View>
    );
  }

  // iOS < 26 — expo-blur frosted surface + translucent theme overlay.
  const overlay = withAlpha(colors.surface, scheme === 'dark' ? 0.6 : 0.65);
  return (
    <BlurView
      tint={scheme === 'dark' ? 'dark' : 'light'}
      intensity={intensity}
      style={[{ overflow: 'hidden', borderRadius: radius, backgroundColor: overlay, borderColor: colors.line, borderWidth: 1 }, style]}
    >
      {children}
    </BlurView>
  );
}
