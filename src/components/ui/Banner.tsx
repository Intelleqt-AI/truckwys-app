import { View, TouchableOpacity } from 'react-native';
import { Icon } from './icons';
import { Txt } from './Text';
import { useTheme } from '@/theme/ThemeProvider';

export type BannerTone = 'warning' | 'danger';

// v3: a banner is the one place a tinted status fill is allowed; the mark that
// carries the state is the icon, drawn in the tone's dot colour.
const TONE_CLASSES: Record<BannerTone, string> = {
  warning: 'border-line-active bg-warning-bg',
  danger: 'border-line-active bg-danger-bg',
};

/**
 * Inline alert banner — lifted verbatim from the hand-rolled subscription
 * notices in SettingsScreen/CreateQuoteScreen/QuoteDetailScreen/
 * InvoiceDetailScreen (identical markup, repeated 9 times) so new call sites
 * (the header pill's Home banner) don't add a 10th copy.
 */
export function Banner({
  tone,
  message,
  onPress,
}: {
  tone: BannerTone;
  message: string;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const content = (
    <View
      className={`flex-row items-start gap-2.5 rounded-control border p-3 ${TONE_CLASSES[tone]}`}
    >
      <Icon name="alert" size={17} color={tone === 'warning' ? colors.warningDot : colors.dangerDot} />
      <Txt className="flex-1 text-sub text-fg">{message}</Txt>
    </View>
  );

  if (!onPress) return content;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      {content}
    </TouchableOpacity>
  );
}
