import { type ReactNode, useLayoutEffect, useCallback } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mono, Label } from './Text';
import { Icon, type IconName } from './icons';
import { AmbientGlow } from './layout';
import { useTheme } from '@/theme/ThemeProvider';

// Round, centred hit target so each icon sits dead-centre inside a button
// whose background is always present (iOS only flickers its own capsule in).
const ICON_BTN = {
  width: 34,
  height: 34,
  borderRadius: 17,
  alignItems: 'center',
  justifyContent: 'center',
} as const;

// Full-screen detail screen. Drives the NATIVE iOS header: the system back
// button (chevron + previous screen name), a large collapsing title, and a
// Liquid Glass blur bar are all rendered by the navigator. Here we just feed
// it the title + trailing action, and (for modals) a leading close (X).
export function SheetScreen({
  eyebrow,
  title,
  onBack,
  actionLabel,
  actionIcon,
  onAction,
  children,
  footer,
  variant = 'push',
}: {
  eyebrow?: string;
  title?: string;
  onBack: () => void;
  actionLabel?: string;
  // When set, the trailing action renders as this icon instead of text.
  actionIcon?: IconName;
  onAction?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  variant?: 'push' | 'modal';
}) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { colors, scheme } = useTheme();
  // Persistent translucent circle so the round button is always visible.
  const btnBg = scheme === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)';

  const renderAction = useCallback(
    () => (
      <Pressable
        onPress={onAction}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        style={[ICON_BTN, { backgroundColor: btnBg }]}
      >
        {actionIcon ? (
          <Icon name={actionIcon} size={21} color={colors.accent} strokeWidth={2} />
        ) : (
          <Mono className="text-micro tracking-wide uppercase text-accent" style={{ fontWeight: '600' }}>
            {actionLabel}
          </Mono>
        )}
      </Pressable>
    ),
    [onAction, actionLabel, actionIcon, colors.accent, btnBg],
  );

  // Modals close with an X (clear "dismiss" affordance) rather than a Cancel word.
  const renderClose = useCallback(
    () => (
      <Pressable
        onPress={onBack}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={[ICON_BTN, { backgroundColor: btnBg }]}
      >
        <Icon name="x" size={22} color={colors.accent} strokeWidth={2} />
      </Pressable>
    ),
    [onBack, colors.accent, btnBg],
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: title ?? '',
      headerRight: actionLabel && onAction ? renderAction : undefined,
      ...(variant === 'modal' ? { headerLeft: renderClose } : {}),
    });
  }, [navigation, title, actionLabel, onAction, variant, renderAction, renderClose]);

  return (
    <View className="flex-1 bg-bg-deep">
      <AmbientGlow />
      <ScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingHorizontal: 16,
          // Modal header is opaque + inline; add breathing room below it.
          paddingTop: variant === 'modal' ? 16 : 0,
          paddingBottom: insets.bottom + 24,
        }}
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
