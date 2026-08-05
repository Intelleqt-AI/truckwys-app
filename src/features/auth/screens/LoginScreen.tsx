import { useState } from 'react';
import { View, Pressable } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Logo, Txt, Mono } from '@/components/ui';
import {
  AuthLayout,
  AuthGroup,
  AuthField,
  AuthButton,
  AuthError,
  AuthLink,
} from '../components';
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

  const firstError = formState.errors.username?.message ?? formState.errors.password?.message;

  return (
    <Screen scroll={false} padded={false}>
      <AuthLayout>
        <View className="mb-9 items-center">
          <Logo width={172} />
          <Txt className="mt-9 text-title font-semibold text-fg">Sign in</Txt>
          <Txt className="mt-1.5 text-center text-body text-muted">
            Use your Truckwys account to continue
          </Txt>
        </View>

        <AuthGroup>
          <Controller
            control={control}
            name="username"
            render={({ field: { onChange, onBlur, value } }) => (
              <AuthField
                placeholder="Email or username"
                accessibilityLabel="Email or username"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="username"
                autoComplete="username"
                returnKeyType="next"
              />
            )}
          />
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <AuthField
                placeholder="Password"
                accessibilityLabel="Password"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                secure
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                autoComplete="current-password"
                returnKeyType="go"
                onSubmitEditing={handleSubmit(onSubmit)}
                last
              />
            )}
          />
        </AuthGroup>

        <AuthError message={firstError} />

        <AuthButton label="Sign in" onPress={handleSubmit(onSubmit)} loading={submitting} />

        <AuthLink label="Forgot password?" onPress={() => navigation.navigate('ForgotPassword')} />

        {/* Accounts are created on the web dashboard only — deliberately plain
            text with no link or browser hand-off. */}
        <Txt className="mt-12 text-center text-sub text-muted">
          New to Truckwys? Create your account at{' '}
          <Mono className="text-sub text-fg">truckwys.com</Mono>, then sign in here.
        </Txt>

        {/* Reachable without an account, so the policy is available even to
            someone who can't sign in (App Store Review 5.1.1). */}
        <View className="mb-2 mt-7 flex-row items-center justify-center gap-3">
          <Pressable onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL)} hitSlop={10}>
            <Txt className="text-caption text-faint">Privacy Policy</Txt>
          </Pressable>
          <Txt className="text-caption text-faint">·</Txt>
          <Pressable onPress={() => void WebBrowser.openBrowserAsync(TERMS_URL)} hitSlop={10}>
            <Txt className="text-caption text-faint">Terms of Service</Txt>
          </Pressable>
        </View>
      </AuthLayout>
    </Screen>
  );
}
