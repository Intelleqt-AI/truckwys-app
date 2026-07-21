import { useState } from 'react';
import { View, KeyboardAvoidingView, Platform } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Txt, Label, Button, TextField, IconButton, EmptyState } from '@/components/ui';
import { forgotSchema, type ForgotValues } from '../schemas';
import { authApi } from '../api';
import { toast } from '@/lib/toast';
import type { AuthStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export function ForgotPasswordScreen({ navigation }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const { control, handleSubmit } = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: ForgotValues) => {
    setSubmitting(true);
    try {
      await authApi.passwordReset(values.email.trim());
      setSent(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send reset link');
    } finally {
      setSubmitting(false);
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
        {sent ? (
          <EmptyState
            icon="send"
            title="Check your email"
            body="If an account exists for that address, a password-reset link is on its way."
            action={<Button label="Back to sign in" variant="secondary" onPress={() => navigation.goBack()} />}
          />
        ) : (
          <>
            <Label className="mb-2">Password reset</Label>
            <Txt className="text-title font-semibold text-fg">Reset password</Txt>
            <Txt className="mb-8 mt-2 text-callout text-muted">
              Enter your account email and we&apos;ll send a reset link.
            </Txt>
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value }, fieldState }) => (
                <TextField
                  label="Email"
                  placeholder="you@company.co.za"
                  icon="send"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={fieldState.error?.message}
                  className="mb-6"
                />
              )}
            />
            <Button label="Send reset link" onPress={handleSubmit(onSubmit)} loading={submitting} fullWidth />
          </>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}
