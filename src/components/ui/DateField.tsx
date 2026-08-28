import { useState } from 'react';
import { View, Pressable, Modal, Platform } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt, Mono, Label, FieldLabel } from './Text';
import { Icon } from './icons';
import { FieldMessage } from './forms';
import { useTheme } from '@/theme/ThemeProvider';
import { status as statusHues, motion } from '@/theme/tokens';
import { formatDate } from '@/lib/formatters';

// Date picker field. Stores/returns an ISO `YYYY-MM-DD` string so payloads are
// unchanged; displays it human-readably. iOS uses a spinner in a sheet with
// Done; Android uses the native dialog.
function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function DateField({
  label,
  value,
  onChange,
  placeholder = 'Select date',
  maximumDate,
  minimumDate,
  required,
  error,
  warning,
}: {
  label?: string;
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  /** Blocks later dates in the picker (e.g. a payment can't be in the future). */
  maximumDate?: Date;
  /** Blocks earlier dates (e.g. an invoice due date can't be in the past). */
  minimumDate?: Date;
  /** Renders a danger-coloured * after the label. Presentational only. */
  required?: boolean;
  error?: string;
  /** Amber advisory message — shown only when `error` is absent, never blocks. */
  warning?: string;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const parsed = value ? new Date(value) : new Date();
  let current = isNaN(parsed.getTime()) ? new Date() : parsed;
  // Clamp the spinner's opening position into [minimumDate, maximumDate].
  // Needed once a field like Licence expiry gets a minimumDate of today but
  // the stored value is a real already-expired date — without this the wheel
  // would open sitting on an out-of-range date. Only affects what the wheel
  // shows and what an untouched "Done" tap writes back; the stored value
  // itself is left alone until someone actually opens the picker to change it.
  if (minimumDate && current < minimumDate) current = minimumDate;
  if (maximumDate && current > maximumDate) current = maximumDate;

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: withTiming(error ? statusHues.danger : warning ? statusHues.warning : colors.line, {
      duration: motion.fast,
    }),
  }));

  return (
    <View>
      <FieldLabel label={label} required={required} />
      <Pressable onPress={() => setOpen(true)}>
        <Animated.View
          className="min-h-[48px] flex-row items-center gap-2 rounded-xs border bg-surface px-3"
          style={borderStyle}
        >
          <Icon name="calendar" size={17} color={value ? colors.accent : colors.faint} />
          <Txt className={`flex-1 text-body ${value ? 'text-fg' : 'text-faint'}`}>
            {value ? formatDate(value) : placeholder}
          </Txt>
          {value ? (
            <Pressable hitSlop={10} onPress={() => onChange('')}>
              <Icon name="x" size={15} color={colors.faint} />
            </Pressable>
          ) : null}
        </Animated.View>
      </Pressable>
      <FieldMessage error={error} warning={warning} />

      {open && Platform.OS === 'ios' && (
        <Modal transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable className="flex-1 justify-end bg-black/60" onPress={() => setOpen(false)}>
            <Pressable
              className="bg-elevated"
              style={{ paddingBottom: insets.bottom + 8 }}
              onPress={(e) => e.stopPropagation()}
            >
              <View className="flex-row items-center justify-between border-b border-line px-4 py-3">
                <Label className="text-muted">{label ?? 'Date'}</Label>
                {/* Done commits the date on screen. The picker's onChange only
                    fires when the wheel actually MOVES, so without this, opening
                    the sheet and tapping Done straight away selected nothing —
                    the user had to scroll off today and back to pick it.
                    Idempotent: if they did scroll, onChange already wrote the
                    value and `current` re-derived from it, so this writes the
                    same string again. */}
                <Pressable
                  hitSlop={8}
                  onPress={() => {
                    onChange(toISODate(current));
                    setOpen(false);
                  }}
                >
                  <Mono className="text-micro uppercase tracking-wide text-accent">Done</Mono>
                </Pressable>
              </View>
              <DateTimePicker
                value={current}
                mode="date"
                display="spinner"
                textColor={colors.fg}
                maximumDate={maximumDate}
                minimumDate={minimumDate}
                onChange={(_e: DateTimePickerEvent, d?: Date) => d && onChange(toISODate(d))}
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {open && Platform.OS !== 'ios' && (
        <DateTimePicker
          value={current}
          mode="date"
          display="default"
          maximumDate={maximumDate}
          minimumDate={minimumDate}
          onChange={(e: DateTimePickerEvent, d?: Date) => {
            setOpen(false);
            // Android's dialog reports Cancel as type 'dismissed' but still
            // hands back a date, so writing on any callback set a date the user
            // had just cancelled.
            if (e.type === 'set' && d) onChange(toISODate(d));
          }}
        />
      )}
    </View>
  );
}
