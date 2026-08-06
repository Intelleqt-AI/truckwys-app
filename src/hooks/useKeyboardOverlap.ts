import { useEffect, useState } from 'react';
import { Dimensions, Keyboard, Platform } from 'react-native';

/**
 * How many pixels of the bottom of the screen the keyboard is currently
 * covering — 0 when it's down.
 *
 * Measured against the screen rather than any container, so it's correct whether
 * the caller sits under a transparent header (push screens) or below an opaque
 * one (modals). That's the reason this exists instead of KeyboardAvoidingView,
 * whose `behavior="padding"` needs a per-screen `keyboardVerticalOffset` because
 * it compares a parent-relative layout frame against screen coordinates.
 *
 * iOS only. It returns 0 on Android, where the window itself resizes for the
 * keyboard (`softwareKeyboardLayoutMode: resize`, the Expo default) — shifting
 * anything by hand there would move it twice.
 */
export function useKeyboardOverlap(): number {
  const [overlap, setOverlap] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    // willChangeFrame rather than willShow: it also fires when the height
    // changes under us (autocomplete strip appearing, an accessory bar, a
    // hardware keyboard connecting).
    const change = Keyboard.addListener('keyboardWillChangeFrame', (e) => {
      const screenHeight = Dimensions.get('window').height;
      setOverlap(Math.max(0, screenHeight - e.endCoordinates.screenY));
    });
    const hide = Keyboard.addListener('keyboardWillHide', () => setOverlap(0));
    return () => {
      change.remove();
      hide.remove();
    };
  }, []);

  return overlap;
}
