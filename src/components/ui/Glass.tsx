import { type ReactNode } from 'react';
import { View, Platform, type ViewStyle, type StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '@/theme/ThemeProvider';

// Frosted-glass surface. BlurView + a translucent theme overlay for contrast +
// hairline border. Degrades gracefully on Android (dimezis blur / overlay).
export function Glass({
  children,
  intensity = 30,
  radius = 0,
  style,
}: {
  children?: ReactNode;
  intensity?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { scheme, colors } = useTheme();

  // Android blur is unreliable/transparent on many devices — render a near-solid
  // frosted surface there instead so the bar is always clearly visible.
  if (Platform.OS === 'android') {
    const solid = scheme === 'dark' ? 'rgba(16,16,16,0.96)' : 'rgba(255,255,255,0.96)';
    return (
      <View style={[{ overflow: 'hidden', borderRadius: radius, backgroundColor: solid, borderColor: colors.line, borderWidth: 1 }, style]}>
        {children}
      </View>
    );
  }

  const overlay = scheme === 'dark' ? 'rgba(10,10,10,0.6)' : 'rgba(255,255,255,0.65)';
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

// Non-blur fallback surface (used where BlurView can't be a container).
export function GlassSolid({ children, radius = 0, style }: { children?: ReactNode; radius?: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View style={[{ borderRadius: radius, backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, overflow: 'hidden' }, style]}>
      {children}
    </View>
  );
}
