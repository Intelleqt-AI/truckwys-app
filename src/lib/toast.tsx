import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { Mono } from '@/components/ui/Text';

// Minimal global toast — replaces the web app's `toast` util. Errors and
// confirmations surface as a hairline banner near the top; auto-dismisses.
type ToastKind = 'error' | 'success' | 'info';
type ToastItem = { id: number; kind: ToastKind; message: string };

interface ToastState {
  items: ToastItem[];
  push: (kind: ToastKind, message: string) => void;
  remove: (id: number) => void;
}

let seq = 0;
const useToastStore = create<ToastState>((set) => ({
  items: [],
  push: (kind, message) => {
    const id = ++seq;
    set((s) => ({ items: [...s.items, { id, kind, message }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((i) => i.id !== id) })), 3500);
  },
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));

export const toast = {
  error: (m: string) => useToastStore.getState().push('error', m),
  success: (m: string) => useToastStore.getState().push('success', m),
  info: (m: string) => useToastStore.getState().push('info', m),
};

const KIND_CLASS: Record<ToastKind, { border: string; text: string }> = {
  error: { border: 'border-danger', text: 'text-danger' },
  success: { border: 'border-success', text: 'text-success' },
  info: { border: 'border-accent', text: 'text-accent' },
};

export function ToastHost() {
  const items = useToastStore((s) => s.items);
  const insets = useSafeAreaInsets();
  if (!items.length) return null;
  return (
    <View
      pointerEvents="none"
      className="absolute left-0 right-0 z-50 items-center gap-2 px-4"
      style={{ top: insets.top + 8 }}
    >
      {items.map((i) => (
        <ToastRow key={i.id} item={i} />
      ))}
    </View>
  );
}

function ToastRow({ item }: { item: ToastItem }) {
  const c = KIND_CLASS[item.kind];
  useEffect(() => {}, []);
  return (
    <Animated.View
      entering={FadeInUp.duration(180)}
      exiting={FadeOutUp.duration(180)}
      className={`w-full rounded-xs border ${c.border} bg-elevated px-4 py-3`}
    >
      <Mono className={`text-caption ${c.text}`}>{item.message}</Mono>
    </Animated.View>
  );
}
