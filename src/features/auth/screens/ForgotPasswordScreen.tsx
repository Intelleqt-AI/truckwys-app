import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthScreen, AuthTitle, SignInField, SignInButton, InlineError, useErrorShake } from '../authComponents';
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
  const [serverError, setServerError] = useState<string | null>(null);
  const { shakeStyle, trigger: triggerShake } = useErrorShake();

  const { control, handleSubmit, formState } = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
    mode: 'onBlur',
  });

  const onSubmit = async (values: ForgotValues) => {
    const email = values.email.trim();
    setServerError(null);
    setSubmitting(true);
    try {
      await authApi.passwordReset(email);
      navigation.navigate('ResetPassword', { email });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not send reset code';
      setServerError(message);
      toast.error(message);
      triggerShake();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthScreen onBack={() => navigation.goBack()}>
      <Animated.View entering={FadeInDown.delay(80).duration(400)}>
        <AuthTitle
          title="Reset password"
          sub="Enter your account email and we'll send you a 6-digit reset code."
        />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(160).duration(400)} style={{ marginTop: 24 }}>
        <Animated.View style={shakeStyle}>
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <SignInField
                label="Email"
                icon="mail"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={formState.errors.email?.message}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
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

      <Animated.View entering={FadeInDown.delay(220).duration(400)} style={{ marginTop: 20 }}>
        <SignInButton
          label="Send reset code"
          onPress={handleSubmit(onSubmit, triggerShake)}
          loading={submitting}
        />
      </Animated.View>
    </AuthScreen>
  );
}
