// Token shapes shared by the tokenizers and the renderer.
//
// Deliberately a small closed set, not CommonMark. The producer is one LLM whose
// system prompt asks for tables and bold — see core/services/agent.py:948 — so
// the subset is: bold, italic, inline code, fenced code, h1-h3, bullet and
// ordered lists, links, GFM tables, rules and blockquotes.

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'b'; kids: Inline[] }
  | { t: 'i'; kids: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; kids: Inline[] };

export type Align = 'left' | 'center' | 'right';

export interface ListItem {
  /** Nesting depth, clamped to 2 — deeper indents render at depth 2. */
  indent: 0 | 1 | 2;
  /** Rendered marker: a bullet glyph, or "3." for an ordered item. */
  marker: string;
  inline: Inline[];
}

export type Block =
  | { kind: 'p'; inline: Inline[] }
  | { kind: 'quote'; inline: Inline[] }
  | { kind: 'h'; level: 1 | 2 | 3; inline: Inline[] }
  | { kind: 'list'; ordered: boolean; items: ListItem[] }
  | { kind: 'code'; lang?: string; text: string }
  | { kind: 'table'; align: Align[]; header: Inline[][]; rows: Inline[][][] }
  | { kind: 'hr' };

/** Blocks that reveal as a unit rather than character by character. */
export const isAtomic = (b: Block): boolean =>
  b.kind === 'table' || b.kind === 'code' || b.kind === 'hr';
