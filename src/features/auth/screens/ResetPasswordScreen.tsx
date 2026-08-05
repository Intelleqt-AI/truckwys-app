import { useState, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Txt, Mono, IconButton } from '@/components/ui';
import {
  AuthLayout,
  AuthGroup,
  AuthField,
  AuthButton,
  AuthError,
  AuthLink,
  AuthHeading,
} from '../components';
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

  const { control, handleSubmit, formState } = useForm<ResetPasswordValues>({
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
      <AuthLayout>
        <AuthHeading title="Enter reset code" />
        <Txt className="-mt-7 mb-9 text-center text-body text-muted">
          Reset code sent to{'\n'}
          <Mono className="text-body text-fg">{email}</Mono>
        </Txt>

        <AuthGroup>
          <Controller
            control={control}
            name="code"
            render={({ field: { onChange, onBlur, value } }) => (
              <AuthField
                placeholder="6-digit code from email"
                accessibilityLabel="Reset code"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={6}
                style={{ paddingVertical: 15, letterSpacing: 4 }}
              />
            )}
          />
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <AuthField
                placeholder="New password (at least 8 characters)"
                accessibilityLabel="New password"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                secure
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                autoComplete="new-password"
              />
            )}
          />
          <Controller
            control={control}
            name="confirm"
            render={({ field: { onChange, onBlur, value } }) => (
              <AuthField
                placeholder="Repeat new password"
                accessibilityLabel="Confirm new password"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                secure
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                autoComplete="new-password"
                returnKeyType="go"
                onSubmitEditing={handleSubmit(onSubmit)}
                last
              />
            )}
          />
        </AuthGroup>

        <AuthError
          message={
            formState.errors.code?.message ??
            formState.errors.password?.message ??
            formState.errors.confirm?.message
          }
        />

        <AuthButton label="Set new password" onPress={handleSubmit(onSubmit)} loading={submitting} />

        <AuthLink
          label={countdown > 0 ? `Resend in ${formatCountdown(countdown)}` : 'Resend code'}
          onPress={resend}
          disabled={countdown > 0}
        />
      </AuthLayout>
    </Screen>
  );
}
