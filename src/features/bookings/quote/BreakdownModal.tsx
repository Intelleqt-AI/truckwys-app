import { memo, type ReactNode } from 'react';
import { View, TouchableOpacity, Modal } from 'react-native';
import { Button, Label, Txt, Mono } from '@/components/ui';

export type BreakdownRow = { label: string; value: string; bold?: boolean; tone?: 'danger' | 'muted' };

/**
 * The shell every quote breakdown modal shares: a title, label/value rows, an
 * optional total and one short note. Tap outside or Close to dismiss.
 */
function BreakdownModalImpl({
  visible,
  onClose,
  title,
  rows,
  total,
  note,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  rows: BreakdownRow[];
  total?: BreakdownRow | null;
  note?: string | null;
  children?: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        activeOpacity={1}
        className="flex-1 justify-center bg-backdrop px-6"
        onPress={onClose}
        accessibilityLabel="Close"
      >
        <TouchableOpacity activeOpacity={1} className="rounded-panel border border-line bg-elevated p-4" onPress={() => {}}>
          <Label className="mb-2 text-muted">{title}</Label>
          {rows.map((r, i) => (
            <Line key={`${r.label}-${i}`} row={r} />
          ))}
          {children}
          {total && (
            <View className="mt-2 flex-row items-center justify-between gap-3">
              <Txt className="shrink text-callout font-semibold text-fg">{total.label}</Txt>
              <Mono className="shrink-0 text-callout font-semibold text-fg">{total.value}</Mono>
            </View>
          )}
          {note ? <Txt className="mt-3 text-caption text-faint">{note}</Txt> : null}
          <Button label="Close" variant="secondary" onPress={onClose} fullWidth className="mt-4" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

export function Line({ row }: { row: BreakdownRow }) {
  const tone = row.tone === 'danger' ? 'text-danger' : row.tone === 'muted' ? 'text-muted' : 'text-fg';
  return (
    <View className="min-h-[36px] flex-row items-center justify-between gap-3 border-b border-line-row py-1.5">
      <Txt className={`shrink text-sub ${row.bold ? 'font-semibold text-fg' : 'text-muted'}`} numberOfLines={2}>
        {row.label}
      </Txt>
      <Mono className={`shrink-0 text-sub ${row.bold ? 'font-semibold' : ''} ${tone}`}>{row.value}</Mono>
    </View>
  );
}

export const BreakdownModal = memo(BreakdownModalImpl);
