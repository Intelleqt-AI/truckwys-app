import { memo, type ReactNode } from 'react';
import { View, TouchableOpacity, Modal } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Button, Icon, Label, TextField, Txt, Mono } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

export type BreakdownRow = { label: string; value: string; bold?: boolean; tone?: 'danger' | 'muted' };

/** The line's editable figure, when the line can be changed on this quote. */
export interface BreakdownEdit {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  /** "Route R 850": one tap back to the worked-out figure. */
  back?: { label: string; onPress: () => void } | null;
}

/**
 * The shell every quote breakdown modal shares: a title, label/value rows, an
 * optional edit field, an optional total and one short note.
 */
function BreakdownModalImpl({
  visible,
  onClose,
  title,
  rows,
  total,
  note,
  edit,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  rows: BreakdownRow[];
  total?: BreakdownRow | null;
  note?: string | null;
  edit?: BreakdownEdit | null;
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <TouchableOpacity
          activeOpacity={1}
          className="flex-1 justify-center bg-backdrop px-6"
          onPress={onClose}
          accessibilityLabel="Close"
        >
          <TouchableOpacity
            activeOpacity={1}
            className="rounded-panel border border-line bg-elevated p-4"
            onPress={() => {}}
          >
            <Label className="mb-2 text-muted">{title}</Label>
            {rows.map((r, i) => (
              <Line key={`${r.label}-${i}`} row={r} />
            ))}
            {children}
            {total && (
              <View className="mt-2 flex-row items-center justify-between gap-3">
                <Txt className="shrink text-callout font-semibold text-fg">{total.label}</Txt>
                <Mono
                  className={`shrink-0 text-callout font-semibold ${total.tone === 'danger' ? 'text-danger' : 'text-fg'}`}
                >
                  {total.value}
                </Mono>
              </View>
            )}
            {edit && (
              <View className="mt-4">
                <TextField
                  label={edit.label}
                  prefix="R"
                  placeholder={edit.placeholder ?? '0'}
                  keyboardType="decimal-pad"
                  value={edit.value}
                  onChangeText={edit.onChangeText}
                />
                {edit.back && (
                  <TouchableOpacity
                    activeOpacity={0.6}
                    onPress={edit.back.onPress}
                    accessibilityRole="button"
                    accessibilityLabel={`Use ${edit.back.label}`}
                    className="mt-1 min-h-[44px] flex-row items-center gap-1 self-start"
                  >
                    <Icon name="refresh" size={13} color={colors.link} />
                    <Mono className="text-sub text-link">{edit.back.label}</Mono>
                  </TouchableOpacity>
                )}
              </View>
            )}
            {note ? <Txt className="mt-3 text-caption text-faint">{note}</Txt> : null}
            <Button label={edit ? 'Done' : 'Close'} variant="secondary" onPress={onClose} fullWidth className="mt-4" />
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAvoidingView>
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
