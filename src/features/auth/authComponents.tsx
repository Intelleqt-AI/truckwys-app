import { useEffect, useId, useState, type ReactNode } from 'react';
import {
  View,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
  type TextInputProps,
} from 'react-native';
import Animated, {
  Extrapolation,
  FadeInDown,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import {
  KeyboardAwareScrollView,
  useReanimatedKeyboardAnimation,
} from 'react-native-keyboard-controller';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Txt,
  Mono,
  Logo,
  Icon,
  IconButton,
  KeyboardDoneBar,
  INPUT_TEXT,
  type IconName,
} from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { status as statusHues } from '@/theme/tokens';
import { useErrorShake } from '@/hooks/useErrorShake';

// Shared sign-in-flow primitives — the flat, no-card dark look with animated
// focus/press/shake and staggered entrance, used by every screen in the auth
// stack (Login, VerifyOtp, ForgotPassword, ResetPassword).

// ── LoginHero: gradient/glow brand hero, collapses as the keyboard opens ───
// Login-only — the other three screens are reached via back-navigation, not
// a first-launch surface, so they use AuthScreen's plain back-button header
// instead of the full brand hero.
export function LoginHero({ progress }: { progress: SharedValue<number> }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();

  const heroMax = Math.min(210, Math.max(160, screenH * 0.22));
  // Tall enough to hold the shrunk logo alone once the tagline has faded out —
  // the logo never disappears, so this floor is sized for it, not just padding.
  const heroMin = insets.top + 76;

  const containerStyle = useAnimatedStyle(() => ({
    height: interpolate(progress.value, [0, 1], [heroMax, heroMin], Extrapolation.CLAMP),
  }));

  // Logo stays fully visible and just shrinks — a persistent brand anchor
  // rather than something that vanishes while typing. Only the tagline fades.
  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(progress.value, [0, 1], [1, 0.62], Extrapolation.CLAMP) }],
  }));

  const taglineStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [1, 0], Extrapolation.CLAMP),
    marginTop: interpolate(progress.value, [0, 1], [10, 0], Extrapolation.CLAMP),
  }));

  return (
    <Animated.View style={[{ overflow: 'hidden' }, containerStyle]}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: colors.bgDeep,
        }}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[colors.accentDim, colors.bgDeep]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -80,
          right: -60,
          width: 260,
          height: 260,
          borderRadius: 260,
          backgroundColor: colors.accent,
          opacity: 0.1,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: -110,
          left: -60,
          width: 220,
          height: 220,
          borderRadius: 220,
          backgroundColor: colors.accent,
          opacity: 0.06,
        }}
      />
      <Animated.View
        entering={FadeInDown.duration(400)}
        style={{ flex: 1, justifyContent: 'flex-end', paddingHorizontal: 24, paddingBottom: 22 }}
      >
        <Animated.View style={[{ alignSelf: 'flex-start', transformOrigin: 'left' }, logoStyle]}>
          <Logo width={172} />
        </Animated.View>
        <Animated.View style={taglineStyle}>
          <Txt className="text-body text-muted">Freight operations, in one place.</Txt>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

// ── AuthScreen: same brand hero as Login + back button + keyboard-aware form ─
// The shell for every screen reached by back-navigation (VerifyOtp,
// ForgotPassword, ResetPassword) — reuses LoginHero so the whole auth stack
// shares one gradient/logo identity instead of Login being the only branded
// screen. The back button floats over the hero rather than taking its own row.
export function AuthScreen({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  const { scheme, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { progress } = useReanimatedKeyboardAnimation();

  return (
    <View className="flex-1 bg-bg-deep" style={{ paddingTop: insets.top }}>
      <View style={{ position: 'relative' }}>
        <LoginHero progress={progress} />
        <View pointerEvents="box-none" style={{ position: 'absolute', top: 4, left: 8 }}>
          <View
            style={{
              borderRadius: 22,
              backgroundColor: scheme === 'dark' ? 'rgba(3,3,3,0.35)' : 'rgba(255,255,255,0.55)',
            }}
          >
            <IconButton
              name="chevronLeft"
              accessibilityLabel="Back"
              onPress={onBack}
              color={colors.fg}
            />
          </View>
        </View>
      </View>

      {/* Tracks the focused input directly (cursor position, layout shifts from
          validation errors appearing, etc.) and keeps it above the keyboard on
          both platforms — a plain ScrollView + KeyboardAvoidingView doesn't
          auto-scroll to a field that ends up under the keyboard. */}
      <KeyboardAwareScrollView
        bottomOffset={24}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 24,
          paddingTop: 28,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </KeyboardAwareScrollView>
    </View>
  );
}

// ── AuthTitle: left-aligned display heading + optional supporting line ─────
export function AuthTitle({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <View>
      <Txt className="text-display font-semibold text-fg">{title}</Txt>
      {!!sub && <Txt className="mt-1.5 text-body text-muted">{sub}</Txt>}
    </View>
  );
}

// ── AuthTextLink: centred secondary action (resend code, etc.) ─────────────
// Deliberately not a boxed button — it must stay visually lighter than the
// primary SignInButton above it — but underlined + press-opacity so it still
// reads as tappable rather than as plain static copy.
export function AuthTextLink({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const press = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ opacity: press.value }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        if (!disabled) press.value = withTiming(0.5, { duration: 100 });
      }}
      onPressOut={() => {
        press.value = withTiming(1, { duration: 150 });
      }}
      disabled={disabled}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      className="mt-6 self-center"
    >
      <Animated.View style={pressStyle}>
        <Txt
          className={disabled ? 'text-sub text-faint' : 'text-sub text-accent'}
          style={{ textDecorationLine: disabled ? 'none' : 'underline' }}
        >
          {label}
        </Txt>
      </Animated.View>
    </Pressable>
  );
}

// useErrorShake moved to `src/hooks/useErrorShake.ts` (Fleet's forms need it
// too, without importing from features/auth). Re-exported here so the four
// existing auth-stack imports (LoginScreen, ResetPasswordScreen,
// ForgotPasswordScreen, VerifyOtpScreen) keep working unchanged.
export { useErrorShake };

// ── SignInField: boxed input with animated focus border + ring ─────────────
export function SignInField({
  label,
  icon,
  secure,
  error,
  onFocus,
  onBlur,
  ...rest
}: TextInputProps & {
  label: string;
  icon: IconName;
  secure?: boolean;
  error?: string;
}) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(!!secure);
  const accessoryID = useId();
  const focus = useSharedValue(0);

  useEffect(() => {
    focus.value = withTiming(focused ? 1 : 0, { duration: 160 });
  }, [focused, focus]);

  const boxStyle = useAnimatedStyle(() => ({
    borderColor: error
      ? statusHues.danger
      : interpolateColor(focus.value, [0, 1], [colors.line, colors.accent]),
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: error ? 0 : focus.value * 0.35,
  }));

  return (
    <View>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: -3,
            left: -3,
            right: -3,
            bottom: -3,
            borderRadius: 15,
            borderWidth: 2,
            borderColor: colors.accent,
          },
          ringStyle,
        ]}
      />
      <Animated.View
        className="min-h-[56px] flex-row items-center gap-2.5 rounded-lg bg-elevated px-4"
        style={[{ borderWidth: 1 }, boxStyle]}
      >
        <Icon name={icon} size={18} color={focused ? colors.accent : colors.faint} />
        <TextInput
          className="flex-1 text-fg"
          placeholder={label}
          placeholderTextColor={colors.faint}
          secureTextEntry={hidden}
          accessibilityLabel={label}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
          style={[
            INPUT_TEXT,
            // Android reserves extra ascent/descent space by default
            // (includeFontPadding) and doesn't centre text in a taller box on
            // its own — without these two, the glyph sits high and can look
            // clipped against the box's rounded corners.
            { paddingVertical: 16, textAlignVertical: 'center', includeFontPadding: false },
            rest.style,
          ]}
          inputAccessoryViewID={rest.inputAccessoryViewID ?? accessoryID}
        />
        {secure && (
          <Pressable
            hitSlop={10}
            onPress={() => setHidden((h) => !h)}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
          >
            <Icon name={hidden ? 'eye' : 'eyeOff'} size={18} color={colors.faint} />
          </Pressable>
        )}
      </Animated.View>
      <KeyboardDoneBar nativeID={accessoryID} />
      {error ? <Mono className="mt-1.5 text-micro text-danger">{error}</Mono> : null}
    </View>
  );
}

// ── SignInButton: accent CTA with glow shadow, press-scale + haptic ────────
export function SignInButton({
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
  const off = !!loading || !!disabled;
  const press = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));

  const handlePress = () => {
    if (off) return;
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  return (
    <Animated.View style={pressStyle}>
      <Pressable
        onPress={handlePress}
        onPressIn={() => {
          if (!off) press.value = withSpring(0.97, { damping: 18, stiffness: 320, mass: 0.5 });
        }}
        onPressOut={() => {
          press.value = withSpring(1, { damping: 15, stiffness: 200, mass: 0.6 });
        }}
        disabled={off}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: off, busy: !!loading }}
        className="min-h-[56px] flex-row items-center justify-center gap-2 rounded-lg"
        style={{
          backgroundColor: colors.accent,
          opacity: off ? 0.6 : 1,
          shadowColor: colors.accent,
          shadowOpacity: 0.35,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 10,
        }}
      >
        {loading ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <>
            <Txt className="text-heading font-semibold" style={{ color: colors.onAccent }}>
              {label}
            </Txt>
            <Icon name="arrowRight" size={18} color={colors.onAccent} strokeWidth={2.2} />
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ── InlineError: persistent card for a server/API failure ──────────────────
export function InlineError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      className="flex-row items-center gap-2 rounded-lg border border-danger bg-danger-bg px-3 py-2.5"
    >
      <Icon name="alert" size={16} color={statusHues.danger} />
      <Txt className="flex-1 text-sub text-danger">{message}</Txt>
    </Animated.View>
  );
}
