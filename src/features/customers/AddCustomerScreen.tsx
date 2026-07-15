import { useState } from 'react';
import { View } from 'react-native';
import { useForm, Controller, type Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, TextField, SelectField, Button, type IconName } from '@/components/ui';
import { createCustomer, updateCustomer } from './api';
import { str, num, pick } from '@/lib/api/list';
import { toast } from '@/lib/toast';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'AddCustomer'>;

const PAYMENT_TERMS = [
  { label: 'Net 30 Days', value: 'NET30' },
  { label: 'Net 60 Days', value: 'NET60' },
  { label: 'Net 90 Days', value: 'NET90' },
];
const STATUS = [
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Inactive', value: 'INACTIVE' },
];

const schema = z.object({
  name: z.string().trim().min(1, 'Full name is required'),
  company_name: z.string().trim().optional(),
  email: z.string().trim().email('Enter a valid email'),
  phone: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  zip_code: z.string().trim().optional(),
  address: z.string().trim().optional(),
  billing_address: z.string().trim().optional(),
  credit_limit: z.string().trim().optional(),
});
type Values = z.infer<typeof schema>;

// Text fields in web order.
const FIELDS: { name: keyof Values; label: string; icon?: IconName; keyboardType?: 'email-address' | 'phone-pad' | 'numeric'; autoCapitalize?: 'none' | 'words' }[] = [
  { name: 'name', label: 'Full name', icon: 'user', autoCapitalize: 'words' },
  { name: 'company_name', label: 'Company name', icon: 'building', autoCapitalize: 'words' },
  { name: 'email', label: 'Email', icon: 'send', keyboardType: 'email-address', autoCapitalize: 'none' },
  { name: 'phone', label: 'Phone', icon: 'phone', keyboardType: 'phone-pad' },
  { name: 'city', label: 'City' },
  { name: 'state', label: 'Province / State' },
  { name: 'zip_code', label: 'Zip code', keyboardType: 'numeric' },
  { name: 'address', label: 'Address' },
  { name: 'billing_address', label: 'Billing address' },
];

export function AddCustomerScreen({ route, navigation }: Props) {
  const editId = route.params?.id;
  const preview = (route.params?.preview ?? {}) as Record<string, unknown>;
  const editing = editId != null;
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [paymentTerms, setPaymentTerms] = useState(str(pick(preview, ['payment_terms_default']), 'NET30'));
  const [status, setStatus] = useState(str(pick(preview, ['status'])).toUpperCase() || 'ACTIVE');

  const { control, handleSubmit } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: str(pick(preview, ['name', 'company_name', 'customer_name'])),
      company_name: str(pick(preview, ['company_name'])),
      email: str(pick(preview, ['email'])),
      phone: str(pick(preview, ['phone'])),
      city: str(pick(preview, ['city'])),
      state: str(pick(preview, ['state'])),
      zip_code: str(pick(preview, ['zip_code'])),
      address: str(pick(preview, ['address'])),
      billing_address: str(pick(preview, ['billing_address'])),
      credit_limit: pick(preview, ['credit_limit']) != null ? String(num(pick(preview, ['credit_limit']))) : '',
    },
  });

  const onSubmit = async (v: Values) => {
    setBusy(true);
    const payload: Record<string, unknown> = {
      name: v.name.trim(),
      company_name: v.company_name?.trim() || undefined,
      email: v.email.trim(),
      phone: v.phone?.trim() || undefined,
      city: v.city?.trim() || undefined,
      state: v.state?.trim() || undefined,
      zip_code: v.zip_code?.trim() || undefined,
      address: v.address?.trim() || undefined,
      billing_address: v.billing_address?.trim() || undefined,
      payment_terms_default: paymentTerms,
      status,
    };
    if (v.credit_limit) payload.credit_limit = Number(v.credit_limit);
    try {
      if (editing) await updateCustomer(editId, payload);
      else await createCustomer(payload);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['customers'] }),
        editing ? qc.invalidateQueries({ queryKey: ['customer', editId] }) : Promise.resolve(),
      ]);
      toast.success(editing ? 'Customer updated' : 'Customer created');
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
          label={editing ? 'Save changes' : 'Create customer'}
          loading={busy}
          onPress={handleSubmit(onSubmit)}
          fullWidth
        />
      }
    >
      <View className="gap-4">
        {FIELDS.map((f) => (
          <Field key={f.name} control={control} field={f} />
        ))}
        <SelectField label="Payment terms" icon="card" options={PAYMENT_TERMS} value={paymentTerms} onSelect={setPaymentTerms} />
        <Controller
          control={control}
          name="credit_limit"
          render={({ field: { onChange, onBlur, value }, fieldState }) => (
            <TextField label="Credit limit (R)" icon="dollar" keyboardType="numeric" value={value ?? ''} onChangeText={onChange} onBlur={onBlur} error={fieldState.error?.message} />
          )}
        />
        <SelectField label="Status" icon="user" options={STATUS} value={status} onSelect={setStatus} />
      </View>
    </SheetScreen>
  );
}

function Field({ control, field: f }: { control: Control<Values>; field: (typeof FIELDS)[number] }) {
  return (
    <Controller
      control={control}
      name={f.name}
      render={({ field: { onChange, onBlur, value }, fieldState }) => (
        <TextField
          label={f.label}
          icon={f.icon}
          keyboardType={f.keyboardType}
          autoCapitalize={f.autoCapitalize}
          value={value ?? ''}
          onChangeText={onChange}
          onBlur={onBlur}
          error={fieldState.error?.message}
        />
      )}
    />
  );
}
