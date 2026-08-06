import { memo } from 'react';
import { View, ScrollView, Text } from 'react-native';
import { MONO_FONT } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { renderInline } from './InlineText';
import type { Align, Inline } from './types';

// A GFM table.
//
// React Native has no table layout, so column alignment has to be produced by
// hand. Two arrangements that look obvious both fail:
//   - per-row flex rows with intrinsic cell widths → columns don't line up
//     across rows, because each row sizes independently;
//   - transposing into column Views → columns line up but a wrapped cell makes
//     one column taller than its neighbours, so the ROWS misalign.
// Measuring the columns once in JS and then rendering row-major is the only
// arrangement that gets both: widths are shared, and a row is a flex row whose
// children stretch to the tallest cell.

const FONT_SIZE = 13;
const CELL_PAD_H = 9;
const MIN_W = 64;
const MAX_W = 190;
/** Menlo/monospace is wider per character than the sans face. */
const CH_SANS = 0.56;
const CH_MONO = 0.62;

const plain = (nodes: Inline[]): string =>
  nodes
    .map((n) => (n.t === 'text' || n.t === 'code' ? n.v : plain(n.kids)))
    .join('');

/** Right-align and mono a column that is entirely numeric — money mostly. */
const NUMERIC = /^[-+]?[\dR\s.,%()]+$/;

function columnWidths(header: Inline[][], rows: Inline[][][], mono: boolean[]): number[] {
  return header.map((h, c) => {
    let chars = plain(h).length;
    for (const row of rows) chars = Math.max(chars, plain(row[c] ?? []).length);
    const ch = mono[c] ? CH_MONO : CH_SANS;
    return Math.min(MAX_W, Math.max(MIN_W, Math.round(chars * FONT_SIZE * ch) + CELL_PAD_H * 2));
  });
}

export const MarkdownTable = memo(function MarkdownTable({
  align,
  header,
  rows,
  onNavigate,
}: {
  align: Align[];
  header: Inline[][];
  rows: Inline[][][];
  onNavigate?: (route: string) => void;
}) {
  const { colors } = useTheme();

  const mono = header.map((_, c) => {
    const cells = rows.map((r) => plain(r[c] ?? []).trim()).filter(Boolean);
    return cells.length > 0 && cells.every((v) => NUMERIC.test(v));
  });
  const widths = columnWidths(header, rows, mono);
  const alignOf = (c: number): 'left' | 'center' | 'right' =>
    align[c] ?? (mono[c] ? 'right' : 'left');

  const cell = (
    content: Inline[],
    c: number,
    opts: { head?: boolean; last?: boolean; lastRow?: boolean },
  ) => (
    <View
      key={c}
      style={{
        width: widths[c],
        paddingHorizontal: CELL_PAD_H,
        paddingVertical: 7,
        borderRightWidth: opts.last ? 0 : 1,
        borderBottomWidth: opts.lastRow ? 0 : 1,
        borderColor: colors.line,
        justifyContent: 'center',
      }}
    >
      <Text
        numberOfLines={3}
        // Defence against one monstrous cell or an unbreakable URL — the middle
        // is the least useful part of an invoice number or a customer name.
        ellipsizeMode="middle"
        style={{
          fontSize: opts.head ? 10.5 : FONT_SIZE,
          lineHeight: opts.head ? 14 : 18,
          color: opts.head ? colors.faint : colors.fg,
          textAlign: alignOf(c),
          ...(opts.head
            ? { fontFamily: MONO_FONT, textTransform: 'uppercase' as const }
            : mono[c]
              ? { fontFamily: MONO_FONT }
              : null),
        }}
      >
        {renderInline(content, colors, onNavigate, `${opts.head ? 'h' : 'c'}${c}.`)}
      </Text>
    </View>
  );

  return (
    <View
      className="my-2 overflow-hidden rounded-xs border border-line"
      // width:100% so the horizontal ScrollView gets a bounded width from its
      // parent — without it the scroll view takes its content's intrinsic width
      // and stretches the whole message row.
      style={{ width: '100%' }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // The transcript scrolls vertically; let a horizontal drag here win.
        directionalLockEnabled
      >
        <View>
          <View className="flex-row bg-surface-hover" style={{ alignItems: 'stretch' }}>
            {header.map((h, c) =>
              cell(h, c, { head: true, last: c === header.length - 1, lastRow: rows.length === 0 }),
            )}
          </View>
          {rows.map((row, r) => (
            <View key={r} className="flex-row" style={{ alignItems: 'stretch' }}>
              {header.map((_, c) =>
                cell(row[c] ?? [], c, {
                  last: c === header.length - 1,
                  lastRow: r === rows.length - 1,
                }),
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
});
