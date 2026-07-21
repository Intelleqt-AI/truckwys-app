import { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, SelectField, TextField, DateField, Button } from '@/components/ui';
import { createExpense } from './api';
import { toast } from '@/lib/toast';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'AddExpense'>;

const CATEGORIES = [
  'Fuel',
  'Maintenance',
  'Tolls',
  'Salaries',
  'Insurance',
  'Licensing',
  'Tyres',
  'Other',
].map((c) => ({ label: c, value: c }));

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function AddExpenseScreen({ navigation }: Props) {
  const qc = useQueryClient();
  const [category, setCategory] = useState('Fuel');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!(Number(amount) > 0)) return toast.error('Enter an amount');
    setBusy(true);
    try {
      await createExpense({
        category,
        amount: Number(amount),
        description,
        date,
      });
      await qc.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Expense added');
      navigation.goBack();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add expense');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetScreen
      eyebrow="New expense"
      title="Add expense"
      variant="modal"
      onBack={() => navigation.goBack()}
      footer={<Button label="Add expense" loading={busy} onPress={submit} fullWidth />}
    >
      <View className="gap-4">
        <SelectField label="Category" icon="dollar" options={CATEGORIES} value={category} onSelect={setCategory} />
        <TextField label="Amount (ZAR)" icon="dollar" keyboardType="numeric" value={amount} onChangeText={setAmount} />
        <TextField label="Description" placeholder="Optional note" value={description} onChangeText={setDescription} />
        <DateField label="Date" value={date} onChange={setDate} />
      </View>
    </SheetScreen>
  );
}
