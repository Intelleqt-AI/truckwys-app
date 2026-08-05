import { useState } from 'react';
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
import { otpSchema, type OtpValues } from '../schemas';
import { authApi } from '../api';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/lib/toast';
import type { AuthStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'VerifyOtp'>;

export function VerifyOtpScreen({ route, navigation }: Props) {
  const { pendingToken, email } = route.params;
  const setSession = useAuthStore((s) => s.setSession);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const { control, handleSubmit, formState } = useForm<OtpValues>({
    resolver: zodResolver(otpSchema),
    defaultValues: { code: '' },
  });

  const onSubmit = async (values: OtpValues) => {
    setSubmitting(true);
    try {
      const res = await authApi.verifyOtp(pendingToken, values.code.trim());
      await setSession(res.token, res.user);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invalid code');
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    setResending(true);
    try {
      await authApi.resendOtp(pendingToken);
      toast.success('Code resent');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not resend');
    } finally {
      setResending(false);
    }
  };

  return (
    <Screen scroll={false} padded={false}>
      <View className="px-2 pt-1">
        <IconButton name="chevronLeft" accessibilityLabel="Back" onPress={() => navigation.goBack()} />
      </View>
      <AuthLayout>
        <AuthHeading title="Enter your code" />
        <Txt className="-mt-7 mb-9 text-center text-body text-muted">
          We sent a 6-digit code to{'\n'}
          <Mono className="text-body text-fg">{email}</Mono>
        </Txt>

        <AuthGroup>
          <Controller
            control={control}
            name="code"
            render={({ field: { onChange, onBlur, value } }) => (
              <AuthField
                placeholder="6-digit code"
                accessibilityLabel="Verification code"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                keyboardType="number-pad"
                // Lets iOS offer the code straight from the Messages/mail
                // notification instead of making the user go and read it.
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={8}
                returnKeyType="go"
                onSubmitEditing={handleSubmit(onSubmit)}
                style={{ paddingVertical: 15, letterSpacing: 4 }}
                last
              />
            )}
          />
        </AuthGroup>

        <AuthError message={formState.errors.code?.message} />

        <AuthButton label="Verify" onPress={handleSubmit(onSubmit)} loading={submitting} />

        <AuthLink label={resending ? 'Sending…' : 'Resend code'} onPress={resend} disabled={resending} />
      </AuthLayout>
    </Screen>
  );
}
