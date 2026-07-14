import { type ReactNode } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt, Mono, Label } from './Text';
import { Icon } from './icons';
import { AmbientGlow } from './layout';
import { useTheme } from '@/theme/ThemeProvider';

// Full-screen slide-over detail sheet (matches the design's overlay pattern).
// Presented as a modal/pushed screen; provides Back + optional trailing action,
// a big title header, a scrollable body and an optional pinned footer.
export function SheetScreen({
  eyebrow,
  title,
  onBack,
  actionLabel,
  onAction,
  children,
  footer,
}: {
  eyebrow?: string;
  title?: string;
  onBack: () => void;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <View className="flex-1 bg-bg-deep" style={{ paddingTop: insets.top }}>
      <AmbientGlow />
      <View className="flex-row items-center justify-between px-3 pb-3 pt-1">
        <Pressable
          onPress={onBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="min-h-[44px] flex-row items-center gap-0.5 px-2"
        >
          <Icon name="chevronLeft" size={22} color={colors.accent} strokeWidth={2} />
          <Txt className="text-body text-accent">Back</Txt>
        </Pressable>
        {actionLabel && onAction && (
          <Pressable
            onPress={onAction}
            hitSlop={8}
            accessibilityRole="button"
            className="min-h-[44px] justify-center px-2"
          >
            <Mono className="text-micro tracking-wide uppercase text-accent" style={{ fontWeight: '600' }}>
              {actionLabel}
            </Mono>
          </Pressable>
        )}
      </View>

      {(eyebrow || title) && (
        <View className="px-screen pb-3">
          {eyebrow && <Label className="mb-1">{eyebrow}</Label>}
          {title && (
            <Txt className="font-semibold tracking-[-0.02em] text-fg" style={{ fontSize: 24 }}>
              {title}
            </Txt>
          )}
        </View>
      )}

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>

      {footer && (
        <View
          className="border-t border-line bg-bg-deep px-4 pt-3"
          style={{ paddingBottom: insets.bottom + 8 }}
        >
          {footer}
        </View>
      )}
    </View>
  );
}
