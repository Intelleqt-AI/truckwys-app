import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, SelectField, TextField, DateField, Button, DetailRow, Group } from '@/components/ui';
import { createInvoice } from './api';
import { useCustomers } from '@/features/customers/api';
import { formatCurrency } from '@/lib/formatters';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'CreateInvoice'>;

function plusDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const today = () => plusDays(0);

export function CreateInvoiceScreen({ navigation }: Props) {
  const qc = useQueryClient();
  const { data: customers } = useCustomers();
  const [customerId, setCustomerId] = useState('');
  const [subtotal, setSubtotal] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(plusDays(30));
  const [busy, setBusy] = useState(false);

  const options = useMemo(
    () => (customers ?? []).map((c) => ({ label: c.name, value: String(c.id) })),
    [customers],
  );
  const sub = Number(subtotal) || 0;
  const vat = Math.round(sub * 0.15 * 100) / 100;
  const total = sub + vat;

  const submit = async () => {
    if (!customerId) return toast.error('Select a customer');
    if (sub <= 0) return toast.error('Enter an amount');
    if (dueDate < today()) return toast.error('Due date cannot be in the past');
    setBusy(true);
    try {
      await createInvoice({
        customer: Number(customerId),
        subtotal: sub,
        total_amount: total,
        // The Invoice model has no `description` column — the free-text field
        // it does have is `notes`. Sending `description` looked like it worked
        // (DRF drops unknown keys silently) but the text was never stored.
        notes: description,
        due_date: dueDate,
        // invoice_number, balance and status are all filled server-side
        // (InvoiceSerializer.create / model defaults). 'UNPAID' isn't even a
        // valid status choice — sending it was what 400'd every create.
      });
      invalidateFor(qc, 'invoice');
      toast.success('Invoice created');
      navigation.goBack();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create invoice');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetScreen
      eyebrow="New invoice"
      title="Create invoice"
      variant="modal"
      onBack={() => navigation.goBack()}
      footer={<Button label="Create invoice" loading={busy} onPress={submit} fullWidth />}
    >
      <View className="gap-4">
        <SelectField label="Customer" icon="building" placeholder="Select customer" options={options} value={customerId} onSelect={setCustomerId} />
        <TextField label="Amount (excl. VAT)" placeholder="0.00" icon="dollar" keyboardType="numeric" value={subtotal} onChangeText={setSubtotal} />
        <TextField label="Description" placeholder="What is this invoice for?" value={description} onChangeText={setDescription} />
        <DateField label="Due date" value={dueDate} onChange={setDueDate} />

        <Group label="Summary">
          <DetailRow label="Subtotal" value={formatCurrency(sub)} />
          <DetailRow label="VAT (15%)" value={formatCurrency(vat)} />
          <DetailRow label="Total" value={formatCurrency(total)} last />
        </Group>
      </View>
    </SheetScreen>
  );
}
