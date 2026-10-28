import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  ZoomIn,
  useReducedMotion,
} from 'react-native-reanimated';
import { EASE_OUT, motion } from '@/theme/tokens';

// Entering / exiting / layout builders for the quote builder's conditional
// blocks (a stop appearing, the route preview landing, the coordinates panel).
// Built once at module load, as in src/features/home/motion.ts.
//
// Only ever applied to *inner* conditional blocks. Never to a QuoteSection
// root or to a wrapper around the sections: the jump bar scrolls to each
// section's `layout.y`, which is only the scroll offset while the sections are
// direct children of the form's first View.
const ease = Easing.bezier(...EASE_OUT);

const ENTER = FadeIn.duration(motion.smooth).easing(ease);
const ENTER_DOWN = FadeInDown.duration(motion.smooth).easing(ease);
const EXIT = FadeOut.duration(motion.fast);
const LAYOUT = LinearTransition.duration(motion.smooth).easing(ease);
// Scale only: a glass surface must never have its opacity animated (it stops rendering).
const ZOOM = ZoomIn.duration(motion.smooth).easing(ease);
// A card landing on the screen (the sent confirmation): the same scale, sprung.
const ZOOM_SPRING = ZoomIn.springify().damping(16).stiffness(180);

/** Reduce Motion: no entrance, exit or layout animation, so blocks are simply there. */
export function useQuoteMotion() {
  const reduced = useReducedMotion();
  return {
    enter: reduced ? undefined : ENTER,
    enterDown: reduced ? undefined : ENTER_DOWN,
    exit: reduced ? undefined : EXIT,
    layout: reduced ? undefined : LAYOUT,
    zoom: reduced ? undefined : ZOOM,
    zoomSpring: reduced ? undefined : ZOOM_SPRING,
  };
}

/** The house selection tick, for choices that aren't already a jump (jumpTo fires its own). */
export function tapHaptic() {
  if (Platform.OS !== 'web') void Haptics.selectionAsync();
}
