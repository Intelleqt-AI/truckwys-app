import { useState } from 'react';
import { View } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, IconButton } from '@/components/ui';
import {
  AuthLayout,
  AuthGroup,
  AuthField,
  AuthButton,
  AuthError,
  AuthHeading,
} from '../components';
import { forgotSchema, type ForgotValues } from '../schemas';
import { authApi } from '../api';
import { toast } from '@/lib/toast';
import type { AuthStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

// Step 1 of the code-based reset (mirrors web PasswordReset.tsx). The endpoint
// always returns 200 so it can't be used to enumerate accounts — we move to the
// code screen either way.
export function ForgotPasswordScreen({ navigation }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const { control, handleSubmit, formState } = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: ForgotValues) => {
    const email = values.email.trim();
    setSubmitting(true);
    try {
      await authApi.passwordReset(email);
      navigation.navigate('ResetPassword', { email });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send reset code');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen scroll={false} padded={false}>
      <View className="px-2 pt-1">
        <IconButton name="chevronLeft" accessibilityLabel="Back" onPress={() => navigation.goBack()} />
      </View>
      <AuthLayout>
        <AuthHeading
          title="Reset password"
          sub="Enter your account email and we'll send you a 6-digit reset code."
        />

        <AuthGroup>
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <AuthField
                placeholder="Email"
                accessibilityLabel="Email"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                returnKeyType="go"
                onSubmitEditing={handleSubmit(onSubmit)}
                last
              />
            )}
          />
        </AuthGroup>

        <AuthError message={formState.errors.email?.message} />

        <AuthButton label="Send reset code" onPress={handleSubmit(onSubmit)} loading={submitting} />
      </AuthLayout>
    </Screen>
  );
}
