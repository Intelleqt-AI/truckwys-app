import { type ReactNode, useLayoutEffect, useCallback } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt, Mono, Label } from './Text';
import { AmbientGlow } from './layout';

// Full-screen detail screen. Drives the NATIVE iOS header: the system back
// button (chevron + previous screen name), a large collapsing title, and a
// Liquid Glass blur bar are all rendered by the navigator. Here we just feed
// it the title + trailing action, and (for modals) a leading Cancel.
export function SheetScreen({
  eyebrow,
  title,
  onBack,
  actionLabel,
  onAction,
  children,
  footer,
  variant = 'push',
}: {
  eyebrow?: string;
  title?: string;
  onBack: () => void;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  variant?: 'push' | 'modal';
}) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const renderAction = useCallback(
    () => (
      <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button">
        <Mono className="text-micro tracking-wide uppercase text-accent" style={{ fontWeight: '600' }}>
          {actionLabel}
        </Mono>
      </Pressable>
    ),
    [onAction, actionLabel],
  );

  const renderCancel = useCallback(
    () => (
      <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" accessibilityLabel="Cancel">
        <Txt className="text-body text-accent">Cancel</Txt>
      </Pressable>
    ),
    [onBack],
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: title ?? '',
      headerRight: actionLabel && onAction ? renderAction : undefined,
      ...(variant === 'modal' ? { headerLeft: renderCancel } : {}),
    });
  }, [navigation, title, actionLabel, onAction, variant, renderAction, renderCancel]);

  return (
    <View className="flex-1 bg-bg-deep">
      <AmbientGlow />
      <ScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {eyebrow && <Label className="mb-3 mt-1">{eyebrow}</Label>}
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
