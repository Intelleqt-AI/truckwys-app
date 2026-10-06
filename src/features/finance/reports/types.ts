// Shared shapes for the Finance > Reports statements. Port of the web's
// components/reports/ui.tsx types: a report builds one or more `Statement`s
// (columns + typed rows) and the table, CSV export and print all read them.

export type CsvCell = string | number | null | undefined;

export type ReportId =
  | 'pl'
  | 'sales'
  | 'cash'
  | 'debtors'
  | 'statement'
  | 'customers'
  | 'lanes'
  | 'margin'
  | 'expenses'
  | 'vat';

export type ColType = 'text' | 'money' | 'int' | 'pct' | 'date' | 'km';

export interface Col {
  label: string;
  type?: ColType;
  /** false: left out on the phone (a secondary column). The CSV keeps it. */
  phone?: boolean;
}

export type RowKind = 'section' | 'row' | 'subtotal' | 'total' | 'grand' | 'muted' | 'ratio';

/** A modelled (not recorded) figure: drawn muted and italic with an "est." tag. */
export interface CellFlag {
  est?: boolean;
  title?: string;
}

export interface SRow {
  key: string;
  kind?: RowKind;
  cells: CsvCell[];
  /** Tapping the row (its first cell) opens something, e.g. a customer statement. */
  onPress?: () => void;
  indent?: boolean;
  /** Overrides the column type for number cells (e.g. a margin-% row). */
  fmt?: ColType;
  /** Per-cell flags by column index (estimates). */
  flags?: Record<number, CellFlag>;
}

export interface Statement {
  columns: Col[];
  rows: SRow[];
}

/**
 * How a statement becomes a stacked list instead of a sideways-scrolling table.
 * 'pairs': each row is a heading plus one label/value line per column.
 * A ledger spec: one line per entry (date + what it is, the amount on the
 * right), the reference and running balance under it.
 */
export type Stack =
  | 'pairs'
  | {
      date: number;
      title: number;
      ref?: number;
      /** Column added to the balance (shown as is) and taken off it (shown with a minus). */
      plus: number;
      minus: number;
      balance: number;
      balanceLabel: string;
    };

export interface Tile {
  label: string;
  value: string;
  note?: string;
  tone?: 'up' | 'down';
  /** The money figure the tile shows, so a figure already in the table is not repeated. */
  amount?: number;
  /** The money figure inside the note, if any (same rule). */
  noteAmount?: number;
  /** Shown instead of the note when the note's figure is already on the page. */
  noteFallback?: string;
}

/** What a report registers so the screen's header menu can export or print it. */
export interface ReportExport {
  csv: () => void;
  print: () => void;
}
