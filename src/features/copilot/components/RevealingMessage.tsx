import { useEffect, useMemo, useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { parseBlocks } from '../markdown/parseBlocks';
import { sliceInline } from '../markdown/parseInline';
import { MarkdownBlock, type NavigateFn } from '../markdown/Markdown';
import { isAtomic, type Block } from '../markdown/types';
import { useReveal } from '../useReveal';

// The reply, typing itself out.
//
// Blocks behind the cursor are rendered from the SAME memoized MarkdownBlock the
// settled message uses, so they render once and never re-measure. Only the active
// block is rebuilt per tick, which is what keeps the cost flat instead of growing
// with the length of the reply.

/** Truncate one block to `chars`, keeping its structure. */
function sliceBlock(b: Block, chars: number): Block {
  switch (b.kind) {
    case 'p':
    case 'quote':
      return { ...b, inline: sliceInline(b.inline, chars) };
    case 'h':
      return { ...b, inline: sliceInline(b.inline, chars) };
    case 'list': {
      // Reveal item by item; the +2 per item matches the cost in useReveal.
      const items: typeof b.items = [];
      let left = chars;
      for (const it of b.items) {
        if (left <= 0) break;
        items.push({ ...it, inline: sliceInline(it.inline, left) });
        left -= 2;
        for (const n of it.inline) left -= n.t === 'text' || n.t === 'code' ? n.v.length : 0;
      }
      return { ...b, items };
    }
    default:
      // Atomic: it is either not reached yet or shown whole.
      return b;
  }
}

/** Blinks by colour, not by swapping the glyph — swapping reflows the last word. */
function Caret() {
  const { colors } = useTheme();
  const [on, setOn] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setOn((v) => !v), 530);
    return () => clearInterval(id);
  }, []);
  return <Text style={{ color: on ? colors.accent : 'transparent' }}>▍</Text>;
}

export function RevealingMessage({
  content,
  onNavigate,
  onDone,
}: {
  content: string;
  onNavigate?: NavigateFn;
  /** Fires once everything is visible, so the caller can settle the turn. */
  onDone?: () => void;
}) {
  const blocks = useMemo(() => parseBlocks(content), [content]);
  const { doneCount, activeIndex, activeChars, complete, skip } = useReveal(blocks, true);

  useEffect(() => {
    if (complete) onDone?.();
    // onDone is intentionally not a dependency — it is a settle callback and
    // re-running on a new identity would fire it twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete]);

  const active = activeIndex >= 0 ? blocks[activeIndex] : undefined;
  const activeSlice = useMemo(
    () => (active ? sliceBlock(active, activeChars) : undefined),
    [active, activeChars],
  );

  return (
    <Pressable
      onPress={skip}
      // Tap anywhere on the reply to see all of it — never make someone wait.
      accessibilityRole="button"
      accessibilityLabel="Show the full reply"
      className="py-1"
    >
      <View>
        {blocks.slice(0, doneCount).map((b, i) => (
          <MarkdownBlock key={i} block={b} onNavigate={onNavigate} />
        ))}
        {activeSlice && (
          // Atomic blocks appear whole once the cursor reaches them, so they are
          // never rendered half-drawn.
          <MarkdownBlock
            key={activeIndex}
            block={activeSlice}
            onNavigate={onNavigate}
            caret={isAtomic(activeSlice) ? undefined : <Caret />}
          />
        )}
      </View>
    </Pressable>
  );
}
