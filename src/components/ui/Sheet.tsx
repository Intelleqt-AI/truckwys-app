import { type ReactNode, useLayoutEffect, useCallback } from 'react';
import { View, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mono, Label } from './Text';
import { Icon, type IconName } from './icons';
import { AmbientGlow } from './layout';
import { useTheme } from '@/theme/ThemeProvider';

// Fixed square so the icon centres AND the native iOS bar-button frame is
// square — otherwise the iOS 26 glass capsule stretches into an oval ("not
// round"). No background; press feedback via opacity.
const ICON_BTN = {
  width: 34,
  height: 34,
  borderRadius: 17,
  alignItems: 'center',
  justifyContent: 'center',
} as const;
const pressDim = ({ pressed }: { pressed: boolean }) => [ICON_BTN, { opacity: pressed ? 0.4 : 1 }];
// Text actions size to their label (auto-width pill), not the icon square.
const pressDimText = ({ pressed }: { pressed: boolean }) => ({ opacity: pressed ? 0.4 : 1 });

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
  onRefresh,
  refreshing,
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
  // Opt-in pull-to-refresh. Screens whose data can change server-side (the
  // notification inbox, detail screens) should pass this.
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { colors } = useTheme();

  const renderAction = useCallback(
    () =>
      actionIcon ? (
        <Pressable
          onPress={onAction}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={pressDim}
        >
          <View style={ICON_BTN}>
            <Icon name={actionIcon} size={21} color={colors.accent} strokeWidth={2} />
          </View>
        </Pressable>
      ) : (
        <Pressable
          onPress={onAction}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={pressDimText}
        >
          <Mono
            numberOfLines={1}
            className="px-1 text-micro tracking-wide uppercase text-accent"
            style={{ fontWeight: '600' }}
          >
            {actionLabel}
          </Mono>
        </Pressable>
      ),
    [onAction, actionLabel, actionIcon, colors.accent],
  );

  // Modals close with an X (clear "dismiss" affordance) rather than a Cancel word.
  const renderClose = useCallback(
    () => (
      <Pressable
        onPress={onBack}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={pressDim}
      >
        <View style={ICON_BTN}>
          <Icon name="x" size={22} color={colors.accent} strokeWidth={2} />
        </View>
      </Pressable>
    ),
    [onBack, colors.accent],
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
          // Breathing room below the header so content never butts against it.
          paddingTop: variant === 'modal' ? 16 : 12,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={!!refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
            />
          ) : undefined
        }
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
