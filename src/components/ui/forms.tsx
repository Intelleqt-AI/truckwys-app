import { useState } from 'react';
import { View, TextInput, Pressable, type TextInputProps } from 'react-native';
import { Txt, Mono, Label } from './Text';
import { Icon, type IconName } from './icons';
import { useTheme } from '@/theme/ThemeProvider';

// ── TextField: label + input + error, 2px radius, 44px min height ──────────
export function TextField({
  label,
  error,
  icon,
  secureTextEntry,
  className = '',
  ...props
}: TextInputProps & {
  label?: string;
  error?: string;
  icon?: IconName;
  className?: string;
}) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(!!secureTextEntry);

  return (
    <View className={className}>
      {label && <Label className="mb-1.5 text-muted">{label}</Label>}
      <View
        className={`min-h-[48px] flex-row items-center gap-2 rounded-xs border bg-surface px-3 ${
          error ? 'border-danger' : focused ? 'border-accent' : 'border-line'
        }`}
      >
        {icon && <Icon name={icon} size={17} color={colors.faint} />}
        <TextInput
          className="flex-1 text-body text-fg"
          placeholderTextColor={colors.faint}
          secureTextEntry={hidden}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ paddingVertical: 12 }}
          {...props}
        />
        {secureTextEntry && (
          <Pressable
            hitSlop={10}
            onPress={() => setHidden((h) => !h)}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
          >
            <Icon name="eye" size={18} color={colors.faint} />
          </Pressable>
        )}
      </View>
      {error && <Mono className="mt-1 text-micro text-danger">{error}</Mono>}
    </View>
  );
}

// ── SearchField ────────────────────────────────────────────────────────────
export function SearchField({
  value,
  onChangeText,
  placeholder = 'Search',
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
}) {
  const { colors } = useTheme();
  return (
    <View className="min-h-[44px] flex-row items-center gap-2 rounded-xs border border-line bg-surface px-3">
      <Icon name="search" size={17} color={colors.faint} />
      <TextInput
        className="flex-1 text-body text-fg"
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        value={value}
        onChangeText={onChangeText}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
    </View>
  );
}

// ── SegmentedControl ───────────────────────────────────────────────────────
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View className="flex-row rounded-xs border border-line bg-surface p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className={`min-h-[36px] flex-1 items-center justify-center rounded-xs ${
              active ? 'bg-accent' : ''
            }`}
          >
            <Mono
              className={`text-micro tracking-wide uppercase ${
                active ? 'text-on-accent' : 'text-muted'
              }`}
            >
              {o.label}
            </Mono>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Toggle: iOS-style switch ───────────────────────────────────────────────
export function Toggle({
  value,
  onValueChange,
  disabled,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={{
        width: 46,
        height: 28,
        borderRadius: 100,
        backgroundColor: value ? colors.accent : colors.lineActive,
        justifyContent: 'center',
        padding: 3,
      }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: '#fff',
          transform: [{ translateX: value ? 18 : 0 }],
        }}
      />
    </Pressable>
  );
}

// ── RadioRows: inline single-select list ───────────────────────────────────
// Used where a SelectField can't be: inside an already-presented Modal, where
// nesting SelectField's own Modal is unreliable on iOS.
export function RadioRows({
  label,
  value,
  options,
  onSelect,
  emptyText,
}: {
  label?: string;
  value?: string;
  options: { label: string; value: string; sub?: string }[];
  onSelect: (value: string) => void;
  emptyText?: string;
}) {
  const { colors } = useTheme();
  return (
    <View>
      {label && <Label className="mb-1.5 text-muted">{label}</Label>}
      {options.length === 0 ? (
        <Mono className="text-micro text-warning">{emptyText ?? 'Nothing available'}</Mono>
      ) : (
        <View className="overflow-hidden rounded-xs border border-line bg-surface">
          {options.map((o, i) => {
            const active = o.value === value;
            return (
              <Pressable
                key={`${o.value}-${i}`}
                onPress={() => onSelect(o.value)}
                className={`min-h-[44px] flex-row items-center gap-3 px-3 py-2.5 active:bg-surface-hover ${
                  i === options.length - 1 ? '' : 'border-b border-line-row'
                }`}
              >
                <View className="flex-1">
                  <Txt className={`text-callout ${active ? 'text-fg' : 'text-muted'}`} numberOfLines={1}>
                    {o.label}
                  </Txt>
                  {o.sub ? <Txt className="mt-0.5 text-caption text-faint">{o.sub}</Txt> : null}
                </View>
                {active && <Icon name="check" size={17} color={colors.accent} strokeWidth={2.4} />}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
