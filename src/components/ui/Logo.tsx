import { Image } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

// The Truckwys wordmark. The source PNG is black on transparent; it is tinted to
// the primary text colour in both themes (the web inverts the same mark in dark).
const WORDMARK = require('../../../assets/brand/wordmark.png');
const RATIO = 3707 / 725;

export function Logo({ width = 150 }: { width?: number }) {
  const { colors } = useTheme();
  return (
    <Image
      source={WORDMARK}
      resizeMode="contain"
      style={{ width, height: width / RATIO }}
      tintColor={colors.fg}
      accessibilityLabel="Truckwys"
    />
  );
}
