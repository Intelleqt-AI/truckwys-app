import { useState } from 'react';
import { View, Pressable } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  KeyboardAwareScrollView,
  useReanimatedKeyboardAnimation,
} from 'react-native-keyboard-controller';
import * as WebBrowser from 'expo-web-browser';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt, Mono, Icon } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import {
  LoginHero,
  SignInField,
  SignInButton,
  InlineError,
  useErrorShake,
} from '../authComponents';
import { loginSchema, type LoginValues } from '../schemas';
import { authApi } from '../api';
import { isOtpRequired } from '@/types/auth';
import { useAuthStore } from '@/stores/authStore';
import { PRIVACY_POLICY_URL, TERMS_URL, SITE_URL } from '@/lib/legal';
import { toast } from '@/lib/toast';
import type { AuthStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const setSession = useAuthStore((s) => s.setSession);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { progress } = useReanimatedKeyboardAnimation();

  const { control, handleSubmit, formState } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
    mode: 'onBlur',
  });

  const { shakeStyle, trigger: triggerShake } = useErrorShake();

  const onSubmit = async (values: LoginValues) => {
    setServerError(null);
    setSubmitting(true);
    try {
      const res = await authApi.login(values.username.trim(), values.password);
      if (isOtpRequired(res)) {
        navigation.navigate('VerifyOtp', { pendingToken: res.pending_token, email: res.email });
      } else {
        await setSession(res.token, res.user);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Sign in failed';
      setServerError(message);
      toast.error(message);
      triggerShake();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="flex-1 bg-bg-deep" style={{ paddingTop: insets.top }}>
      <LoginHero progress={progress} />

      {/* Tracks the focused input directly and keeps it above the keyboard on
          both platforms — a plain ScrollView + KeyboardAvoidingView doesn't
          auto-scroll to a field that ends up under the keyboard. */}
      <KeyboardAwareScrollView
        bottomOffset={24}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 24,
          paddingTop: 28,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.delay(120).duration(400)}>
          <Txt className="text-display font-semibold text-fg">Sign in</Txt>
          <Txt className="mt-1.5 text-body text-muted">Use your Truckwys account to continue</Txt>
        </Animated.View>

        {/* Entrance (mount) and the error shake (continuous) both drive
              `transform`, so they need separate Animated.Views — Reanimated
              warns if a layout animation and useAnimatedStyle share one. */}
        <Animated.View entering={FadeInDown.delay(180).duration(400)}>
          <Animated.View style={[{ marginTop: 24, gap: 12 }, shakeStyle]}>
            <Controller
              control={control}
              name="username"
              render={({ field: { onChange, onBlur, value } }) => (
                <SignInField
                  label="Email or username"
                  icon="mail"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={formState.errors.username?.message}
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
                <SignInField
                  label="Password"
                  icon="lock"
                  secure
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={formState.errors.password?.message}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="password"
                  autoComplete="current-password"
                  returnKeyType="go"
                  onSubmitEditing={handleSubmit(onSubmit, triggerShake)}
                />
              )}
            />
          </Animated.View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(240).duration(400)}>
          <Pressable
            onPress={() => navigation.navigate('ForgotPassword')}
            hitSlop={10}
            className="mb-1 mt-2.5 self-end"
          >
            <Txt className="text-sub text-accent">Forgot password?</Txt>
          </Pressable>
        </Animated.View>

        {!!serverError && (
          <View className="mt-1">
            <InlineError message={serverError} />
          </View>
        )}

        <Animated.View entering={FadeInDown.delay(300).duration(400)} style={{ marginTop: 20 }}>
          <SignInButton
            label="Sign in"
            onPress={handleSubmit(onSubmit, triggerShake)}
            loading={submitting}
          />
        </Animated.View>

        {/* Absorbs the leftover space on tall screens so the footer sits near
              the bottom of the screen instead of right under the button. On a
              short screen (or with the keyboard up) this just collapses to the
              min gap and the ScrollView takes over. */}
        <View style={{ flex: 1, minHeight: 28 }} />

        <Animated.View entering={FadeInDown.delay(380).duration(400)}>
          {/* Accounts are created on the web dashboard only — tapping the URL
                hands off to the browser rather than signing in inline. */}
          <View className="flex-row flex-wrap items-center justify-center">
            <Txt className="text-sub text-muted">New to Truckwys? Create your account at </Txt>
            <Pressable
              onPress={() => void WebBrowser.openBrowserAsync(SITE_URL)}
              hitSlop={6}
              className="flex-row items-center gap-1"
              accessibilityRole="link"
            >
              <Mono
                className="text-sub text-accent"
                style={{ textDecorationLine: 'underline' }}
              >
                truckwys.com
              </Mono>
              <Icon name="externalLink" size={12} color={colors.accent} strokeWidth={2} />
            </Pressable>
            <Txt className="text-sub text-muted">, then sign in here.</Txt>
          </View>

          {/* Reachable without an account, so the policy is available even to
                someone who can't sign in (App Store Review 5.1.1). */}
          <View className="mb-2 mt-6 flex-row items-center justify-center gap-3">
            <Pressable
              onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL)}
              hitSlop={10}
            >
              <Txt className="text-caption text-faint">Privacy Policy</Txt>
            </Pressable>
            <Txt className="text-caption text-faint">·</Txt>
            <Pressable onPress={() => void WebBrowser.openBrowserAsync(TERMS_URL)} hitSlop={10}>
              <Txt className="text-caption text-faint">Terms of Service</Txt>
            </Pressable>
          </View>
        </Animated.View>
      </KeyboardAwareScrollView>
    </View>
  );
}
