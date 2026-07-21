import { useState } from 'react';
import { View, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Txt, Mono, Label, Button, TextField, IconButton } from '@/components/ui';
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
  const { control, handleSubmit } = useForm<OtpValues>({
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-center px-screen"
      >
        <Label className="mb-2">Two-factor verification</Label>
        <Txt className="text-title font-semibold text-fg">Enter your code</Txt>
        <Txt className="mt-2 text-callout text-muted">
          We sent a 6-digit code to <Mono className="text-callout text-fg">{email}</Mono>
        </Txt>

        <View className="mt-8">
          <Controller
            control={control}
            name="code"
            render={({ field: { onChange, onBlur, value }, fieldState }) => (
              <TextField
                label="Verification code"
                placeholder="6-digit code"
                icon="shield"
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                maxLength={8}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={fieldState.error?.message}
              />
            )}
          />
        </View>

        <Button
          label="Verify"
          onPress={handleSubmit(onSubmit)}
          loading={submitting}
          fullWidth
          className="mt-6"
        />

        <Pressable onPress={resend} disabled={resending} hitSlop={8} className="mt-6 self-center">
          <Mono className="text-caption text-accent">
            {resending ? 'Sending…' : 'Resend code'}
          </Mono>
        </Pressable>
      </KeyboardAvoidingView>
    </Screen>
  );
}
