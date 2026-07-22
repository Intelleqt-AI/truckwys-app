import { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, SelectField, TextField, DateField, Button } from '@/components/ui';
import { createExpense, updateExpense, EXPENSE_CATEGORIES } from './api';
import { useVehicles } from '@/features/fleet/api';
import { num, str, pick } from '@/lib/api/list';
import { toast } from '@/lib/toast';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'AddExpense'>;

const today = () => new Date().toISOString().slice(0, 10);
// Web embeds fuel litres/price into `notes` as "Fuel: {L}L @ R{price}/L".
const FUEL_NOTE = /Fuel:\s*([\d.]+)L\s*@\s*R?([\d.]+)\/L\s*\n?/i;

export function AddExpenseScreen({ route, navigation }: Props) {
  const editId = route.params?.id;
  const editing = editId != null;
  const preview = (route.params?.preview ?? {}) as Record<string, unknown>;
  const qc = useQueryClient();
  const { data: vehicles } = useVehicles();

  const rawNotes = str(pick(preview, ['notes']));
  const fuelMatch = rawNotes.match(FUEL_NOTE);

  const [category, setCategory] = useState(str(pick(preview, ['category']), 'FUEL').toUpperCase());
  const [description, setDescription] = useState(str(pick(preview, ['description'])));
  const [litres, setLitres] = useState(fuelMatch?.[1] ?? '');
  const [pricePerLitre, setPricePerLitre] = useState(fuelMatch?.[2] ?? '');
  const [amount, setAmount] = useState(
    pick(preview, ['amount']) != null ? String(num(pick(preview, ['amount']))) : '',
  );
  const [date, setDate] = useState(str(pick(preview, ['expense_date', 'date'])) || today());
  const [vehicle, setVehicle] = useState(str(pick(preview, ['vehicle'])));
  const [vendor, setVendor] = useState(str(pick(preview, ['vendor'])));
  const [receipt, setReceipt] = useState(str(pick(preview, ['receipt_number'])));
  const [notes, setNotes] = useState(rawNotes.replace(FUEL_NOTE, '').trim());
  const [busy, setBusy] = useState(false);

  const isFuel = category === 'FUEL';
  // Auto-calc amount for fuel when litres × price are both present (readonly then).
  const litresN = Number(litres);
  const priceN = Number(pricePerLitre);
  const autoAmount = isFuel && litresN > 0 && priceN > 0;
  const effectiveAmount = autoAmount ? (litresN * priceN).toFixed(2) : amount;

  const vehicleOptions = [
    { label: 'None', value: '' },
    ...(vehicles ?? []).map((v) => ({ label: `${v.name}${v.plate ? ` · ${v.plate}` : ''}`, value: String(v.id) })),
  ];

  const submit = async () => {
    if (!description.trim()) return toast.error('Enter a description');
    if (!(Number(effectiveAmount) > 0)) return toast.error('Enter an amount');
    setBusy(true);
    try {
      let outNotes = notes.trim();
      if (isFuel && litres && pricePerLitre) {
        outNotes = `Fuel: ${litres}L @ R${Number(pricePerLitre).toFixed(2)}/L${outNotes ? `\n${outNotes}` : ''}`;
      }
      const payload = {
        category,
        description: description.trim(),
        amount: Number(effectiveAmount),
        expense_date: date,
        vehicle: vehicle || null,
        vendor: vendor.trim() || null,
        receipt_number: receipt.trim() || null,
        notes: outNotes,
      };
      if (editing) await updateExpense(editId, payload);
      else await createExpense(payload);
      await qc.invalidateQueries({ queryKey: ['expenses'] });
      toast.success();
      navigation.goBack();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save expense');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetScreen
      eyebrow={editing ? 'Edit' : 'New expense'}
      title={editing ? 'Edit expense' : 'Add expense'}
      variant="modal"
      onBack={() => navigation.goBack()}
      footer={
        <Button label={editing ? 'Save changes' : 'Add expense'} loading={busy} onPress={submit} fullWidth />
      }
    >
      <View className="gap-4">
        <SelectField label="Category" icon="dollar" options={EXPENSE_CATEGORIES} value={category} onSelect={setCategory} />
        <TextField label="Description" placeholder="What was this for?" value={description} onChangeText={setDescription} />

        {isFuel && (
          <View className="flex-row gap-3">
            <View className="flex-1">
              <TextField label="Litres" placeholder="e.g. 350" keyboardType="numeric" value={litres} onChangeText={setLitres} />
            </View>
            <View className="flex-1">
              <TextField label="Price / litre" placeholder="e.g. 23.40" keyboardType="numeric" value={pricePerLitre} onChangeText={setPricePerLitre} />
            </View>
          </View>
        )}

        <TextField
          label="Amount (ZAR)"
          placeholder="0.00"
          icon="dollar"
          keyboardType="numeric"
          value={effectiveAmount}
          onChangeText={setAmount}
          editable={!autoAmount}
        />
        <DateField label="Date" value={date} onChange={setDate} />
        <SelectField label="Vehicle" icon="truck" options={vehicleOptions} value={vehicle} onSelect={setVehicle} placeholder="None" />
        <TextField label="Vendor" placeholder="e.g. Shell, BP" value={vendor} onChangeText={setVendor} />
        <TextField label="Receipt #" placeholder="Optional" value={receipt} onChangeText={setReceipt} />
        <TextField label="Notes" placeholder="Optional note" value={notes} onChangeText={setNotes} multiline />
      </View>
    </SheetScreen>
  );
}
