import { useState, useEffect, useRef } from 'react';
import { View, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Txt, Mono, Label, Button, TextField, IconButton } from '@/components/ui';
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
  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const { control, handleSubmit } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { code: '', password: '', confirm: '' },
  });

  const onSubmit = async (values: ResetPasswordValues) => {
    setSubmitting(true);
    try {
      await authApi.passwordResetConfirm(email, values.code.trim(), values.password);
      toast.success('Password updated');
      navigation.navigate('Login');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invalid or expired reset code');
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
    <Screen scroll={false} padded={false}>
      <View className="px-2 pt-1">
        <IconButton name="chevronLeft" accessibilityLabel="Back" onPress={() => navigation.goBack()} />
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-center px-screen"
      >
        <Label className="mb-2">Password reset</Label>
        <Txt className="text-title font-semibold text-fg">Enter reset code</Txt>
        <Txt className="mb-7 mt-2 text-callout text-muted">
          Reset code sent to <Mono className="text-callout text-fg">{email}</Mono>
        </Txt>

        <Controller
          control={control}
          name="code"
          render={({ field: { onChange, onBlur, value }, fieldState }) => (
            <TextField
              label="Reset code"
              placeholder="6-digit code from email"
              icon="shield"
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              maxLength={6}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={fieldState.error?.message}
              className="mb-4"
            />
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value }, fieldState }) => (
            <TextField
              label="New password"
              placeholder="At least 8 characters"
              icon="lock"
              secureTextEntry
              autoComplete="new-password"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={fieldState.error?.message}
              className="mb-4"
            />
          )}
        />
        <Controller
          control={control}
          name="confirm"
          render={({ field: { onChange, onBlur, value }, fieldState }) => (
            <TextField
              label="Confirm password"
              placeholder="Repeat new password"
              icon="lock"
              secureTextEntry
              autoComplete="new-password"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={fieldState.error?.message}
              className="mb-6"
            />
          )}
        />

        <Button label="Set new password" onPress={handleSubmit(onSubmit)} loading={submitting} fullWidth />

        <Pressable
          onPress={resend}
          disabled={countdown > 0}
          hitSlop={8}
          className="mt-6 self-center"
        >
          <Mono className={`text-caption ${countdown > 0 ? 'text-faint' : 'text-accent'}`}>
            {countdown > 0 ? `Resend in ${formatCountdown(countdown)}` : 'Resend code'}
          </Mono>
        </Pressable>
      </KeyboardAvoidingView>
    </Screen>
  );
}
