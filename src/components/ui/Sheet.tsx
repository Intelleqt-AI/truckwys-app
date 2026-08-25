import { type ReactNode, useLayoutEffect, useCallback, useEffect, useRef, useState } from 'react';
import { View, Pressable, RefreshControl } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
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
  const [footerHeight, setFooterHeight] = useState(0);

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
            className="px-1 text-micro uppercase tracking-wide text-accent"
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
      <KeyboardAwareScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingHorizontal: 16,
          // Breathing room below the header so content never butts against it.
          paddingTop: variant === 'modal' ? 16 : 12,
          // Resting (keyboard-closed) reservation for the footer. The keyboard-open
          // case is handled by bottomOffset below instead — that's the one that
          // needs to know the footer height, not this baseline.
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
        // Swipe down over the keyboard to dismiss it.
        keyboardDismissMode="interactive"
        // Reserves this much extra space above the keyboard when scrolling a
        // focused field into view, so it clears the sticky footer instead of
        // landing directly above the keyboard and behind the footer.
        bottomOffset={footerHeight}
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
      </KeyboardAwareScrollView>

      {/* Sticks to the top of the keyboard on both platforms. Without this the
          submit button sits behind it on every create/edit screen, which is
          what made Add Expense look like it had no way to save. */}
      {footer && (
        <KeyboardStickyView
          // `insets.bottom + 8` below is only needed to clear the home
          // indicator while the keyboard is closed — once it's open the
          // keyboard already covers that area, so this offset eats the same
          // amount back on the way up. It's driven by the same shared
          // progress value as the sticky transform itself, so it animates in
          // lockstep with no separate render/clock — unlike swapping the
          // padding via state, which would snap instead of animate.
          offset={{ opened: insets.bottom + 8 - 10 }}
          onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
        >
          <View
            className="border-t border-line bg-bg-deep px-4 pt-3"
            style={{ paddingBottom: insets.bottom + 8 }}
          >
            {footer}
          </View>
        </KeyboardStickyView>
      )}
    </View>
  );
}
