import { useState } from 'react';
import { View, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Logo, Txt, Mono, Button, TextField } from '@/components/ui';
import { loginSchema, type LoginValues } from '../schemas';
import { authApi } from '../api';
import { isOtpRequired } from '@/types/auth';
import { useAuthStore } from '@/stores/authStore';
import { PRIVACY_POLICY_URL, TERMS_URL } from '@/lib/legal';
import { toast } from '@/lib/toast';
import type { AuthStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const setSession = useAuthStore((s) => s.setSession);
  const [submitting, setSubmitting] = useState(false);
  const { control, handleSubmit, formState } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });

  const onSubmit = async (values: LoginValues) => {
    setSubmitting(true);
    try {
      const res = await authApi.login(values.username.trim(), values.password);
      if (isOtpRequired(res)) {
        navigation.navigate('VerifyOtp', { pendingToken: res.pending_token, email: res.email });
      } else {
        await setSession(res.token, res.user);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sign in failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen scroll={false} padded={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-center px-screen"
      >
        <View className="mb-10 items-start">
          <Logo width={160} />
          <Mono className="mt-6 text-micro tracking-label uppercase text-faint">
            Operations terminal
          </Mono>
          <Txt className="mt-1 text-title font-semibold text-fg">Sign in</Txt>
        </View>

        <Controller
          control={control}
          name="username"
          render={({ field: { onChange, onBlur, value }, fieldState }) => (
            <TextField
              label="Email or username"
              placeholder="you@company.co.za"
              icon="user"
              autoCapitalize="none"
              autoComplete="username"
              keyboardType="email-address"
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
              label="Password"
              placeholder="Enter your password"
              icon="lock"
              secureTextEntry
              autoComplete="password"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={fieldState.error?.message}
              className="mb-2"
            />
          )}
        />

        <Pressable
          onPress={() => navigation.navigate('ForgotPassword')}
          hitSlop={8}
          className="mb-6 self-end"
        >
          <Mono className="text-caption text-accent">Forgot password?</Mono>
        </Pressable>

        <Button
          label="Sign in"
          onPress={handleSubmit(onSubmit)}
          loading={submitting}
          disabled={!formState.isValid && formState.isSubmitted}
          fullWidth
        />

        {/* Accounts are created on the web dashboard only — deliberately plain
            text with no link or browser hand-off. */}
        <Txt className="mt-8 text-center text-callout text-muted">
          New to Truckwys? Create your account at{' '}
          <Mono className="text-callout text-fg">truckwys.com</Mono>, then sign in here.
        </Txt>

        {/* Reachable without an account, so the policy is available even to
            someone who can't sign in (App Store Review 5.1.1). */}
        <View className="mt-8 flex-row justify-center gap-4">
          <Pressable onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL)} hitSlop={8}>
            <Mono className="text-caption text-muted">Privacy</Mono>
          </Pressable>
          <Txt className="text-caption text-faint">·</Txt>
          <Pressable onPress={() => void WebBrowser.openBrowserAsync(TERMS_URL)} hitSlop={8}>
            <Mono className="text-caption text-muted">Terms</Mono>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
