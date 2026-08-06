import type { Inline } from './types';

// Inline tokenizer: a match-or-literal scanner.
//
// The invariant that makes it safe: at every position we either match a complete
// construct, or we emit exactly one character as literal text and advance by
// one. So an unclosed `**` can't mangle the rest of the reply and the loop can't
// hang — the index always moves forward.
//
// Deliberately absent: `_` and `__` emphasis. The copilot quotes real column and
// field names constantly (`net_payout_zar`, `total_face_value_zar` are in this
// very codebase), and underscore emphasis would render those as
// net<i>payout</i>zar. GPT and Claude both emit `**` for bold anyway.

const SPECIALS = new Set(['`', '*', '[', '\\', '&', '<']);

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Emphasis bodies recurse; cap the depth so pathological input can't blow up. */
const MAX_DEPTH = 3;

export function parseInline(src: string, depth = 0): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  let i = 0;

  const flush = () => {
    if (buf) {
      out.push({ t: 'text', v: buf });
      buf = '';
    }
  };

  while (i < src.length) {
    const ch = src[i]!;

    if (!SPECIALS.has(ch)) {
      // Fast path: run forward to the next interesting character.
      let j = i + 1;
      while (j < src.length && !SPECIALS.has(src[j]!)) j++;
      buf += src.slice(i, j);
      i = j;
      continue;
    }

    // Backslash escape — the next character is always literal.
    if (ch === '\\' && i + 1 < src.length) {
      buf += src[i + 1];
      i += 2;
      continue;
    }

    // HTML entity, and <br> as a line break. Other tags stay literal: the
    // copilot occasionally emits &amp; or &#39; from quoted customer names.
    if (ch === '&') {
      const m = /^&(#\d{1,6}|#[xX][0-9a-fA-F]{1,5}|[a-zA-Z]{2,6});/.exec(src.slice(i));
      const decoded = m ? decodeEntity(m[1]!) : null;
      if (decoded != null) {
        buf += decoded;
        i += m![0].length;
        continue;
      }
      buf += ch;
      i += 1;
      continue;
    }
    if (ch === '<') {
      const m = /^<br\s*\/?>/i.exec(src.slice(i));
      if (m) {
        buf += '\n';
        i += m[0].length;
        continue;
      }
      buf += ch;
      i += 1;
      continue;
    }

    // Inline code. Matched FIRST and by backtick-run length, so a `|` or a `*`
    // inside a code span is inert — that is what stops `status|ACTIVE` from
    // being read as table syntax and `a*b` from becoming italic.
    if (ch === '`') {
      let runLen = 0;
      while (src[i + runLen] === '`') runLen++;
      const fence = '`'.repeat(runLen);
      const close = src.indexOf(fence, i + runLen);
      if (close !== -1) {
        flush();
        out.push({ t: 'code', v: src.slice(i + runLen, close).trim() });
        i = close + runLen;
        continue;
      }
      buf += ch;
      i += 1;
      continue;
    }

    // Bold then italic. Requires a non-space immediately inside, so arithmetic
    // like `2 * 3 * 4` and a bare `*` stay literal.
    if (ch === '*' && depth < MAX_DEPTH) {
      const bold = src.startsWith('**', i);
      const marker = bold ? '**' : '*';
      const body = matchDelimited(src, i, marker);
      if (body != null) {
        flush();
        out.push(
          bold
            ? { t: 'b', kids: parseInline(body, depth + 1) }
            : { t: 'i', kids: parseInline(body, depth + 1) },
        );
        i += marker.length * 2 + body.length;
        continue;
      }
      buf += ch;
      i += 1;
      continue;
    }

    // Link. Nested brackets in the label are not supported; a `]` closes it.
    if (ch === '[') {
      const m = /^\[([^\]]*)\]\(\s*([^\s)]+)[^)]*\)/.exec(src.slice(i));
      if (m) {
        flush();
        out.push({
          t: 'link',
          href: m[2]!,
          kids: depth < MAX_DEPTH ? parseInline(m[1]!, depth + 1) : [{ t: 'text', v: m[1]! }],
        });
        i += m[0].length;
        continue;
      }
      buf += ch;
      i += 1;
      continue;
    }

    buf += ch;
    i += 1;
  }

  flush();
  return out;
}

function decodeEntity(name: string): string | null {
  if (name.startsWith('#')) {
    const hex = name[1] === 'x' || name[1] === 'X';
    const code = parseInt(hex ? name.slice(2) : name.slice(1), hex ? 16 : 10);
    if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return null;
    try {
      return String.fromCodePoint(code);
    } catch {
      return null;
    }
  }
  return ENTITIES[name.toLowerCase()] ?? null;
}

/**
 * Body of `marker…marker` starting at `i`, or null if there is no valid closer.
 * Requires a non-space just inside each end, which is what keeps `2 * 3` literal.
 */
function matchDelimited(src: string, i: number, marker: string): string | null {
  const start = i + marker.length;
  if (start >= src.length) return null;
  if (/\s/.test(src[start]!)) return null;

  let search = start;
  for (;;) {
    const close = src.indexOf(marker, search);
    if (close === -1 || close === start) return null;
    // For a single `*`, a `**` at this position belongs to a bold run.
    if (marker === '*' && src[close + 1] === '*') {
      search = close + 2;
      continue;
    }
    if (/\s/.test(src[close - 1]!)) {
      search = close + marker.length;
      continue;
    }
    return src.slice(start, close);
  }
}

/** Plain-text length, used to cost a block for the reveal timeline. */
export function inlineLength(nodes: Inline[]): number {
  let n = 0;
  for (const node of nodes) {
    if (node.t === 'text' || node.t === 'code') n += node.v.length;
    else n += inlineLength(node.kids);
  }
  return n;
}

/**
 * The first `count` characters of an inline tree, keeping structure intact.
 *
 * Truncating the TOKENS rather than the raw markdown is the whole point: slicing
 * the source string flashes `**Tot` before the bold closes, which is why the web
 * app gave up and skipped animation for anything markdown-ish.
 */
export function sliceInline(nodes: Inline[], count: number): Inline[] {
  if (count <= 0) return [];
  const out: Inline[] = [];
  let left = count;
  for (const node of nodes) {
    if (left <= 0) break;
    if (node.t === 'text' || node.t === 'code') {
      const v = cut(node.v, left);
      left -= v.length;
      out.push({ ...node, v });
    } else {
      const inner = sliceInline(node.kids, left);
      left -= inlineLength(inner);
      out.push({ ...node, kids: inner });
    }
  }
  return out;
}

/**
 * Take `n` UTF-16 units, but never end on a lone high surrogate — half an emoji
 * renders as U+FFFD for a frame, and the copilot does use them.
 *
 * Counted in UTF-16 units, the same unit inlineLength uses, so the reveal's
 * character accounting stays exact.
 */
function cut(s: string, n: number): string {
  if (n >= s.length) return s;
  if (n <= 0) return '';
  const last = s.charCodeAt(n - 1);
  const splitsPair = last >= 0xd800 && last <= 0xdbff;
  return s.slice(0, splitsPair ? n - 1 : n);
}
