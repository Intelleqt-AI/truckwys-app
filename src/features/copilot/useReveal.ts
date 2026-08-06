import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import { inlineLength } from './markdown/parseInline';
import type { Block } from './markdown/types';

// The typing effect.
//
// Not a `setInterval` slicing the raw reply string, which is what the web app
// does. Two reasons that approach doesn't survive the trip to a phone:
//
//   1. Slicing raw markdown flashes `**Tot` before the bold closes. Web works
//      around it by SKIPPING the animation whenever the reply looks like
//      markdown — and since the backend prompt asks for markdown tables, that
//      means the effect almost never plays. Revealing a cursor over the parsed
//      token list instead means bold is bold from its first character.
//   2. A 12ms interval is not honoured. Hermes coalesces short timers whenever
//      the JS thread has commit work queued, so you get bursts of five characters
//      then a pause — which looks worse than a slower, honest tick.
//
// So: a cursor DERIVED from elapsed time, advanced on requestAnimationFrame and
// committed at most every ~33ms. rAF self-throttles under load, and deriving
// from the clock means a dropped frame skips ahead rather than slowing down.

/** Commit at most this often. ~30Hz. */
const TICK_MS = 33;
/** Baseline speed. Web is ~167 c/s; slightly faster reads better on a phone. */
const BASE_CPS = 200;
/** Nothing takes longer than this, however long the reply. */
const MAX_REVEAL_MS = 3500;
/** Below this, just show it — an animation would only add latency. */
const INSTANT_UNDER = 12;
/** Defensive ceiling. max_tokens=700 server-side caps replies near 2800 chars. */
const SKIP_OVER_CHARS = 8000;
const SKIP_OVER_BLOCKS = 60;
/** What a table or code block "costs" on the timeline: a beat, not its length. */
const ATOMIC_BEAT = 24;

export interface RevealState {
  /** Blocks fully revealed, rendered from the memoized path. */
  doneCount: number;
  /** Index of the block currently being typed, or -1 when there isn't one. */
  activeIndex: number;
  /** Characters revealed within the active block. */
  activeChars: number;
  /** True once everything is visible. */
  complete: boolean;
}

/** Plain-text cost of one block for pacing purposes. */
function blockCost(b: Block): number {
  switch (b.kind) {
    case 'table':
    case 'code':
    case 'hr':
      return ATOMIC_BEAT;
    case 'list':
      // +2 per item for the marker and the line break, so a long list of short
      // items still paces like text rather than snapping into place.
      return b.items.reduce((n, it) => n + inlineLength(it.inline) + 2, 0);
    default:
      return inlineLength(b.inline);
  }
}

const finished = (blocks: Block[]): RevealState => ({
  doneCount: blocks.length,
  activeIndex: -1,
  activeChars: 0,
  complete: true,
});

/**
 * Reveal `blocks` over time.
 *
 * `enabled: false` shows everything immediately — used for rehydrated history,
 * which must never animate.
 */
export function useReveal(blocks: Block[], enabled: boolean): RevealState & { skip: () => void } {
  const costs = useMemo(() => blocks.map(blockCost), [blocks]);
  const total = useMemo(() => costs.reduce((a, b) => a + b, 0), [costs]);

  const tooBig = total > SKIP_OVER_CHARS || blocks.length > SKIP_OVER_BLOCKS;
  const animate = enabled && total > INSTANT_UNDER && !tooBig;

  const [state, setState] = useState<RevealState>(() =>
    animate ? { doneCount: 0, activeIndex: 0, activeChars: 0, complete: false } : finished(blocks),
  );
  const skipped = useRef(!animate);

  // A blocking check rather than a state flag: someone with Reduce Motion on
  // should never see a single frame of this.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (alive) setReduceMotion(on);
    });
  }, []);

  useEffect(() => {
    if (!animate || reduceMotion) {
      skipped.current = true;
      setState(finished(blocks));
      return;
    }

    skipped.current = false;
    const cps = Math.max(BASE_CPS, total / (MAX_REVEAL_MS / 1000));
    const startedAt = Date.now();
    let raf: number | null = null;
    let lastCommit = 0;

    const finish = () => {
      if (raf != null) cancelAnimationFrame(raf);
      raf = null;
      skipped.current = true;
      setState(finished(blocks));
    };

    const step = () => {
      if (skipped.current) return;
      const now = Date.now();
      if (now - lastCommit >= TICK_MS) {
        lastCommit = now;
        const cursor = Math.floor(((now - startedAt) / 1000) * cps);
        if (cursor >= total) {
          finish();
          return;
        }
        // Walk the costs to find which block the cursor is inside. Cheap: a
        // reply is a handful of blocks, not thousands.
        let acc = 0;
        let idx = 0;
        while (idx < costs.length && acc + costs[idx]! <= cursor) {
          acc += costs[idx]!;
          idx++;
        }
        setState({
          doneCount: idx,
          activeIndex: idx,
          activeChars: cursor - acc,
          complete: false,
        });
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    // Backgrounding suspends rAF on iOS, and a clock-derived cursor would jump
    // on resume. Finishing is both cheaper and less jarring.
    const appState = AppState.addEventListener('change', (s) => {
      if (s !== 'active') finish();
    });

    return () => {
      if (raf != null) cancelAnimationFrame(raf);
      appState.remove();
      // No partial state is ever kept: the full text already lives in the
      // caller, so unmounting simply means it was never animated.
    };
  }, [animate, reduceMotion, blocks, costs, total]);

  return {
    ...state,
    skip: () => {
      skipped.current = true;
      setState(finished(blocks));
    },
  };
}
