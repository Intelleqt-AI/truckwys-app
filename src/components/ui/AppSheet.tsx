import { type ReactNode, useCallback, useEffect, useRef } from 'react';
import { BackHandler, Platform, useWindowDimensions } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetView,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from './Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

// The app's one bottom sheet: gorhom's BottomSheetModal dressed in our theme
// tokens, behind the declarative `open` / `onClose` shape the old hand-rolled
// RN <Modal> sheets used, so call sites barely change.
//
// What it gives over those: a grab handle, swipe-down to dismiss, a backdrop that
// FADES (the old "slide" Modals dragged the dim layer up with the panel), and a
// real exit animation. Needs <BottomSheetModalProvider> (App.tsx) above it.
//
// Not for sheets rendered inside another RN <Modal> or a native
// `presentation: 'modal'` screen — the provider lives at the app root, so the
// sheet would draw behind them.

export interface AppSheetProps {
  open: boolean;
  /** The sheet asked to close (swipe, backdrop tap, back button) or finished closing. Set `open` false. */
  onClose: () => void;
  /**
   * Fires once the sheet has FINISHED animating away. Run follow-up work here
   * (open an Alert, navigate) — iOS won't present one while a modal is still leaving.
   */
  onDismissed?: () => void;
  /** Small caption above the content. */
  title?: string;
  /** Tallest the sheet may grow, as a fraction of the window (content scrolls past it). Default 0.9. */
  maxHeight?: number;
  /**
   * Wrap children in a scroll view that cooperates with the sheet's drag gesture.
   * Use for long lists — a plain ScrollView inside the sheet fights the pan.
   */
  scroll?: boolean;
  children: ReactNode;
}

export function AppSheet({
  open,
  onClose,
  onDismissed,
  title,
  maxHeight = 0.9,
  scroll = false,
  children,
}: AppSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const ref = useRef<BottomSheetModal>(null);
  const presented = useRef(false);

  useEffect(() => {
    if (open) {
      presented.current = true;
      ref.current?.present();
    } else if (presented.current) {
      ref.current?.dismiss();
    }
  }, [open]);

  // RN's <Modal> answered the hardware back button through onRequestClose; a
  // gorhom modal doesn't, so without this Android back would leave the screen
  // underneath instead of closing the sheet.
  useEffect(() => {
    if (!open || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      ref.current?.dismiss();
      return true;
    });
    return () => sub.remove();
  }, [open]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
        // The theme token already carries the dimming per scheme, so draw it at
        // full opacity rather than gorhom's default black @ 0.5.
        opacity={1}
        style={{ backgroundColor: colors.backdrop }}
      />
    ),
    [colors.backdrop],
  );

  const handleDismiss = useCallback(() => {
    presented.current = false;
    onClose();
    onDismissed?.();
  }, [onClose, onDismissed]);

  const body = (
    <>
      {title && (
        <Txt className="px-2 pb-1 pt-2 text-caption font-medium text-faint">{title}</Txt>
      )}
      {children}
    </>
  );
  const bottomPad = insets.bottom + 8;

  return (
    <BottomSheetModal
      ref={ref}
      enablePanDownToClose
      maxDynamicContentSize={windowHeight * maxHeight}
      backdropComponent={renderBackdrop}
      onDismiss={handleDismiss}
      backgroundStyle={{
        backgroundColor: colors.elevated,
        borderTopLeftRadius: radius.panel,
        borderTopRightRadius: radius.panel,
        borderWidth: 1,
        borderBottomWidth: 0,
        borderColor: colors.line,
        boxShadow: colors.shadowPop,
      }}
      handleIndicatorStyle={{ backgroundColor: colors.lineStrong, width: 36 }}
    >
      {scroll ? (
        <BottomSheetScrollView
          contentContainerStyle={{ paddingBottom: bottomPad }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {body}
        </BottomSheetScrollView>
      ) : (
        <BottomSheetView style={{ paddingBottom: bottomPad }}>{body}</BottomSheetView>
      )}
    </BottomSheetModal>
  );
}
