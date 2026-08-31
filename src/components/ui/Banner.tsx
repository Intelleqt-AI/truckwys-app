import { View, TouchableOpacity } from 'react-native';
import { Icon } from './icons';
import { Txt } from './Text';

export type BannerTone = 'warning' | 'danger';

const TONE_CLASSES: Record<BannerTone, string> = {
  warning: 'border-warning bg-warning-bg',
  danger: 'border-danger bg-danger-bg',
};

const TONE_ICON_COLOR: Record<BannerTone, string> = {
  warning: '#F59E0B',
  danger: '#FF4949',
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
  const content = (
    <View
      className={`flex-row items-start gap-2.5 rounded-xs border p-3 ${TONE_CLASSES[tone]}`}
    >
      <Icon name="alert" size={17} color={TONE_ICON_COLOR[tone]} />
      <Txt className="flex-1 text-sub text-muted">{message}</Txt>
    </View>
  );

  if (!onPress) return content;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      {content}
    </TouchableOpacity>
  );
}
