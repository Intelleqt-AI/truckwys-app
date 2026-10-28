import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useReducedMotion } from 'react-native-reanimated';
import { motion, easeOut } from '@/theme/tokens';

// Rolls a number toward `target`, like useCountUp, but for the quote footer.
//
// The footer can't use useCountUp: gorhom renders `footerComponent` as a
// component type, and the screen's renderFooter is a useCallback over the
// price, so every price change remounts the footer. useCountUp starts from 0
// on mount, so it would replay "R 0 → R 25 100" each time the route or pricing
// lands. Here the screen owns `shown` (a stable ref) and this hook writes the
// displayed value into it every frame, so a remount carries on from where the
// number was, and a change mid-roll starts from what is on screen rather than
// jumping back. The first ever mount still rolls up from 0 (the reveal).
//
// Reduce Motion snaps straight to the target.
export function useRollingTotal(
  target: number,
  shown: MutableRefObject<number>,
  duration: number = motion.slow,
): number {
  const reducedMotion = useReducedMotion();
  const [value, setValue] = useState(reducedMotion ? target : shown.current);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (reducedMotion || !Number.isFinite(target)) {
      shown.current = target;
      setValue(target);
      return;
    }
    const start = shown.current;
    if (start === target) {
      setValue(target);
      return;
    }

    const startedAt = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - startedAt) / duration);
      const next = start + (target - start) * easeOut(t);
      shown.current = next;
      setValue(next);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);

    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, [target, duration, reducedMotion, shown]);

  return value;
}
