import { FadeInDown, FadeIn, Easing } from 'react-native-reanimated';
import { motion, EASE_OUT } from '@/theme/tokens';

// Precomputed Reanimated entering-animation instances for Home's mount-once
// reveal. Built once here at module load — not inside the component, and not
// per-item during render — per Reanimated's own guidance that layout
// animation builders are cheapest built outside a component (or memoized):
// https://docs.swmansion.com/react-native-reanimated/docs/layout-animations/entering-exiting-animations
const ease = Easing.bezier(...EASE_OUT);

// One entry per top-level Home section (command bar, hero, bento pair,
// utilisation, quotes, bookings, actions — with one spare), in render order.
const SECTION_COUNT = 8;
export const SECTION_REVEAL = Array.from({ length: SECTION_COUNT }, (_, i) =>
  FadeInDown.duration(motion.reveal)
    .delay(i * motion.stagger)
    .easing(ease),
);

// Rows inside an already-revealed list (Recent quotes/Recent bookings show
// at most 4) — a finer, faster cascade than the section-level stagger above,
// since the list's own Group card has already faded in as one unit.
const ROW_COUNT = 4;
export const ROW_REVEAL = Array.from({ length: ROW_COUNT }, (_, i) =>
  FadeInDown.duration(220)
    .delay(i * 40)
    .easing(ease),
);

// Utilisation heat grid — 7 cols x 4 rows, diagonal (row+col) delay so it
// fills like a wave rather than row-by-row. Max diagonal is (rows-1)+(cols-1).
const HEAT_DIAGONALS = 7 + 4;
export const HEAT_REVEAL = Array.from({ length: HEAT_DIAGONALS }, (_, i) =>
  FadeIn.duration(260)
    .delay(i * 22)
    .easing(ease),
);
