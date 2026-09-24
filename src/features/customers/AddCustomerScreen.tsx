import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useForm, Controller, type Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, TextField, SelectField, Button, type IconName } from '@/components/ui';
import { createCustomer, updateCustomer } from './api';
import { str, num, pick } from '@/lib/api/list';
import { parseNum } from '@/lib/formatters';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import { useDemo } from '@/hooks/useDemo';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'AddCustomer'>;

// NET7/14/45 joined 30/60/90 on the backend (migration 0125) — customers on
// those terms already existed in seeders and real lists before they were
// offered as choices, and were invoiced at 30 days regardless (chased a
// fortnight early on NET45, or 16 days late on NET14).
const PAYMENT_TERMS_DAYS = [7, 14, 30, 45, 60, 90];
const PAYMENT_TERMS = PAYMENT_TERMS_DAYS.map((d) => ({ label: `Net ${d} Days`, value: `NET${d}` }));
const STATUS = [
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Inactive', value: 'INACTIVE' },
];

const schema = z.object({
  name: z.string().trim().min(1, 'Customer name is required'),
  company_name: z.string().trim().optional(),
  // The human you actually phone there — distinct from `name`, the business
  // itself (backend migration 0124). Optional: plenty of customers are just a
  // company switchboard.
  contact_person: z.string().trim().optional(),
  email: z.string().trim().email('Enter a valid email'),
  phone: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  zip_code: z.string().trim().optional(),
  address: z.string().trim().optional(),
  billing_address: z.string().trim().optional(),
  credit_limit: z
    .string()
    .trim()
    .optional()
    // Validated here rather than at submit so the message lands on the field.
    // parseNum accepts `50 000` and `50000,50` as well as a plain integer.
    .refine((v) => !v || parseNum(v) != null, 'Enter a number, e.g. 50 000'),
});
type Values = z.infer<typeof schema>;

// Text fields in web order.
const FIELDS: { name: keyof Values; label: string; placeholder?: string; icon?: IconName; keyboardType?: 'email-address' | 'phone-pad' | 'numeric'; autoCapitalize?: 'none' | 'words' }[] = [
  { name: 'name', label: 'Customer name', placeholder: 'Business or customer name', icon: 'user', autoCapitalize: 'words' },
  { name: 'company_name', label: 'Company name', placeholder: 'Acme Logistics', icon: 'building', autoCapitalize: 'words' },
  { name: 'contact_person', label: 'Contact person', placeholder: 'Who to phone there', icon: 'user', autoCapitalize: 'words' },
  { name: 'email', label: 'Email', placeholder: 'billing@company.co.za', icon: 'send', keyboardType: 'email-address', autoCapitalize: 'none' },
  { name: 'phone', label: 'Phone', placeholder: '+27 82 123 4567', icon: 'phone', keyboardType: 'phone-pad' },
  { name: 'city', label: 'City', placeholder: 'Cape Town' },
  { name: 'state', label: 'Province / State', placeholder: 'Western Cape' },
  { name: 'zip_code', label: 'Zip code', placeholder: '8001', keyboardType: 'numeric' },
  { name: 'address', label: 'Address', placeholder: 'Street address' },
  { name: 'billing_address', label: 'Billing address', placeholder: 'If different from address' },
];

export function AddCustomerScreen({ route, navigation }: Props) {
  const editId = route.params?.id;
  const preview = (route.params?.preview ?? {}) as Record<string, unknown>;
  const editing = editId != null;
  const qc = useQueryClient();
  const demo = useDemo();
  const [busy, setBusy] = useState(false);
  const [paymentTerms, setPaymentTerms] = useState(str(pick(preview, ['payment_terms_default']), 'NET30'));
  const [status, setStatus] = useState(str(pick(preview, ['status'])).toUpperCase() || 'ACTIVE');
  // A record can carry any NET<n> (invoicing reads the number, not a fixed
  // table — see invoice_generator.py's _calculate_due_date), so a value
  // outside the offered list is added as its own option rather than silently
  // falling back to something the customer isn't actually on.
  const paymentTermsOptions = useMemo(() => {
    if (PAYMENT_TERMS.some((o) => o.value === paymentTerms)) return PAYMENT_TERMS;
    const days = parseInt(paymentTerms.replace(/\D/g, ''), 10);
    return [...PAYMENT_TERMS, { label: Number.isFinite(days) ? `Net ${days} Days` : paymentTerms, value: paymentTerms }]
      .sort((a, b) => parseInt(a.value.slice(3), 10) - parseInt(b.value.slice(3), 10));
  }, [paymentTerms]);

  const { control, handleSubmit } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: str(pick(preview, ['name', 'company_name', 'customer_name'])),
      company_name: str(pick(preview, ['company_name'])),
      contact_person: str(pick(preview, ['contact_person'])),
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
    // Defense in depth — the entry points that reach this screen already
    // block, but customers are fixed seeded data in the demo company, so this
    // is the actual save.
    if (demo.block()) return;
    setBusy(true);
    const payload: Record<string, unknown> = {
      name: v.name.trim(),
      company_name: v.company_name?.trim() || undefined,
      contact_person: v.contact_person?.trim() || undefined,
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
    if (v.credit_limit) payload.credit_limit = parseNum(v.credit_limit) ?? undefined;
    try {
      if (editing) await updateCustomer(editId, payload);
      else await createCustomer(payload);
      invalidateFor(qc, 'customer');
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
      variant="modal"
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
        <SelectField label="Payment terms" icon="card" options={paymentTermsOptions} value={paymentTerms} onSelect={setPaymentTerms} />
        <Controller
          control={control}
          name="credit_limit"
          render={({ field: { onChange, onBlur, value }, fieldState }) => (
            <TextField
              label="Credit limit"
              prefix="R"
              placeholder="e.g. 50 000"
              keyboardType="decimal-pad"
              numeric
              value={value ?? ''}
              onChangeText={onChange}
              onBlur={onBlur}
              error={fieldState.error?.message}
            />
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
          placeholder={f.placeholder}
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
