import { useEffect } from 'react';
import { View } from 'react-native';
import { Button, Icon, Txt, Mono } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';
import { status as statusHues } from '@/theme/tokens';

export interface QuoteSentOverlayProps {
  visible: boolean;
  kind: 'draft' | 'send';
  total: number;
  clientName: string;
  /** Only meaningful for kind === 'send' — sendQuote()'s response. */
  emailSent: boolean;
  onViewQuote: () => void;
  onDone: () => void;
}

/**
 * Visible save/send confirmation (Phase 4) — sits over the whole screen,
 * same tree position as CrosshairOverlay and for the same documented reason
 * (the sheet's footer would otherwise steal its taps, even while the sheet
 * is faded to opacity 0). `toast.success` is haptic-only by app-wide policy
 * (src/lib/toast.tsx) — that stays; this adds the missing visual for the one
 * action on this screen that's actually a money event.
 */
export function QuoteSentOverlay({
  visible,
  kind,
  total,
  clientName,
  emailSent,
  onViewQuote,
  onDone,
}: QuoteSentOverlayProps) {
  // Draft-saving is routine — auto-dismiss. Sending emails a client; that's
  // a money event a human should close themselves, so it waits. Either
  // button tap changes `visible`/unmounts this, which clears the timer.
  useEffect(() => {
    if (!visible || kind !== 'draft') return;
    const t = setTimeout(onDone, 4000);
    return () => clearTimeout(t);
  }, [visible, kind, onDone]);

  if (!visible) return null;

  const title = kind === 'draft' ? 'Draft saved' : emailSent ? 'Quote sent' : 'Quote saved';
  const subtitle =
    kind === 'draft'
      ? 'Finish it any time from Bookings → Quotes'
      : emailSent
        ? `Emailed to ${clientName}`
        : "Email pending — we'll retry";

  return (
    <View
      className="absolute inset-0 items-center justify-center bg-black/70 px-8"
      accessibilityViewIsModal
    >
      <View className="w-full max-w-[300px] items-center rounded-sm border border-line bg-surface px-6 py-8">
        <View className="h-12 w-12 items-center justify-center rounded-pill bg-success-bg">
          <Icon name="checkCircle" size={28} color={statusHues.success} />
        </View>
        <Txt className="mt-4 text-center text-heading font-semibold text-fg">{title}</Txt>
        {total > 0 && (
          <Mono className="mt-1 text-callout font-semibold text-accent" numberOfLines={1}>
            {formatCurrency(total)}
          </Mono>
        )}
        <Txt className="mt-1.5 text-center text-caption text-faint">{subtitle}</Txt>

        <View className="mt-6 w-full flex-row gap-2.5">
          <View className="flex-1">
            <Button label="View quote" variant="secondary" onPress={onViewQuote} fullWidth />
          </View>
          <View className="flex-1">
            <Button label="Done" onPress={onDone} fullWidth />
          </View>
        </View>
      </View>
    </View>
  );
}
