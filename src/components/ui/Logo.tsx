import { Image } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

// The Truckwys wordmark. The source PNG is black on transparent; on the dark
// canvas it is tinted to the primary text colour (white), on light left as-is.
const WORDMARK = require('../../../assets/brand/wordmark.png');
const RATIO = 3707 / 725;

export function Logo({ width = 150 }: { width?: number }) {
  const { scheme, colors } = useTheme();
  return (
    <Image
      source={WORDMARK}
      resizeMode="contain"
      style={{ width, height: width / RATIO }}
      tintColor={scheme === 'dark' ? colors.fg : '#111827'}
      accessibilityLabel="Truckwys"
    />
  );
}
