import { useState, useEffect, useRef } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Mono } from '@/components/ui';
import {
  AuthScreen,
  AuthTitle,
  AuthTextLink,
  SignInField,
  SignInButton,
  InlineError,
  useErrorShake,
} from '../authComponents';
import { resetPasswordSchema, type ResetPasswordValues } from '../schemas';
import { authApi } from '../api';
import { toast } from '@/lib/toast';
import type { AuthStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'ResetPassword'>;

// Same 180s window the web reset screen enforces (PasswordReset.tsx:6).
const RESEND_SECONDS = 180;

const formatCountdown = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

// Step 2 of the code-based reset. Code-based rather than link-based, so it works
// entirely in-app — no deep link needed.
export function ResetPasswordScreen({ route, navigation }: Props) {
  const { email } = route.params;
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const { shakeStyle, trigger: triggerShake } = useErrorShake();

  const startCountdown = () => {
    setCountdown(RESEND_SECONDS);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (timer.current) clearInterval(timer.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // The code was already sent by ForgotPasswordScreen — start counting on mount.
  useEffect(() => {
    startCountdown();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const { control, handleSubmit, formState } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { code: '', password: '', confirm: '' },
    mode: 'onBlur',
  });

  const onSubmit = async (values: ResetPasswordValues) => {
    setServerError(null);
    setSubmitting(true);
    try {
      await authApi.passwordResetConfirm(email, values.code.trim(), values.password);
      toast.success('Password updated');
      navigation.navigate('Login');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Invalid or expired reset code';
      setServerError(message);
      toast.error(message);
      triggerShake();
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    if (countdown > 0) return;
    try {
      await authApi.passwordReset(email);
      startCountdown();
      toast.success('Code resent');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not resend code');
    }
  };

  return (
    <AuthScreen onBack={() => navigation.goBack()}>
      <Animated.View entering={FadeInDown.delay(80).duration(400)}>
        <AuthTitle
          title="Enter reset code"
          sub={
            <>
              Reset code sent to{'\n'}
              <Mono className="text-body text-fg">{email}</Mono>
            </>
          }
        />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(160).duration(400)} style={{ marginTop: 24 }}>
        <Animated.View style={[{ gap: 12 }, shakeStyle]}>
          <Controller
            control={control}
            name="code"
            render={({ field: { onChange, onBlur, value } }) => (
              <SignInField
                label="6-digit code from email"
                icon="shield"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={formState.errors.code?.message}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={6}
                returnKeyType="next"
              />
            )}
          />
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <SignInField
                label="New password"
                icon="lock"
                secure
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={formState.errors.password?.message}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                autoComplete="new-password"
                returnKeyType="next"
              />
            )}
          />
          <Controller
            control={control}
            name="confirm"
            render={({ field: { onChange, onBlur, value } }) => (
              <SignInField
                label="Repeat new password"
                icon="lock"
                secure
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={formState.errors.confirm?.message}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                autoComplete="new-password"
                returnKeyType="go"
                onSubmitEditing={handleSubmit(onSubmit, triggerShake)}
              />
            )}
          />
        </Animated.View>
      </Animated.View>

      {!!serverError && (
        <View className="mt-3">
          <InlineError message={serverError} />
        </View>
      )}

      <Animated.View entering={FadeInDown.delay(240).duration(400)} style={{ marginTop: 20 }}>
        <SignInButton
          label="Set new password"
          onPress={handleSubmit(onSubmit, triggerShake)}
          loading={submitting}
        />
        <AuthTextLink
          label={countdown > 0 ? `Resend in ${formatCountdown(countdown)}` : 'Resend code'}
          onPress={resend}
          disabled={countdown > 0}
        />
      </Animated.View>
    </AuthScreen>
  );
}
