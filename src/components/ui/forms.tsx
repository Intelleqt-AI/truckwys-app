import { forwardRef, useId, useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  Platform,
  Keyboard,
  InputAccessoryView,
  InteractionManager,
  type TextInputProps,
} from 'react-native';
import Animated, {
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { Txt, Mono, Label, FieldLabel, INPUT_TEXT } from './Text';
import { Icon, type IconName } from './icons';
import { useTheme } from '@/theme/ThemeProvider';
import { status as statusHues, motion } from '@/theme/tokens';
import { parseNum, formatNumber, formatPlain } from '@/lib/formatters';

// Shared by TextField/SelectField/DateField: the error-or-warning message row,
// with its own enter/exit so the field settles in one motion instead of the
// text popping in and the border flipping colour at different beats.
export function FieldMessage({ error, warning }: { error?: string; warning?: string }) {
  const message = error ?? warning;
  if (!message) return null;
  return (
    <Animated.View entering={FadeInDown.duration(motion.fast)} exiting={FadeOut.duration(120)}>
      <Mono className={`mt-1 text-micro ${error ? 'text-danger' : 'text-warning'}`}>{message}</Mono>
    </Animated.View>
  );
}

/**
 * A Done bar over the keyboard.
 *
 * iOS-only — InputAccessoryView renders nothing on Android and console.warns on
 * every render there, so it has to be gated by us rather than by the component.
 * Android keeps its system back gesture to dismiss, so it needs no equivalent.
 *
 * Rendered next to its own input rather than once at the app root, because a
 * TextInput inside a Modal (Record Payment, the quote's final price) lives in a
 * separate native window and cannot resolve a nativeID registered outside it.
 * The native view is position:absolute, so it costs nothing in layout.
 */
export function KeyboardDoneBar({ nativeID }: { nativeID: string }) {
  const { colors } = useTheme();
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={nativeID} backgroundColor={colors.surface}>
      <View
        className="flex-row items-center justify-end border-t border-line px-4"
        style={{ height: 44 }}
      >
        <Pressable
          onPress={() => Keyboard.dismiss()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Dismiss keyboard"
        >
          <Txt className="text-callout font-semibold text-accent">Done</Txt>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

// ── TextField: label + input + error, 2px radius, 44px min height ──────────
export interface TextFieldProps extends TextInputProps {
  label?: string;
  /** Renders a danger-coloured * after the label. Presentational only. */
  required?: boolean;
  error?: string;
  /** Amber advisory message — shown only when `error` is absent, never blocks. */
  warning?: string;
  icon?: IconName;
  /** Leading unit, e.g. `R` for money. Rendered in Mono so it lines up with the digits. */
  prefix?: string;
  /** Group thousands on blur (en-ZA) and strip the grouping again on focus. */
  numeric?: boolean;
  /** Fixed decimal places for `numeric` — 2 for money. Omit to keep what was typed. */
  decimals?: number;
  className?: string;
  /**
   * Render as `BottomSheetTextInput` instead of RN's `TextInput` — required
   * for a field living inside a `@gorhom/bottom-sheet` sheet, otherwise the
   * sheet can't track focus to keep the field above the keyboard.
   */
  bottomSheet?: boolean;
}

// Forwards a ref to the underlying input so a form can call `.focus()` on the
// first invalid field after a failed submit (see useFieldAnchors). Typed
// against RN's TextInput — BottomSheetTextInput exposes the same instance
// methods, it just isn't declared as a TextInput subclass.
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  {
    label,
    error,
    warning,
    icon,
    prefix,
    numeric,
    decimals,
    secureTextEntry,
    required,
    className = '',
    bottomSheet,
    ...props
  },
  ref,
) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(!!secureTextEntry);
  // One accessory view per field, so the id has to be unique per instance.
  const accessoryID = useId();

  // Reformat between raw and grouped, but only ever through parseNum — never
  // Number(), which is NaN for the comma decimal a South African keyboard types.
  //
  // Two things keep this off the focus/blur hot path:
  //  - It's a no-op write when the reformatted string already matches what's
  //    there (the common first-focus case — a value seeded from the API has
  //    never been through the blur-side grouping, so there's nothing to undo).
  //  - When it DOES need to write, that write is deferred a tick via
  //    InteractionManager (same idiom as CreateQuoteScreen.tsx's post-save
  //    invalidate) rather than run inline. `onChangeText` here is a
  //    react-hook-form Controller write, which re-renders every subscriber —
  //    running it synchronously inside onFocus/onBlur landed that render on
  //    the exact JS tick the OS is trying to animate the keyboard in, which
  //    is what made a numeric field (unlike a plain text one, whose onFocus
  //    only sets local `focused` state) feel laggy to tap into.
  const reformat = (grouped: boolean) => {
    if (!numeric || typeof props.value !== 'string' || !props.onChangeText) return;
    const n = parseNum(props.value);
    if (n == null) return; // leave bad input alone; the caller validates it
    const next = grouped
      ? formatNumber(n, {
          minimumFractionDigits: decimals ?? 0,
          maximumFractionDigits: decimals ?? 4,
        })
      : formatPlain(n, decimals);
    if (next === props.value) return;
    InteractionManager.runAfterInteractions(() => props.onChangeText?.(next));
  };

  // These compose with the caller's handlers instead of replacing them: props
  // are spread last, so a bare onFocus/onBlur here would be silently overridden
  // by every react-hook-form Controller call site.
  const onFocus: NonNullable<TextInputProps['onFocus']> = (e) => {
    setFocused(true);
    reformat(false);
    props.onFocus?.(e);
  };
  const onBlur: NonNullable<TextInputProps['onBlur']> = (e) => {
    setFocused(false);
    reformat(true);
    props.onBlur?.(e);
  };

  const Input = bottomSheet ? BottomSheetTextInput : TextInput;

  // Border colour eases between states instead of snapping, so a field that
  // fails validation on blur reads as a soft rejection rather than a jump-cut.
  const borderStyle = useAnimatedStyle(() => ({
    borderColor: withTiming(
      error
        ? statusHues.danger
        : warning
          ? statusHues.warning
          : focused
            ? colors.accent
            : colors.line,
      { duration: motion.fast },
    ),
  }));

  return (
    <View className={className}>
      <FieldLabel label={label} required={required} />
      <Animated.View
        className="min-h-[48px] flex-row items-center gap-2 rounded-xs border bg-surface px-3"
        style={borderStyle}
      >
        {icon && <Icon name={icon} size={17} color={colors.faint} />}
        {prefix && <Mono className="text-body text-muted">{prefix}</Mono>}
        <Input
          ref={ref as never}
          className="flex-1 text-fg"
          placeholderTextColor={colors.faint}
          secureTextEntry={hidden}
          {...props}
          // After the spread, and merging props.style rather than being replaced
          // by it — a caller passing style used to drop paddingVertical outright.
          style={[INPUT_TEXT, { paddingVertical: 12 }, props.style]}
          onFocus={onFocus}
          onBlur={onBlur}
          inputAccessoryViewID={props.inputAccessoryViewID ?? accessoryID}
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
      </Animated.View>
      <FieldMessage error={error} warning={warning} />
      <KeyboardDoneBar nativeID={accessoryID} />
    </View>
  );
});

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
        className="flex-1 text-fg"
        style={INPUT_TEXT}
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
              className={`text-micro uppercase tracking-wide ${
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
                  <Txt
                    className={`text-callout ${active ? 'text-fg' : 'text-muted'}`}
                    numberOfLines={1}
                  >
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
