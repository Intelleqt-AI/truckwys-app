import { useState } from 'react';
import { View } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, TextField, Button } from '@/components/ui';
import { createCustomer, updateCustomer } from './api';
import { str, num, pick } from '@/lib/api/list';
import { toast } from '@/lib/toast';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'AddCustomer'>;

const schema = z.object({
  name: z.string().trim().min(1, 'Customer name is required'),
  email: z.string().trim().email('Enter a valid email').or(z.literal('')),
  phone: z.string().trim().optional(),
  credit_limit: z.string().trim().optional(),
});
type Values = z.infer<typeof schema>;

export function AddCustomerScreen({ route, navigation }: Props) {
  const editId = route.params?.id;
  const preview = (route.params?.preview ?? {}) as Record<string, unknown>;
  const editing = editId != null;
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { control, handleSubmit } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: str(pick(preview, ['name', 'company_name', 'customer_name'])),
      email: str(pick(preview, ['email'])),
      phone: str(pick(preview, ['phone'])),
      credit_limit: pick(preview, ['credit_limit']) != null ? String(num(pick(preview, ['credit_limit']))) : '',
    },
  });

  const onSubmit = async (v: Values) => {
    setBusy(true);
    const payload = {
      name: v.name.trim(),
      email: v.email || undefined,
      phone: v.phone?.trim() || undefined,
      credit_limit: v.credit_limit ? Number(v.credit_limit) : undefined,
    };
    try {
      if (editing) await updateCustomer(editId, payload);
      else await createCustomer(payload);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['customers'] }),
        editing ? qc.invalidateQueries({ queryKey: ['customer', editId] }) : Promise.resolve(),
      ]);
      toast.success(editing ? 'Customer updated' : 'Customer added');
      navigation.goBack();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save customer');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetScreen
      eyebrow={editing ? 'Edit' : 'New customer'}
      title={editing ? 'Edit customer' : 'Add customer'}
      onBack={() => navigation.goBack()}
      footer={
        <Button
          label={editing ? 'Save changes' : 'Save customer'}
          loading={busy}
          onPress={handleSubmit(onSubmit)}
          fullWidth
        />
      }
    >
      <View>
        <Controller
          control={control}
          name="name"
          render={({ field: { onChange, onBlur, value }, fieldState }) => (
            <TextField label="Customer name" icon="building" value={value} onChangeText={onChange} onBlur={onBlur} error={fieldState.error?.message} className="mb-4" />
          )}
        />
        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value }, fieldState }) => (
            <TextField label="Email" icon="send" autoCapitalize="none" keyboardType="email-address" value={value} onChangeText={onChange} onBlur={onBlur} error={fieldState.error?.message} className="mb-4" />
          )}
        />
        <Controller
          control={control}
          name="phone"
          render={({ field: { onChange, onBlur, value }, fieldState }) => (
            <TextField label="Phone" icon="phone" keyboardType="phone-pad" value={value ?? ''} onChangeText={onChange} onBlur={onBlur} error={fieldState.error?.message} className="mb-4" />
          )}
        />
        <Controller
          control={control}
          name="credit_limit"
          render={({ field: { onChange, onBlur, value }, fieldState }) => (
            <TextField label="Credit limit (ZAR)" icon="dollar" keyboardType="numeric" value={value ?? ''} onChangeText={onChange} onBlur={onBlur} error={fieldState.error?.message} />
          )}
        />
      </View>
    </SheetScreen>
  );
}
