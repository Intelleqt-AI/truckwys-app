import { memo } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { MONO_FONT } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { renderInline } from './InlineText';
import { MarkdownTable } from './MarkdownTable';
import type { Block, Inline } from './types';

// Block[] → React Native views.
//
// Every block is memoized by index, which is what keeps the reveal animation
// affordable: text measurement is O(length) and re-runs on every commit, so a
// naive "slice one growing Text" reveal is O(n²) — smooth at first and stuttering
// by the end. With completed blocks memoized, only the active one re-measures.

export type NavigateFn = (route: string) => void;

const BODY_SIZE = 15;
const BODY_LINE = 22;

/** A caret to sit at the reveal position. Colour, never the character. */
export interface CaretProps {
  show?: boolean;
  visible?: boolean;
}

export const MarkdownBlock = memo(function MarkdownBlock({
  block,
  onNavigate,
  caret,
}: {
  block: Block;
  onNavigate?: NavigateFn;
  /** Rendered as the last inline of this block while it's the active one. */
  caret?: React.ReactNode;
}) {
  const { colors } = useTheme();

  const body = (nodes: Inline[], extra?: object) => (
    <Text
      selectable
      // lineHeight set once, here. A nested Text with its own lineHeight gives
      // uneven baselines and clips descenders on Android.
      style={{ fontSize: BODY_SIZE, lineHeight: BODY_LINE, color: colors.fg, ...extra }}
    >
      {renderInline(nodes, colors, onNavigate)}
      {caret}
    </Text>
  );

  switch (block.kind) {
    case 'p':
      return <View className="mb-2">{body(block.inline)}</View>;

    case 'h': {
      const size = block.level === 1 ? 17 : block.level === 2 ? 16 : 15;
      return (
        <View className="mb-1.5 mt-1">
          <Text
            selectable
            style={{ fontSize: size, lineHeight: size + 6, fontWeight: '600', color: colors.fg }}
          >
            {renderInline(block.inline, colors, onNavigate)}
            {caret}
          </Text>
        </View>
      );
    }

    case 'quote':
      return (
        <View
          className="mb-2 pl-3"
          style={{ borderLeftWidth: 2, borderLeftColor: colors.line }}
        >
          {body(block.inline, { color: colors.muted })}
        </View>
      );

    case 'list':
      return (
        <View className="mb-2 gap-1">
          {block.items.map((item, i) => (
            <View key={i} className="flex-row" style={{ paddingLeft: item.indent * 14 }}>
              <Text
                style={{
                  fontSize: BODY_SIZE,
                  lineHeight: BODY_LINE,
                  color: colors.faint,
                  ...(block.ordered ? { fontFamily: MONO_FONT, fontSize: 13 } : null),
                  width: block.ordered ? 22 : 14,
                }}
              >
                {item.marker}
              </Text>
              <View className="flex-1">
                {body(item.inline)}
                {/* mb-2 on the shared body wrapper would double-space items */}
              </View>
            </View>
          ))}
        </View>
      );

    case 'code':
      return (
        <View className="my-2 overflow-hidden rounded-xs border border-line bg-surface">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} directionalLockEnabled>
            <Text
              selectable
              style={{
                fontFamily: MONO_FONT,
                fontSize: 12,
                lineHeight: 18,
                color: colors.fg,
                padding: 10,
              }}
            >
              {block.text}
            </Text>
          </ScrollView>
        </View>
      );

    case 'table':
      return (
        <MarkdownTable
          align={block.align}
          header={block.header}
          rows={block.rows}
          onNavigate={onNavigate}
        />
      );

    case 'hr':
      return <View className="my-3 h-px bg-line" />;
  }
});

/** A fully-rendered reply. */
export const Markdown = memo(function Markdown({
  blocks,
  onNavigate,
}: {
  blocks: Block[];
  onNavigate?: NavigateFn;
}) {
  return (
    <View>
      {blocks.map((b, i) => (
        <MarkdownBlock key={i} block={b} onNavigate={onNavigate} />
      ))}
    </View>
  );
});
