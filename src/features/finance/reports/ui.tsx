import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { ScrollView, TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';
import { ListSkeleton, SectionError } from '@/components/feedback';
import { Icon, InfoTip, KpiRow, SegmentedControl, SelectField, StatCard, Txt, Mono, Button } from '@/components/ui';
import { formatNumber, formatPercent } from '@/lib/formatters';
import {
  PERIODS,
  addMonths,
  day,
  int,
  money,
  moneyBare,
  monthLabel,
  monthsIn,
  pct,
  resolvePeriod,
  ymNow,
  type Period,
  type PeriodId,
} from '@/lib/ledger';
import { useTheme } from '@/theme/ThemeProvider';
import { printReport, shareCsv } from './export';
import type { ColType, CsvCell, ReportExport, SRow, Stack, Statement, Tile } from './types';

// ── export hand-off ─────────────────────────────────────────────────────────
// ReportFrame registers csv()/print() here; the screen's header menu calls them.
export const ReportExportContext = createContext<MutableRefObject<ReportExport | null> | null>(null);

// ── controls ────────────────────────────────────────────────────────────────

/** Period state for a report: a preset, or a custom from/to month. */
export function usePeriod(
  defaultId: PeriodId = 'last-12',
  /** Opens on this instead of `defaultId` (a link from another screen). */
  initial?: { id: PeriodId; from?: string; to?: string },
): [Period, (id: PeriodId, from?: string, to?: string) => void] {
  const [state, setState] = useState<{ id: PeriodId; from?: string; to?: string }>(initial ?? { id: defaultId });
  const period = useMemo(() => resolvePeriod(state.id, state.from, state.to), [state]);
  const set = useCallback((id: PeriodId, from?: string, to?: string) => {
    setState((s) => {
      if (id !== 'custom') return { id };
      // Switching to Custom starts from what the previous preset showed.
      const base = resolvePeriod(s.id, s.from, s.to);
      return { id, from: from ?? s.from ?? base.from, to: to ?? s.to ?? base.to };
    });
  }, []);
  return [period, set];
}

const CELL = { flexGrow: 1, flexBasis: 150 } as const;

/** A labelled menu of choices. An empty id is allowed ("the default"). */
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  full = false,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
  full?: boolean;
}) {
  return (
    <View style={full ? { width: '100%' } : CELL}>
      <SelectField
        label={label}
        value={value}
        options={options.map((o) => ({ label: o.label, value: o.id }))}
        onSelect={(v) => onChange(v as T)}
      />
    </View>
  );
}

/** A short either/or toggle (By month / Cash book), full width. */
export function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
}) {
  return (
    <View style={{ width: '100%' }}>
      <SegmentedControl options={options.map((o) => ({ label: o.label, value: o.id }))} value={value} onChange={onChange} />
    </View>
  );
}

const monthOptions = () => {
  const now = ymNow();
  return monthsIn(addMonths(now, -35), now)
    .reverse()
    .map((m) => ({ id: m, label: monthLabel(m) }));
};

export function PeriodControl({
  period,
  onChange,
  options,
}: {
  period: Period;
  onChange: (id: PeriodId, from?: string, to?: string) => void;
  options?: PeriodId[];
}) {
  const list = PERIODS.filter((p) => !options || options.includes(p.id));
  const months = useMemo(monthOptions, []);
  return (
    <>
      <Choice label="Period" value={period.id} options={list} onChange={(id) => onChange(id)} />
      {period.id === 'custom' && (
        <>
          <Choice label="From" value={period.from} options={months} onChange={(m) => onChange('custom', m, period.to)} />
          <Choice label="To" value={period.to} options={months} onChange={(m) => onChange('custom', period.from, m)} />
        </>
      )}
    </>
  );
}

// ── states ──────────────────────────────────────────────────────────────────

export function ReportState({ loading, error, onRetry }: { loading: boolean; error: boolean; onRetry: () => void }) {
  if (loading) return <ListSkeleton rows={4} />;
  if (error) return <SectionError onRetry={onRetry} message="Couldn't load this report." />;
  return null;
}

export function Empty({ line, action }: { line: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View className="items-center gap-3 rounded-card border border-line bg-surface px-6 py-10">
      <Txt className="text-center text-sub text-muted">{line}</Txt>
      {action && <Button label={action.label} variant="secondary" onPress={action.onPress} />}
    </View>
  );
}

export function Partial({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return (
    <View className="mb-3 rounded-control border border-line bg-raised px-3 py-2">
      <Txt className="text-caption text-muted">Partial figures: {notes.join(', ')}.</Txt>
    </View>
  );
}

/** One reconciliation fact under a statement, e.g. "Ties to 14 payments". */
export function Check({ children, ok = true }: { children: ReactNode; ok?: boolean }) {
  const { colors } = useTheme();
  return (
    <View className="mt-2 flex-row items-start gap-2">
      <View className="mt-0.5">
        {ok ? (
          <Icon name="check" size={14} color={colors.success} strokeWidth={2} />
        ) : (
          <View className="mx-1 mt-1 h-2 w-2 rounded-pill" style={{ backgroundColor: colors.warningDot }} />
        )}
      </View>
      <Txt className="flex-1 text-caption text-muted">{children}</Txt>
    </View>
  );
}

// ── tiles ───────────────────────────────────────────────────────────────────

const whole = (v: number) => Math.round(v);

/** Every money figure a statement shows, in whole rands. */
export function tableFigures(tables?: Statement | Statement[]): Set<number> {
  const out = new Set<number>();
  const list = !tables ? [] : Array.isArray(tables) ? tables : [tables];
  list.forEach((t) =>
    t.rows.forEach((r) => {
      if (r.kind === 'section') return;
      r.cells.forEach((v, i) => {
        const type = i > 0 && r.fmt ? r.fmt : t.columns[i]?.type;
        if (type === 'money' && typeof v === 'number' && Math.abs(v) >= 0.5) out.add(whole(Math.abs(v)));
      });
    }),
  );
  return out;
}

/** Tiles only carry figures the table below does not: a tile whose figure is
 *  already in the table (or in an earlier tile) is left out, and a note that
 *  repeats one is dropped. Nothing renders when no tile is left. */
export function Tiles({ tiles, table }: { tiles: Tile[]; table?: Statement | Statement[] }) {
  const seen = tableFigures(table);
  const kept = tiles.flatMap((t) => {
    if (t.amount != null && (Math.abs(t.amount) < 0.5 || seen.has(whole(Math.abs(t.amount))))) return [];
    if (t.amount != null) seen.add(whole(Math.abs(t.amount)));
    const noteRepeats = t.noteAmount != null && seen.has(whole(Math.abs(t.noteAmount)));
    if (t.noteAmount != null && !noteRepeats) seen.add(whole(Math.abs(t.noteAmount)));
    return [noteRepeats ? { ...t, note: t.noteFallback } : t];
  });
  if (!kept.length) return null;
  return (
    <View className="mb-4">
      <KpiRow>
        {kept.map((t) => (
          <StatCard
            key={t.label}
            label={t.label}
            value={t.value}
            note={t.note}
            tone={t.tone === 'down' ? 'danger' : t.tone === 'up' ? 'success' : undefined}
          />
        ))}
      </KpiRow>
    </View>
  );
}

// ── statement table ─────────────────────────────────────────────────────────

const COL_W: Record<ColType, number> = { text: 150, money: 104, int: 64, pct: 72, date: 96, km: 88 };
const LABEL_W = 128;
const ROW_H = 44;
const HEAD_H = 44;
const SECTION_H = 34;

function cellText(v: CsvCell, type: ColType = 'text', wholeRand = false) {
  if (v === '') return '';
  if (v == null) return type === 'text' ? '' : '—';
  // Only ISO dates are formatted; a label such as "Total" in a date column stays as written.
  if (typeof v === 'string') return type === 'date' && /^\d{4}-\d{2}-\d{2}/.test(v) ? day(v) : v;
  switch (type) {
    case 'money':
      return moneyBare(Math.abs(v) < 0.005 ? 0 : v, wholeRand);
    case 'int':
      return int(v);
    case 'pct':
      return pct(v);
    case 'km':
      return `${formatNumber(v)} km`;
    default:
      return String(v);
  }
}

/** Row look by kind: label weight, background and a rule above totals. */
function rowLook(kind: SRow['kind'], colors: ReturnType<typeof useTheme>['colors']) {
  switch (kind) {
    case 'subtotal':
      return { weight: '600' as const, bg: undefined, top: true, color: colors.fg, italic: false };
    case 'total':
      return { weight: '700' as const, bg: undefined, top: true, color: colors.fg, italic: false };
    case 'grand':
      return { weight: '700' as const, bg: colors.raised, top: true, color: colors.fg, italic: false };
    case 'muted':
      return { weight: '400' as const, bg: undefined, top: false, color: colors.faint, italic: false };
    case 'ratio':
      return { weight: '400' as const, bg: undefined, top: false, color: colors.muted, italic: true };
    default:
      return { weight: '400' as const, bg: undefined, top: false, color: colors.fg, italic: false };
  }
}

function StackList({ table, stack, caption }: { table: Statement; stack: Stack; caption: string }) {
  const { colors } = useTheme();
  const { columns, rows } = table;
  const shown = (v: CsvCell, i: number) => cellText(v, columns[i]?.type);
  // Pairs leave out empty and zero cells (an age bucket with nothing in it).
  const has = (v: CsvCell) => v !== '' && v != null && !(typeof v === 'number' && Math.abs(v) < 0.005);
  const list = rows.filter((r) => r.kind !== 'section');

  if (stack === 'pairs') {
    return (
      <View accessibilityLabel={caption}>
        {list.map((r) => (
          <View key={r.key} className="border-b border-line px-4 py-3" accessibilityRole="summary">
            <Txt className="mb-1 text-body font-medium">{shown(r.cells[0], 0)}</Txt>
            {r.cells.slice(1).map((v, j) => {
              const i = j + 1;
              if (!has(v)) return null;
              const last = i === r.cells.length - 1;
              return (
                <View key={i} className="flex-row justify-between py-0.5">
                  <Txt className="text-caption text-muted">{columns[i]?.label}</Txt>
                  <Mono className="text-caption" style={last ? { fontWeight: '700' } : undefined}>
                    {shown(v, i)}
                  </Mono>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    );
  }

  const amt = (v: CsvCell) => (typeof v === 'number' && Math.abs(v) >= 0.005 ? v : null);
  return (
    <View accessibilityLabel={caption}>
      {list.map((r) => {
        const plus = amt(r.cells[stack.plus]);
        const minus = amt(r.cells[stack.minus]);
        const bal = r.cells[stack.balance];
        const title = shown(r.cells[stack.title], stack.title) || shown(r.cells[0], 0);
        if (r.kind === 'grand' || r.kind === 'subtotal') {
          // A totals row is named by its first text cell that is not a date ("Total", "Closing balance").
          const isName = (v: CsvCell) => typeof v === 'string' && v !== '' && !/^\d{4}-\d{2}-\d{2}/.test(v);
          const name = [r.cells[0], r.cells[stack.title]].find(isName) ?? title;
          const parts = [
            plus != null ? `${columns[stack.plus]?.label} ${money(plus)}` : '',
            minus != null ? `${columns[stack.minus]?.label} ${money(minus)}` : '',
          ].filter(Boolean);
          return (
            <View key={r.key} className="border-b border-line bg-raised px-4 py-3">
              <View className="flex-row items-center justify-between">
                <Txt className="text-body font-semibold">{name}</Txt>
                <Mono className="text-body font-semibold">{shown(bal, stack.balance)}</Mono>
              </View>
              {parts.length > 0 && <Txt className="mt-0.5 text-caption text-muted">{parts.join(' · ')}</Txt>}
            </View>
          );
        }
        const ref = stack.ref != null ? shown(r.cells[stack.ref], stack.ref) : '';
        const body = (
          <View className="min-h-[44px] border-b border-line px-4 py-2.5">
            <View className="flex-row items-start justify-between gap-3">
              <Txt className="flex-1 text-body" numberOfLines={2}>
                {title}
              </Txt>
              <Mono className="text-body" style={minus != null ? { color: colors.success } : undefined}>
                {plus != null ? money(plus) : minus != null ? `−${money(minus)}` : ''}
              </Mono>
            </View>
            <View className="mt-0.5 flex-row justify-between">
              <Txt className="text-caption text-muted">{shown(r.cells[stack.date], stack.date)}</Txt>
              <Txt className="text-caption text-muted">
                {stack.balanceLabel} {shown(bal, stack.balance)}
              </Txt>
            </View>
            {ref ? (
              <Txt className="mt-0.5 text-caption" style={{ color: r.onPress ? colors.accent : colors.faint }}>
                {ref}
              </Txt>
            ) : null}
          </View>
        );
        return r.onPress ? (
          <TouchableOpacity key={r.key} activeOpacity={0.6} onPress={r.onPress} accessibilityRole="button">
            {body}
          </TouchableOpacity>
        ) : (
          <View key={r.key}>{body}</View>
        );
      })}
    </View>
  );
}

/**
 * A statement as a table: the first column stays put while the rest scroll
 * sideways (and, with `pinLast`, the Total column stays on the right). Columns
 * flagged `phone: false` are left out. `stack` shows it as a list instead.
 */
export function StatementTable({
  table,
  caption,
  footer,
  fit = false,
  pinLast = false,
  stack,
}: {
  table: Statement;
  caption: string;
  footer?: ReactNode;
  /** Month statements: whole rands instead of cents, so a wide table stays readable. */
  fit?: boolean;
  /** Keep the last column (Total) in view on the right while the rest scroll. */
  pinLast?: boolean;
  /** Show as a stacked list (cash book, customer statement) instead of a table. */
  stack?: Stack;
}) {
  const { colors } = useTheme();
  const [avail, setAvail] = useState(0);
  const visible = useMemo(
    () => table.columns.map((c, i) => ({ c, i })).filter(({ c, i }) => i === 0 || c.phone !== false),
    [table.columns],
  );
  const hasMoney = visible.some(({ c }) => c.type === 'money');
  const last = pinLast && visible.length > 2 ? visible[visible.length - 1] : null;
  const mid = visible.slice(1, last ? -1 : undefined);
  const base = (c: { type?: ColType }) => COL_W[c.type ?? 'text'] - (fit && c.type === 'money' ? 16 : 0);
  const midSum = mid.reduce((s, { c }) => s + base(c), 0);
  // Spare room is shared out so a narrow table still reaches the right edge.
  const scale = avail > 0 && midSum > 0 ? Math.max(1, avail / midSum) : 1;
  const w = (c: { type?: ColType }) => Math.floor(base(c) * scale);
  const lastW = last ? base(last.c) : 0;

  const onLayout = (e: LayoutChangeEvent) => setAvail(e.nativeEvent.layout.width);

  const units = fit && hasMoney
    ? 'Amounts in rand, rounded to the nearest rand. Export CSV has the cents.'
    : hasMoney
      ? 'Amounts in rand.'
      : null;

  if (stack) {
    return (
      <View className="mb-4 overflow-hidden rounded-card border border-line bg-surface">
        <StackList table={table} stack={stack} caption={caption} />
        {(footer || units) && <View className="px-4 py-3">{footer}</View>}
      </View>
    );
  }

  const heightOf = (r: SRow) => (r.kind === 'section' ? SECTION_H : ROW_H);

  const cellNode = (r: SRow, i: number, width: number, key: string | number) => {
    const type = i > 0 && r.fmt ? r.fmt : table.columns[i]?.type;
    const v = r.cells[i];
    const numeric = !!type && type !== 'text' && type !== 'date';
    const look = rowLook(r.kind, colors);
    const flag = r.flags?.[i];
    const neg = typeof v === 'number' && v < -0.004 && type === 'money';
    const zero = typeof v === 'number' && Math.abs(v) < 0.005 && type === 'money';
    const text = cellText(v, type, fit);
    return (
      <View
        key={key}
        style={{ width, height: heightOf(r), justifyContent: 'center', paddingHorizontal: 8 }}
      >
        <Mono
          numberOfLines={2}
          style={{
            fontSize: 13,
            lineHeight: 17,
            textAlign: numeric ? 'right' : 'left',
            fontWeight: look.weight,
            fontStyle: flag?.est || look.italic ? 'italic' : 'normal',
            color: neg ? colors.danger : zero || flag?.est ? colors.faint : look.color,
          }}
        >
          {text}
          {flag?.est && v != null && v !== '' ? ' est.' : ''}
        </Mono>
      </View>
    );
  };

  const rowShell = (r: SRow, children: ReactNode, key: string) => {
    const look = rowLook(r.kind, colors);
    const sec = r.kind === 'section';
    const style = {
      flexDirection: 'row' as const,
      height: heightOf(r),
      backgroundColor: sec ? colors.raised : look.bg,
      borderTopWidth: look.top ? 1 : 0,
      borderTopColor: colors.lineActive,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    };
    return r.onPress ? (
      <TouchableOpacity key={key} activeOpacity={0.6} onPress={r.onPress} accessibilityRole="button" style={style}>
        {children}
      </TouchableOpacity>
    ) : (
      <View key={key} style={style}>
        {children}
      </View>
    );
  };

  const head = (width: number, c: { label: string; type?: ColType }, i: number) => (
    <View key={i} style={{ width, height: HEAD_H, justifyContent: 'center', paddingHorizontal: 8 }}>
      <Mono
        numberOfLines={2}
        style={{
          fontSize: 12,
          lineHeight: 15,
          fontWeight: '600',
          color: colors.muted,
          textAlign: c.type && c.type !== 'text' && c.type !== 'date' ? 'right' : 'left',
        }}
      >
        {c.label}
      </Mono>
    </View>
  );

  const labelCell = (r: SRow) => {
    const look = rowLook(r.kind, colors);
    const sec = r.kind === 'section';
    return (
      <View style={{ width: LABEL_W, height: heightOf(r), justifyContent: 'center', paddingLeft: r.indent ? 20 : 12, paddingRight: 8 }}>
        <Txt
          numberOfLines={sec ? 1 : 2}
          style={{
            fontSize: 13,
            lineHeight: 17,
            fontWeight: sec ? '700' : look.weight,
            fontStyle: look.italic ? 'italic' : 'normal',
            color: r.onPress ? colors.accent : look.color,
          }}
        >
          {cellText(r.cells[0], table.columns[0]?.type)}
        </Txt>
      </View>
    );
  };

  return (
    <View className="mb-4 overflow-hidden rounded-card border border-line bg-surface" accessibilityLabel={caption}>
      <View style={{ flexDirection: 'row' }}>
        {/* pinned first column */}
        <View style={{ width: LABEL_W, borderRightWidth: 1, borderRightColor: colors.line, backgroundColor: colors.surface, zIndex: 1 }}>
          <View style={{ height: HEAD_H, borderBottomWidth: 1, borderBottomColor: colors.lineActive }}>
            {head(LABEL_W, { label: visible[0]?.c.label ?? '', type: 'text' }, 0)}
          </View>
          {table.rows.map((r) => {
            const sec = r.kind === 'section';
            const look = rowLook(r.kind, colors);
            const style = {
              height: heightOf(r),
              backgroundColor: sec ? colors.raised : look.bg,
              borderTopWidth: look.top ? 1 : 0,
              borderTopColor: colors.lineActive,
              borderBottomWidth: 1,
              borderBottomColor: colors.line,
            };
            return r.onPress ? (
              <TouchableOpacity key={r.key} activeOpacity={0.6} onPress={r.onPress} accessibilityRole="button" style={style}>
                {labelCell(r)}
              </TouchableOpacity>
            ) : (
              <View key={r.key} style={style}>
                {labelCell(r)}
              </View>
            );
          })}
        </View>

        {/* scrolling middle columns */}
        <View style={{ flex: 1 }} onLayout={onLayout}>
          <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator>
            <View>
              <View style={{ flexDirection: 'row', height: HEAD_H, borderBottomWidth: 1, borderBottomColor: colors.lineActive }}>
                {mid.map(({ c, i }) => head(w(c), c, i))}
              </View>
              {table.rows.map((r) =>
                rowShell(
                  r,
                  r.kind === 'section' ? (
                    <View style={{ width: mid.reduce((s, { c }) => s + w(c), 0), height: SECTION_H }} />
                  ) : (
                    mid.map(({ c, i }) => cellNode(r, i, w(c), i))
                  ),
                  r.key,
                ),
              )}
            </View>
          </ScrollView>
        </View>

        {/* pinned Total column */}
        {last && (
          <View style={{ width: lastW, borderLeftWidth: 1, borderLeftColor: colors.line, backgroundColor: colors.surface }}>
            <View style={{ height: HEAD_H, borderBottomWidth: 1, borderBottomColor: colors.lineActive }}>
              {head(lastW, last.c, last.i)}
            </View>
            {table.rows.map((r) => {
              const look = rowLook(r.kind, colors);
              const sec = r.kind === 'section';
              return (
                <View
                  key={r.key}
                  style={{
                    height: heightOf(r),
                    backgroundColor: sec ? colors.raised : look.bg,
                    borderTopWidth: look.top ? 1 : 0,
                    borderTopColor: colors.lineActive,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.line,
                  }}
                >
                  {!sec && cellNode(r, last.i, lastW, 'last')}
                </View>
              );
            })}
          </View>
        )}
      </View>
      {(footer || units) && (
        <View className="gap-1 px-4 py-3">
          {units && <Txt className="text-caption text-faint">{units}</Txt>}
          {footer}
        </View>
      )}
    </View>
  );
}

// ── frame ───────────────────────────────────────────────────────────────────

/**
 * Every report's page body: controls, the sub line (with its ⓘ), tiles, the
 * statement(s) as children, and the gaps list. Registers Export CSV and Print
 * with the screen's header menu through ReportExportContext.
 */
export function ReportFrame({
  title,
  sub,
  info,
  controls,
  tiles,
  table,
  gaps,
  csv,
  csvName,
  companyName,
  children,
}: {
  title: string;
  /** One line: what the figures are (max 8 words). */
  sub: string;
  /** Methodology lines behind the ⓘ. */
  info?: string[];
  controls?: ReactNode;
  tiles?: Tile[];
  /** The statement(s) the tiles are checked against, so a figure is not shown twice. */
  table?: Statement | Statement[];
  gaps?: string[];
  csv: () => CsvCell[][];
  csvName?: string;
  companyName?: string;
  children: ReactNode;
}) {
  const reg = useContext(ReportExportContext);
  const latest = useRef({ csv, csvName, title, sub, companyName });
  latest.current = { csv, csvName, title, sub, companyName };
  useEffect(() => {
    if (!reg) return undefined;
    reg.current = {
      csv: () => {
        const l = latest.current;
        void shareCsv(l.csvName || l.title, l.csv());
      },
      print: () => {
        const l = latest.current;
        void printReport({ company: l.companyName, title: l.title, sub: l.sub, lines: l.csv() });
      },
    };
    return () => {
      reg.current = null;
    };
  }, [reg]);

  return (
    <View>
      {controls ? <View className="mb-3 flex-row flex-wrap gap-3">{controls}</View> : null}
      <View className="mb-4 flex-row items-center gap-2">
        <Txt className="flex-1 text-caption text-faint">{sub}</Txt>
        {info && info.length > 0 && <InfoTip label="About this report" text={info.join('\n\n')} />}
      </View>
      {tiles && tiles.length > 0 && <Tiles tiles={tiles} table={table} />}
      {children}
      {gaps && gaps.length > 0 && (
        <View className="gap-1">
          {gaps.map((g) => (
            <Txt key={g} className="text-caption text-faint">
              {g}
            </Txt>
          ))}
        </View>
      )}
    </View>
  );
}

/** "+12,4% vs …" for a tile; undefined when there is nothing to compare. */
export function changeText(now: number, before: number, label: string, higherIsGood = true): Pick<Tile, 'note' | 'tone'> | undefined {
  if (Math.abs(before) < 0.005) return undefined;
  const c = ((now - before) / Math.abs(before)) * 100;
  const sign = c > 0 ? '+' : c < 0 ? '−' : '';
  const tone = Math.abs(c) < 0.05 ? undefined : (c > 0) === higherIsGood ? 'up' : 'down';
  return { note: `${sign}${formatPercent(Math.abs(c), 1)} vs ${label}`, tone };
}

