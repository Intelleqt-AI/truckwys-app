import { useEffect } from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeOutDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { create } from 'zustand';
import { Mono } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';

// Global feedback. Native-feel policy: successes/info are SILENT visually —
// the UI updates and a light success haptic confirms. Only ERRORS surface a
// toast, anchored at the BOTTOM (above the tab bar) so it never covers the
// header. Call sites are unchanged (success/info still callable).
type ToastItem = { id: number; message: string };

interface ToastState {
  items: ToastItem[];
  push: (message: string) => void;
}

const TOAST_MS = 3500;
let seq = 0;
const useToastStore = create<ToastState>((set) => ({
  items: [],
  push: (message) => {
    const id = ++seq;
    set((s) => ({ items: [...s.items, { id, message }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((i) => i.id !== id) })), TOAST_MS);
  },
}));

const successHaptic = () => {
  if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
};

// A toast is purely visual, so a screen-reader user would never hear it. Every
// message is also announced; success/info stay visually silent (policy above) but
// still get spoken, since for VoiceOver/TalkBack that is the only confirmation.
const announce = (m?: string) => {
  if (m) AccessibilityInfo.announceForAccessibility(m);
};

export const toast = {
  error: (m: string) => {
    announce(m);
    useToastStore.getState().push(m);
  },
  // Silent + haptic — the screen already reflects the change.
  success: (m?: string) => {
    announce(m);
    successHaptic();
  },
  info: (m?: string) => {
    announce(m);
    successHaptic();
  },
};

export function ToastHost() {
  const items = useToastStore((s) => s.items);
  const insets = useSafeAreaInsets();
  if (!items.length) return null;
  return (
    <View
      pointerEvents="none"
      className="absolute left-0 right-0 z-50 items-center gap-2 px-4"
      style={{ bottom: insets.bottom + 90 }}
    >
      {items.map((i) => (
        <ToastRow key={i.id} item={i} />
      ))}
    </View>
  );
}

// Web v3 toast: overlay surface, 12px radius, 14/20 text, and a 2px progress bar
// in the status dot colour that runs down over the toast's lifetime.
function ToastRow({ item }: { item: ToastItem }) {
  const { colors } = useTheme();
  const remaining = useSharedValue(1);
  useEffect(() => {
    remaining.value = withTiming(0, { duration: TOAST_MS, easing: Easing.linear });
  }, [remaining]);
  const bar = useAnimatedStyle(() => ({ width: `${remaining.value * 100}%` }));
  return (
    <Animated.View
      entering={FadeInDown.duration(200)}
      exiting={FadeOutDown.duration(180)}
      className="min-h-[48px] w-full justify-center overflow-hidden rounded-menu border border-line-active bg-elevated px-4 py-3"
      style={{ boxShadow: colors.shadowPop }}
    >
      <Mono className="text-callout text-fg">{item.message}</Mono>
      <Animated.View
        style={[
          { position: 'absolute', left: 0, bottom: 0, height: 2, backgroundColor: colors.dangerDot },
          bar,
        ]}
      />
    </Animated.View>
  );
}
