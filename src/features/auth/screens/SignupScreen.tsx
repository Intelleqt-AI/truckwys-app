import { useState } from 'react';
import { View, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Txt, Mono, Label, Button, TextField, IconButton } from '@/components/ui';
import { signupSchema, type SignupValues } from '../schemas';
import { authApi } from '../api';
import { isOtpRequired } from '@/types/auth';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/lib/toast';
import type { AuthStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Signup'>;

const FIELDS = [
  { name: 'name', label: 'Full name', icon: 'user', props: { autoCapitalize: 'words' } },
  { name: 'company_name', label: 'Company', icon: 'building', props: { autoCapitalize: 'words' } },
  {
    name: 'email',
    label: 'Email',
    icon: 'send',
    props: { autoCapitalize: 'none', keyboardType: 'email-address' },
  },
  { name: 'phone', label: 'Phone (optional)', icon: 'phone', props: { keyboardType: 'phone-pad' } },
] as const;

export function SignupScreen({ navigation }: Props) {
  const setSession = useAuthStore((s) => s.setSession);
  const [submitting, setSubmitting] = useState(false);
  const { control, handleSubmit } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: '', company_name: '', email: '', phone: '', password: '', confirm: '' },
  });

  const onSubmit = async (values: SignupValues) => {
    setSubmitting(true);
    try {
      const res = await authApi.register({
        email: values.email.trim(),
        password: values.password,
        name: values.name.trim(),
        company_name: values.company_name.trim(),
        phone: values.phone?.trim() || undefined,
      });
      if (isOtpRequired(res)) {
        navigation.navigate('VerifyOtp', { pendingToken: res.pending_token, email: res.email });
      } else {
        await setSession(res.token, res.user);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sign up failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <View className="-ml-2 pt-1">
        <IconButton name="chevronLeft" accessibilityLabel="Back" onPress={() => navigation.goBack()} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Label className="mb-2 mt-2">Get started</Label>
        <Txt className="mb-6 text-title font-semibold text-fg">Create your account</Txt>

        {FIELDS.map((f) => (
          <Controller
            key={f.name}
            control={control}
            name={f.name}
            render={({ field: { onChange, onBlur, value }, fieldState }) => (
              <TextField
                label={f.label}
                icon={f.icon}
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                error={fieldState.error?.message}
                className="mb-4"
                {...f.props}
              />
            )}
          />
        ))}
        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value }, fieldState }) => (
            <TextField
              label="Password"
              icon="lock"
              secureTextEntry
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
          name="confirm"
          render={({ field: { onChange, onBlur, value }, fieldState }) => (
            <TextField
              label="Confirm password"
              icon="lock"
              secureTextEntry
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={fieldState.error?.message}
              className="mb-6"
            />
          )}
        />

        <Button label="Create account" onPress={handleSubmit(onSubmit)} loading={submitting} fullWidth />

        <View className="mb-4 mt-8 flex-row justify-center gap-1.5">
          <Txt className="text-callout text-muted">Already have an account?</Txt>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <Mono className="text-callout text-accent">Sign in</Mono>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
