import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';
import { motion, easeOut } from '@/theme/tokens';

// ── useCountUp: ramps a number toward `target` on the JS thread ────────────
// Home's hero/bento numerics are rendered through `Intl.NumberFormat`
// (formatCurrency/formatPercent), which isn't available inside a Reanimated
// worklet — so this can't be a `useAnimatedProps` count-up. A ~24-step
// requestAnimationFrame ramp is cheap enough that it doesn't need one.
//
// The first render ramps up from 0 (the reveal); every ramp after that starts
// from wherever the last one landed, so a background refetch nudges the
// number rather than replaying the whole reveal from zero. Respects the OS
// reduce-motion setting by snapping straight to `target`.
export function useCountUp(target: number, opts?: { duration?: number }): number {
  const duration = opts?.duration ?? motion.reveal;
  const reducedMotion = useReducedMotion();
  // Starts at 0 so the very first render ramps up on mount (the reveal);
  // every ramp after that starts from wherever the last one landed.
  const [value, setValue] = useState(reducedMotion ? target : 0);
  const from = useRef(reducedMotion ? target : 0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (reducedMotion || !Number.isFinite(target)) {
      setValue(target);
      from.current = target;
      return;
    }
    const start = from.current;
    if (start === target) return;

    const startedAt = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      const t = Math.min(1, elapsed / duration);
      const eased = easeOut(t);
      setValue(start + (target - start) * eased);
      if (t < 1) {
        raf.current = requestAnimationFrame(tick);
      } else {
        from.current = target;
      }
    };
    raf.current = requestAnimationFrame(tick);

    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, [target, duration, reducedMotion]);

  return value;
}
