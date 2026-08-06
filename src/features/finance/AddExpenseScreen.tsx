import { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, SelectField, TextField, DateField, Button } from '@/components/ui';
import { createExpense, updateExpense, EXPENSE_CATEGORIES } from './api';
import { useVehicles } from '@/features/fleet/api';
import { num, str, pick } from '@/lib/api/list';
import { parseNum, formatPlain } from '@/lib/formatters';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'AddExpense'>;

const today = () => new Date().toISOString().slice(0, 10);
// Web embeds fuel litres/price into `notes` as "Fuel: {L}L @ R{price}/L".
//
// The character class has to allow a comma and a grouping space, not just
// [\d.]: a South African keyboard types `23,40`, and once the field grouped its
// value on blur it can also be `1 350`. With the old dot-only pattern neither
// re-populated on edit — the fields just came back empty. We still WRITE a
// canonical dot-decimal, so the round-trip matches what web produces.
const FUEL_NOTE = /Fuel:\s*([\d.,  ]+?)L\s*@\s*R?\s*([\d.,  ]+?)\/L\s*\n?/i;

/** Field text for a parsed number: comma decimal, no grouping. */
const asFieldValue = (v: string | null | undefined): string => {
  const n = parseNum(v);
  return n == null ? '' : formatPlain(n);
};

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
  const [litres, setLitres] = useState(asFieldValue(fuelMatch?.[1]));
  const [pricePerLitre, setPricePerLitre] = useState(asFieldValue(fuelMatch?.[2]));
  const [amount, setAmount] = useState(
    pick(preview, ['amount']) != null
      ? formatPlain(num(pick(preview, ['amount'])), 2)
      : '',
  );
  const [amountError, setAmountError] = useState<string>();
  const [date, setDate] = useState(str(pick(preview, ['expense_date', 'date'])) || today());
  const [vehicle, setVehicle] = useState(str(pick(preview, ['vehicle'])));
  const [vendor, setVendor] = useState(str(pick(preview, ['vendor'])));
  const [receipt, setReceipt] = useState(str(pick(preview, ['receipt_number'])));
  const [notes, setNotes] = useState(rawNotes.replace(FUEL_NOTE, '').trim());
  const [busy, setBusy] = useState(false);

  const isFuel = category === 'FUEL';
  // Auto-calc amount for fuel when litres × price are both present (readonly then).
  //
  // parseNum, not Number: Number('23,40') is NaN, which is why entering a price
  // with the comma this keyboard produces left Amount empty and — if the user
  // typed the total by hand to get past it — wrote the literal string 'RNaN'
  // into the saved note below.
  const litresN = parseNum(litres) ?? 0;
  const priceN = parseNum(pricePerLitre) ?? 0;
  const autoAmount = isFuel && litresN > 0 && priceN > 0;
  const effectiveAmount = autoAmount ? formatPlain(litresN * priceN, 2) : amount;

  const vehicleOptions = [
    { label: 'None', value: '' },
    ...(vehicles ?? []).map((v) => ({ label: `${v.name}${v.plate ? ` · ${v.plate}` : ''}`, value: String(v.id) })),
  ];

  const submit = async () => {
    if (!description.trim()) return toast.error('Enter a description');
    const amountN = parseNum(effectiveAmount);
    if (amountN == null) {
      setAmountError('Enter a number, e.g. 1 250,00');
      return toast.error('Amount is not a number');
    }
    if (!(amountN > 0)) {
      setAmountError('Must be more than 0');
      return toast.error('Enter an amount');
    }
    setAmountError(undefined);
    setBusy(true);
    try {
      let outNotes = notes.trim();
      if (isFuel && litresN > 0 && priceN > 0) {
        // Written with plain dot decimals and no grouping — this string is data
        // the FUEL_NOTE regex has to read back, and web writes the same shape.
        outNotes = `Fuel: ${litresN}L @ R${priceN.toFixed(2)}/L${outNotes ? `\n${outNotes}` : ''}`;
      }
      const payload = {
        category,
        description: description.trim(),
        amount: amountN,
        expense_date: date,
        // vehicle is a nullable FK, so null is right for "no vehicle".
        vehicle: vehicle || null,
        // vendor/receipt_number are blank=True but NOT null=True, so DRF sets
        // allow_null=False on them — sending null 400s ("may not be null"),
        // which meant an expense only saved if BOTH were filled in. '' is the
        // empty value those columns actually accept, and it also makes
        // clearing a vendor possible on the edit (PATCH) path.
        vendor: vendor.trim(),
        receipt_number: receipt.trim(),
        notes: outNotes,
      };
      if (editing) await updateExpense(editId, payload);
      else await createExpense(payload);
      invalidateFor(qc, 'expense');
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
              <TextField label="Litres" placeholder="e.g. 350" keyboardType="decimal-pad" numeric value={litres} onChangeText={setLitres} />
            </View>
            <View className="flex-1">
              <TextField label="Price / litre" placeholder="e.g. 23,40" prefix="R" keyboardType="decimal-pad" value={pricePerLitre} onChangeText={setPricePerLitre} />
            </View>
          </View>
        )}

        <TextField
          label="Amount (ZAR)"
          placeholder="0,00"
          prefix="R"
          // decimal-pad, not numeric: on Android `numeric` offers a minus sign,
          // which is meaningless for an expense amount.
          keyboardType="decimal-pad"
          numeric
          decimals={2}
          error={amountError}
          value={effectiveAmount}
          onChangeText={(t) => {
            setAmount(t);
            setAmountError(undefined);
          }}
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
