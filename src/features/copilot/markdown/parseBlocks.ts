import { parseInline } from './parseInline';
import type { Align, Block, Inline, ListItem } from './types';

// Block tokenizer: ONE stateful forward pass over the lines.
//
// The single pass is what makes fenced code safe. If fences were handled by a
// separate regex pass, a ``` block containing `# heading`, `| pipes |`, `- item`
// or `**stars` would be picked apart by whichever other rule ran next. Here the
// fence is consumed first and nothing inside it is ever inspected.
//
// Order matters, and the table lookahead specifically must run before the list
// rules (a table row can start with `- `) and must require a delimiter row (or
// a prose line mentioning `status|ACTIVE` becomes a table).

const RE_FENCE = /^\s*(```+|~~~+)\s*([\w+#-]*)\s*$/;
const RE_HR = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const RE_HEADING = /^\s*(#{1,6})\s+(.*)$/;
const RE_QUOTE = /^\s*>\s?(.*)$/;
const RE_UL = /^(\s*)([-*+•])\s+(.*)$/;
const RE_OL = /^(\s*)(\d{1,3})[.)]\s+(.*)$/;
const RE_DELIM = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

/** Split on `|` but not `\|`, so an escaped pipe can live inside a cell. */
const splitCells = (line: string): string[] => {
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '\\' && line[i + 1] === '|') {
      cur += '|';
      i++;
      continue;
    }
    if (c === '|') {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur);
  // Drop at most one empty edge cell each side, which is the difference between
  // `| a | b |` and a pipe-less `a | b`.
  if (out.length > 1 && out[0]!.trim() === '') out.shift();
  if (out.length > 1 && out[out.length - 1]!.trim() === '') out.pop();
  return out.map((c) => c.trim());
};

const alignOf = (cell: string): Align => {
  const c = cell.trim();
  if (c.startsWith(':') && c.endsWith(':')) return 'center';
  if (c.endsWith(':')) return 'right';
  return 'left';
};

const isStarter = (line: string): boolean =>
  RE_FENCE.test(line) ||
  RE_HR.test(line) ||
  RE_HEADING.test(line) ||
  RE_QUOTE.test(line) ||
  RE_UL.test(line) ||
  RE_OL.test(line) ||
  !line.trim();

function parse(src: string): Block[] {
  // Normalise before anything else. Without this a stray \r defeats every
  // $-anchored regex and the table delimiter check silently never matches.
  const text = src
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '  ');
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // 1. Fenced code — consumed whole, contents never inspected.
    const fence = RE_FENCE.exec(line);
    if (fence) {
      const marker = fence[1]!;
      const lang = fence[2] || undefined;
      const body: string[] = [];
      i++;
      while (i < lines.length) {
        const l = lines[i]!;
        // A closing run must be at least as long as the opening one.
        if (new RegExp(`^\\s*${marker[0]}{${marker.length},}\\s*$`).test(l)) {
          i++;
          break;
        }
        body.push(l);
        i++;
      }
      // An unclosed fence just runs to the end, which is CommonMark's behaviour
      // and matters because a truncated reply can end mid-block.
      blocks.push({ kind: 'code', ...(lang ? { lang } : {}), text: body.join('\n') });
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    if (RE_HR.test(line)) {
      blocks.push({ kind: 'hr' });
      i++;
      continue;
    }

    const heading = RE_HEADING.exec(line);
    if (heading) {
      // Match 1-6 hashes but clamp the style to 3 — a `#### Total` written as
      // `#{1,3}` only would render its hashes as literal text.
      const level = Math.min(3, heading[1]!.length) as 1 | 2 | 3;
      blocks.push({ kind: 'h', level, inline: parseInline(heading[2]!) });
      i++;
      continue;
    }

    if (RE_QUOTE.test(line)) {
      const parts: string[] = [];
      while (i < lines.length) {
        const m = RE_QUOTE.exec(lines[i]!);
        if (!m) break;
        parts.push(m[1]!);
        i++;
      }
      blocks.push({ kind: 'quote', inline: parseInline(parts.join('\n')) });
      continue;
    }

    // 2. Table — only when the NEXT line is a delimiter row with the same cell
    // count. This one rule is what keeps a prose line containing a pipe (or a
    // `status|ACTIVE` code span) from being read as a table.
    const next = lines[i + 1];
    if (line.includes('|') && next != null && RE_DELIM.test(next) && next.includes('-')) {
      const header = splitCells(line);
      const delim = splitCells(next);
      if (header.length === delim.length && header.length > 1) {
        const align = delim.map(alignOf);
        const rows: Inline[][][] = [];
        i += 2;
        while (i < lines.length) {
          const l = lines[i]!;
          if (!l.trim() || RE_FENCE.test(l) || RE_HR.test(l)) break;
          if (!l.includes('|')) break;
          const cells = splitCells(l);
          // GFM: pad short rows, drop the overflow from long ones, so a ragged
          // row can't shift the columns.
          const fixed = Array.from({ length: header.length }, (_, c) => cells[c] ?? '');
          rows.push(fixed.map((c) => parseInline(c)));
          i++;
        }
        blocks.push({
          kind: 'table',
          align,
          header: header.map((c) => parseInline(c)),
          rows,
        });
        continue;
      }
    }

    // 3. Lists. A run ends when the marker type changes, so a bullet list
    // immediately followed by a numbered one stays two blocks.
    if (RE_UL.test(line) || RE_OL.test(line)) {
      const items: ListItem[] = [];
      const ordered = !RE_UL.test(line) && RE_OL.test(line);
      while (i < lines.length) {
        const l = lines[i]!;
        const ul = RE_UL.exec(l);
        const ol = ul ? null : RE_OL.exec(l);
        if ((ul && ordered) || (ol && !ordered)) break;
        if (!ul && !ol) {
          // A plain indented line continues the previous item.
          if (items.length && /^\s{2,}\S/.test(l)) {
            const prev = items[items.length - 1]!;
            prev.inline = parseInline(
              renderPlain(prev.inline) + '\n' + l.trim(),
            );
            i++;
            continue;
          }
          break;
        }
        const m = (ul ?? ol)!;
        const indent = Math.min(2, Math.floor(m[1]!.length / 2)) as 0 | 1 | 2;
        items.push({
          indent,
          marker: ol ? `${ol[2]}.` : indent === 0 ? '•' : '◦',
          inline: parseInline(m[3]!),
        });
        i++;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }

    // 4. Paragraph — consume until a starter line. Newlines are KEPT, matching
    // the web bubble's white-space: pre-wrap, so a soft break inside a sentence
    // survives and `**bold` spanning a line break still closes.
    const para: string[] = [line];
    i++;
    while (i < lines.length && !isStarter(lines[i]!)) {
      // Don't swallow the header row of a table that starts on the next line.
      const after = lines[i + 1];
      if (lines[i]!.includes('|') && after != null && RE_DELIM.test(after) && after.includes('-')) {
        break;
      }
      para.push(lines[i]!);
      i++;
    }
    blocks.push({ kind: 'p', inline: parseInline(para.join('\n')) });
  }

  return blocks;
}

/** Flatten an inline tree back to plain text, for list-item continuation. */
function renderPlain(nodes: Inline[]): string {
  let s = '';
  for (const n of nodes) {
    if (n.t === 'text') s += n.v;
    else if (n.t === 'code') s += '`' + n.v + '`';
    else if (n.t === 'b') s += '**' + renderPlain(n.kids) + '**';
    else if (n.t === 'i') s += '*' + renderPlain(n.kids) + '*';
    else s += '[' + renderPlain(n.kids) + '](' + n.href + ')';
  }
  return s;
}

/**
 * Public entry point. Never throws and never returns an empty list for
 * non-empty input — a mangled reply is bad, a crashed chat screen is worse.
 */
export function parseBlocks(src: string): Block[] {
  // An all-whitespace reply is genuinely nothing to render; the caller shows
  // its own fallback text rather than an empty bubble.
  if (!src || !src.trim()) return [];
  try {
    const blocks = parse(src);
    return blocks.length ? blocks : [{ kind: 'p', inline: [{ t: 'text', v: src }] }];
  } catch {
    return [{ kind: 'p', inline: [{ t: 'text', v: src }] }];
  }
}
