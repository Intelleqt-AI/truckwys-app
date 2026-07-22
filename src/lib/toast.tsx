import { Platform, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { create } from 'zustand';
import { Mono } from '@/components/ui/Text';

// Global feedback. Native-feel policy: successes/info are SILENT visually —
// the UI updates and a light success haptic confirms. Only ERRORS surface a
// toast, anchored at the BOTTOM (above the tab bar) so it never covers the
// header. Call sites are unchanged (success/info still callable).
type ToastItem = { id: number; message: string };

interface ToastState {
  items: ToastItem[];
  push: (message: string) => void;
}

let seq = 0;
const useToastStore = create<ToastState>((set) => ({
  items: [],
  push: (message) => {
    const id = ++seq;
    set((s) => ({ items: [...s.items, { id, message }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((i) => i.id !== id) })), 3500);
  },
}));

const successHaptic = () => {
  if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
};

export const toast = {
  error: (m: string) => useToastStore.getState().push(m),
  // Silent + haptic — the screen already reflects the change.
  success: (_m?: string) => successHaptic(),
  info: (_m?: string) => successHaptic(),
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

function ToastRow({ item }: { item: ToastItem }) {
  return (
    <Animated.View
      entering={FadeInDown.duration(200)}
      exiting={FadeOutDown.duration(180)}
      className="w-full rounded-xs border border-danger bg-elevated px-4 py-3"
    >
      <Mono className="text-caption text-danger">{item.message}</Mono>
    </Animated.View>
  );
}
