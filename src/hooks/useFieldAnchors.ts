import { useCallback, useRef } from 'react';
import { Platform, type LayoutChangeEvent, type TextInput } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';

/**
 * Scroll-to-first-error for a `SheetScreen` form — a generic version of
 * CreateQuoteScreen's `registerSectionY`/`jumpTo` (src/features/bookings/
 * CreateQuoteScreen.tsx), which is fixed to that screen's own `SectionId`
 * union. Here `Name` is whatever field-name union the caller's zod schema
 * produces, so any SheetScreen form can reuse it.
 *
 * Refs only, never state — measuring a field's position on layout must not
 * re-render the form on every pass, and a scroll/focus target has no
 * business living in React state.
 */
export function useFieldAnchors<Name extends string>() {
  const scrollRef = useRef<KeyboardAwareScrollViewRef>(null);
  const positions = useRef<Partial<Record<Name, number>>>({});
  const inputRefs = useRef<Partial<Record<Name, TextInput | null>>>({});
  const refCallbacks = useRef<Partial<Record<Name, (r: TextInput | null) => void>>>({});

  /** Pass as `onLayout` on the View wrapping one field. */
  const registerY = useCallback(
    (name: Name) => (e: LayoutChangeEvent) => {
      positions.current[name] = e.nativeEvent.layout.y;
    },
    [],
  );

  /**
   * Pass as `ref` on a `TextField`. Cached per name so the same function
   * identity is handed to the input every render — a fresh callback ref on
   * every keystroke would tear down and reattach the native input's ref
   * each time instead of once.
   */
  const registerInput = useCallback((name: Name) => {
    let cb = refCallbacks.current[name];
    if (!cb) {
      cb = (r) => {
        inputRefs.current[name] = r;
      };
      refCallbacks.current[name] = cb;
    }
    return cb;
  }, []);

  /** Scrolls the field into view, selection-haptics, and focuses it if it's a text input. */
  const scrollToField = useCallback((name: Name) => {
    const y = positions.current[name];
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true });
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
    // Focus after the scroll has started rather than instantly — focusing
    // mid-scroll on iOS fights the animation and the keyboard snaps in
    // before the field has settled at its resting position. Only text
    // inputs are focusable this way; selects/dates open their own modal.
    const input = inputRefs.current[name];
    if (input) setTimeout(() => input.focus(), 260);
  }, []);

  return { scrollRef, registerY, registerInput, scrollToField };
}
