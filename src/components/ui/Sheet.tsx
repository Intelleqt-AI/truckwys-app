import { type ReactNode, useLayoutEffect, useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable, RefreshControl } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardOverlap } from '@/hooks/useKeyboardOverlap';
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
  const keyboardOverlap = useKeyboardOverlap();
  const [footerHeight, setFooterHeight] = useState(0);
  // Timed rather than a bare style change so the footer rides up with the
  // keyboard instead of snapping ahead of it.
  const footerLift = useAnimatedStyle(
    () => ({ transform: [{ translateY: withTiming(-keyboardOverlap, { duration: 250 }) }] }),
    [keyboardOverlap],
  );

  /**
   * The header callbacks, held in refs.
   *
   * Callers pass plain (non-memoised) functions — `onAction={share}` where
   * `share` is declared in the component body, or a bare inline arrow. Those get
   * a fresh identity on every render, so renderAction did too, and the
   * useLayoutEffect below then called setOptions({ headerRight }) on EVERY
   * render. Each of those recreates the native bar-button item, and iOS 26
   * sometimes measured its glass background before Yoga had applied the 34x34
   * layout — which is why the header action came out round on some renders and a
   * stretched capsule on others, worst on the screens that re-render most (the
   * quote page constantly; the invoice barely, hence it looked fine).
   *
   * Reading through a ref keeps the rendered element identity stable, so the
   * native item is created once and its frame settles.
   */
  const actionRef = useRef(onAction);
  const backRef = useRef(onBack);
  useEffect(() => {
    actionRef.current = onAction;
    backRef.current = onBack;
  }, [onAction, onBack]);

  const renderAction = useCallback(
    () =>
      actionIcon ? (
        <Pressable
          onPress={() => actionRef.current?.()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={pressDim}
          // Keeps the square in the native view tree: a flattened wrapper leaves
          // iOS sizing its glass to something other than the 34x34 we asked for.
          collapsable={false}
        >
          <View style={ICON_BTN} collapsable={false}>
            <Icon name={actionIcon} size={21} color={colors.accent} strokeWidth={2} />
          </View>
        </Pressable>
      ) : (
        <Pressable
          onPress={() => actionRef.current?.()}
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
    [actionLabel, actionIcon, colors.accent],
  );

  // Modals close with an X (clear "dismiss" affordance) rather than a Cancel word.
  const renderClose = useCallback(
    () => (
      <Pressable
        onPress={() => backRef.current?.()}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={pressDim}
        collapsable={false}
      >
        <View style={ICON_BTN} collapsable={false}>
          <Icon name="x" size={22} color={colors.accent} strokeWidth={2} />
        </View>
      </Pressable>
    ),
    [colors.accent],
  );

  // A boolean, not onAction itself — the function's identity changes every
  // render and would re-run this effect each time. Only whether there IS an
  // action matters here.
  const hasAction = !!onAction;
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: title ?? '',
      headerRight: actionLabel && hasAction ? renderAction : undefined,
      ...(variant === 'modal' ? { headerLeft: renderClose } : {}),
    });
  }, [navigation, title, actionLabel, hasAction, variant, renderAction, renderClose]);

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
          // While the footer is raised it sits over the bottom of the content,
          // so reserve its height as well or the last field hides behind it.
          paddingBottom: insets.bottom + 24 + (keyboardOverlap > 0 ? footerHeight : 0),
        }}
        keyboardShouldPersistTaps="handled"
        // Swipe down over the keyboard to dismiss it, and let iOS inset the
        // content so a focused field lower down still scrolls into view.
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
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

      {/* Lifts clear of the keyboard. Without this the submit button sits behind
          it on every create/edit screen, which is what made Add Expense look
          like it had no way to save.
          A transform, NOT a margin: a margin would shrink the ScrollView, and
          automaticallyAdjustKeyboardInsets computes its inset from the frame it
          had when the keyboard appeared — so the two together would reserve the
          keyboard height twice and leave a blank screen-height gap below the
          content. A transform keeps the layout, so the inset stays right. */}
      {footer && (
        <Animated.View
          style={footerLift}
          onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
        >
          <View
            className="border-t border-line bg-bg-deep px-4 pt-3"
            // The home-indicator gap is only wasted space while the keyboard is up.
            style={{ paddingBottom: keyboardOverlap > 0 ? 10 : insets.bottom + 8 }}
          >
            {footer}
          </View>
        </Animated.View>
      )}
    </View>
  );
}
