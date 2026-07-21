import { useState } from 'react';
import { View, Pressable, Modal, Platform } from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt, Mono, Label } from './Text';
import { Icon } from './icons';
import { useTheme } from '@/theme/ThemeProvider';
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
}: {
  label?: string;
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const parsed = value ? new Date(value) : new Date();
  const current = isNaN(parsed.getTime()) ? new Date() : parsed;

  return (
    <View>
      {label && <Label className="mb-1.5 text-muted">{label}</Label>}
      <Pressable
        onPress={() => setOpen(true)}
        className="min-h-[48px] flex-row items-center gap-2 rounded-xs border border-line bg-surface px-3"
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
      </Pressable>

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
                <Pressable hitSlop={8} onPress={() => setOpen(false)}>
                  <Mono className="text-micro tracking-wide uppercase text-accent">Done</Mono>
                </Pressable>
              </View>
              <DateTimePicker
                value={current}
                mode="date"
                display="spinner"
                textColor={colors.fg}
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
          onChange={(_e: DateTimePickerEvent, d?: Date) => {
            setOpen(false);
            if (d) onChange(toISODate(d));
          }}
        />
      )}
    </View>
  );
}
