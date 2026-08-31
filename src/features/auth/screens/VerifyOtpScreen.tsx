import { useState } from 'react';
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
  const [serverError, setServerError] = useState<string | null>(null);
  const { shakeStyle, trigger: triggerShake } = useErrorShake();

  const { control, handleSubmit, formState } = useForm<OtpValues>({
    resolver: zodResolver(otpSchema),
    defaultValues: { code: '' },
    mode: 'onBlur',
  });

  const onSubmit = async (values: OtpValues) => {
    setServerError(null);
    setSubmitting(true);
    try {
      const res = await authApi.verifyOtp(pendingToken, values.code.trim());
      await setSession(res.token, res.user);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Invalid code';
      setServerError(message);
      toast.error(message);
      triggerShake();
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
    <AuthScreen onBack={() => navigation.goBack()}>
      <Animated.View entering={FadeInDown.delay(80).duration(400)}>
        <AuthTitle
          title="Enter your code"
          sub={
            <>
              We sent a 6-digit code to{'\n'}
              <Mono className="text-body text-fg">{email}</Mono>
            </>
          }
        />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(160).duration(400)} style={{ marginTop: 24 }}>
        <Animated.View style={shakeStyle}>
          <Controller
            control={control}
            name="code"
            render={({ field: { onChange, onBlur, value } }) => (
              <SignInField
                label="6-digit code"
                icon="shield"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={formState.errors.code?.message}
                keyboardType="number-pad"
                // Lets iOS offer the code straight from the Messages/mail
                // notification instead of making the user go and read it.
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={8}
                returnKeyType="go"
                onSubmitEditing={handleSubmit(onSubmit, triggerShake)}
                style={{ letterSpacing: 4 }}
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

      <Animated.View entering={FadeInDown.delay(220).duration(400)} style={{ marginTop: 20 }}>
        <SignInButton label="Verify" onPress={handleSubmit(onSubmit, triggerShake)} loading={submitting} />
        <AuthTextLink
          label={resending ? 'Sending…' : 'Resend code'}
          onPress={resend}
          disabled={resending}
        />
      </Animated.View>
    </AuthScreen>
  );
}
