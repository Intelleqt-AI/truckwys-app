import { memo, useMemo, useState } from 'react';
import { View, Pressable, Modal, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt, Mono, FieldLabel } from './Text';
import { Icon, type IconName } from './icons';
import { SearchField } from './forms';
import { useTheme } from '@/theme/ThemeProvider';

export interface Option {
  label: string;
  value: string;
  sub?: string;
}

// Field that opens a searchable modal list. Used for client + vehicle-type
// pickers in the quote builder and elsewhere. Memoized — renders a Modal +
// FlatList, so it's worth skipping on a parent re-render that doesn't touch
// its own props.
function SelectFieldImpl({
  label,
  value,
  placeholder = 'Select',
  options,
  onSelect,
  icon,
  error,
  required,
}: {
  label?: string;
  value?: string;
  placeholder?: string;
  options: Option[];
  onSelect: (value: string) => void;
  icon?: IconName;
  error?: string;
  /** Renders a danger-coloured * after the label. Presentational only. */
  required?: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const selected = options.find((o) => o.value === value);
  // De-duplicate by value so lists (e.g. vehicle types returned more than once)
  // never render duplicate keys.
  const unique = useMemo(() => {
    const seen = new Set<string>();
    return options.filter((o) => (seen.has(o.value) ? false : (seen.add(o.value), true)));
  }, [options]);
  const filtered = useMemo(
    () => (q ? unique.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : unique),
    [unique, q],
  );

  return (
    <View>
      <FieldLabel label={label} required={required} />
      <Pressable
        onPress={() => setOpen(true)}
        className={`min-h-[48px] flex-row items-center gap-2 rounded-xs border bg-surface px-3 ${
          error ? 'border-danger' : 'border-line'
        }`}
      >
        {icon && <Icon name={icon} size={17} color={selected ? colors.accent : colors.faint} />}
        <Txt
          className={`flex-1 text-body ${selected ? 'text-fg' : 'text-faint'}`}
          numberOfLines={1}
        >
          {selected?.label ?? placeholder}
        </Txt>
        <Icon name="chevronDown" size={16} color={colors.faint} />
      </Pressable>
      {error && <Mono className="mt-1 text-micro text-danger">{error}</Mono>}

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <View className="flex-1 bg-bg-deep" style={{ paddingTop: insets.top + 8 }}>
          <View className="flex-row items-center justify-between px-screen pb-3">
            <Txt className="text-heading font-semibold text-fg">{label ?? 'Select'}</Txt>
            <Pressable hitSlop={8} onPress={() => setOpen(false)}>
              <Mono className="text-micro uppercase tracking-wide text-accent">Close</Mono>
            </Pressable>
          </View>
          <View className="px-screen pb-2">
            <SearchField
              value={q}
              onChangeText={setQ}
              placeholder={`Search ${label ?? ''}`.trim()}
            />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(o, i) => `${o.value}-${i}`}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const active = item.value === value;
              return (
                <Pressable
                  onPress={() => {
                    onSelect(item.value);
                    setQ('');
                    setOpen(false);
                  }}
                  className="min-h-[52px] flex-row items-center gap-3 border-b border-line-row py-3 active:bg-surface-hover"
                >
                  <View className="flex-1">
                    <Txt className="text-body text-fg">{item.label}</Txt>
                    {item.sub ? (
                      <Txt className="mt-0.5 text-caption text-muted">{item.sub}</Txt>
                    ) : null}
                  </View>
                  {active && (
                    <Icon name="check" size={18} color={colors.accent} strokeWidth={2.4} />
                  )}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

export const SelectField = memo(SelectFieldImpl);
