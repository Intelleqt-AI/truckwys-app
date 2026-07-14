import { useState } from 'react';
import { View, TextInput, Pressable, type TextInputProps } from 'react-native';
import { Mono, Label } from './Text';
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
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
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
