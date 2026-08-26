import { useEffect } from 'react';
import { Alert } from 'react-native';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';

export interface UnsavedChangesGuardButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
  /** The button that actually leaves the screen — its tap re-dispatches the
      navigation action `beforeRemove` intercepted. Exactly one button should
      set this; the rest (Keep editing, Save draft, …) just run onPress. */
  dispatch?: boolean;
}

export interface UnsavedChangesGuardOptions {
  navigation: NavigationProp<ParamListBase>;
  /**
   * Whether to intercept back navigation right now — called fresh at the
   * moment the user actually tries to leave, rather than a pre-computed
   * boolean. That matters for any state a child component owns locally
   * (e.g. a memoized field extracted for render performance): that state
   * can change without ever re-rendering this screen, so a boolean captured
   * at render time can go stale; a getter called at fire-time can't.
   */
  isDirty: () => boolean;
  title: string;
  message: string;
  buttons: UnsavedChangesGuardButton[];
  /** Called instead of showing the alert — for a nested mode (a map pick, a
      voice recorder) where "back" should close that mode, not leave the
      screen. Checked first, whenever isDirty() is true. */
  onIntercept?: () => void;
}

/**
 * Confirms before a screen with unsaved changes is popped. Hooks into
 * `beforeRemove`, which covers the screen's own back control (already
 * calling goBack()), the iOS swipe-back gesture, and the Android hardware
 * back button in one place, since all three route through the same event.
 *
 * No screen in this app has this today — CreateQuoteScreen is the first,
 * written generically so any other screen with real unsaved-work risk can
 * reuse it without duplicating the beforeRemove/Alert plumbing.
 */
export function useUnsavedChangesGuard({
  navigation,
  isDirty,
  title,
  message,
  buttons,
  onIntercept,
}: UnsavedChangesGuardOptions) {
  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (!isDirty()) return;
      e.preventDefault();

      if (onIntercept) {
        onIntercept();
        return;
      }

      Alert.alert(
        title,
        message,
        buttons.map((b) => ({
          text: b.text,
          style: b.style,
          onPress: () => {
            b.onPress?.();
            if (b.dispatch) navigation.dispatch(e.data.action);
          },
        })),
      );
    });
  }, [navigation, isDirty, title, message, buttons, onIntercept]);
}
