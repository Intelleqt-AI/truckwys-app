import { useId, useState, type ReactNode } from 'react';
import {
  View,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type TextInputProps,
} from 'react-native';
import { Txt, Icon, KeyboardDoneBar } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

// Shared shell for the sign-in flow. These screens deliberately follow the
// platform's grouped-form convention rather than the app's sharper terminal
// styling: they're what someone sees before they've seen anything else, and a
// login that looks like a system screen reads as trustworthy.
//
// Keeping them in one place is what stops sign-in, the 2FA step and password
// reset from drifting apart visually.

/** Centred, keyboard-aware, scrollable-on-small-screens body. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Inset container: put one or more AuthField rows inside it. */
export function AuthGroup({ children }: { children: ReactNode }) {
  return (
    <View className="overflow-hidden rounded-lg border border-line bg-surface">{children}</View>
  );
}

/**
 * A single row in an AuthGroup — no per-field box or floating label, which is
 * what makes the group read as one native form rather than stacked inputs.
 *
 * `textContentType` is worth setting on every one of these: it's what lets
 * iCloud Keychain and the Android password manager offer a saved credential,
 * and it's the clearest difference between a stock-feeling login and a
 * hand-rolled one.
 */
export function AuthField({
  placeholder,
  secure,
  accessibilityLabel,
  last,
  ...rest
}: TextInputProps & {
  placeholder: string;
  secure?: boolean;
  accessibilityLabel: string;
  last?: boolean;
}) {
  const { colors } = useTheme();
  const [hidden, setHidden] = useState(!!secure);
  const accessoryID = useId();

  return (
    <View
      className={`min-h-[52px] flex-row items-center px-4 ${last ? '' : 'border-b border-line-row'}`}
    >
      <TextInput
        className="flex-1 text-body text-fg"
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        secureTextEntry={hidden}
        accessibilityLabel={accessibilityLabel}
        style={{ paddingVertical: 15 }}
        {...rest}
        inputAccessoryViewID={rest.inputAccessoryViewID ?? accessoryID}
      />
      {secure && (
        <Pressable
          hitSlop={10}
          onPress={() => setHidden((h) => !h)}
          accessibilityRole="button"
          accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
        >
          <Icon name="eye" size={18} color={colors.faint} />
        </Pressable>
      )}
      {/* The OTP screen's number-pad has no return key to dismiss with. */}
      <KeyboardDoneBar nativeID={accessoryID} />
    </View>
  );
}

/** Taller and softer than the app's standard button, to match the group. */
export function AuthButton({
  label,
  onPress,
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const off = loading || disabled;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="mt-6 min-h-[52px] items-center justify-center rounded-lg active:opacity-80"
      style={{ backgroundColor: colors.accent, opacity: off ? 0.6 : 1 }}
    >
      {loading ? (
        <ActivityIndicator color={colors.onAccent} />
      ) : (
        <Txt className="text-heading font-semibold" style={{ color: colors.onAccent }}>
          {label}
        </Txt>
      )}
    </Pressable>
  );
}

/** Validation message under a group. */
export function AuthError({ message }: { message?: string }) {
  if (!message) return null;
  return <Txt className="mt-2.5 px-1 text-sub text-danger">{message}</Txt>;
}

/** Centred plain-text secondary action, e.g. "Forgot password?". */
export function AuthLink({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={10} className="mt-5 self-center">
      <Txt className="text-body text-accent">{label}</Txt>
    </Pressable>
  );
}

/** Screen title + supporting line, centred. */
export function AuthHeading({ title, sub }: { title: string; sub?: string }) {
  return (
    <View className="mb-9 items-center">
      <Txt className="text-title font-semibold text-fg">{title}</Txt>
      {!!sub && <Txt className="mt-1.5 text-center text-body text-muted">{sub}</Txt>}
    </View>
  );
}
