import { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, TextField, SelectField, Toggle, Button, Txt, SaveSuccessOverlay } from '@/components/ui';
import { createSupplier, updateSupplier } from '@/lib/finance/api';
import {
  normaliseRegistrationNumber,
  registrationNumberProblem,
  vatNumberProblem,
} from '@/lib/finance/validation';
import { EXPENSE_CATEGORIES } from '../api';
import { str, pick } from '@/lib/api/list';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import { dismissKeyboard } from '@/lib/keyboard';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'SupplierForm'>;

const NO_CATEGORY = '';
const CATEGORY_OPTIONS = [
  { label: 'No usual category', value: NO_CATEGORY },
  ...EXPENSE_CATEGORIES.map((c) => ({ label: c.label, value: c.value })),
];

export function SupplierFormScreen({ route, navigation }: Props) {
  const editId = route.params?.id;
  const preview = (route.params?.preview ?? {}) as Record<string, unknown>;
  const editing = editId != null;
  const qc = useQueryClient();

  const [name, setName] = useState(str(pick(preview, ['name'])));
  const [category, setCategory] = useState(str(pick(preview, ['category'])));
  const [vat, setVat] = useState(str(pick(preview, ['vat_number'])));
  const [reg, setReg] = useState(str(pick(preview, ['registration_number'])));
  const [email, setEmail] = useState(str(pick(preview, ['email'])));
  const [phone, setPhone] = useState(str(pick(preview, ['phone'])));
  const [active, setActive] = useState(pick(preview, ['is_active']) !== false);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Supplier VAT and registration numbers are always checked as South African.
  const nameError = submitted && !name.trim() ? 'Name is required' : undefined;
  const vatError = vat.trim() ? (vatNumberProblem(vat) ?? undefined) : undefined;
  const regError = reg.trim() ? (registrationNumberProblem(reg) ?? undefined) : undefined;

  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    setDirty(true);
    set(v);
  };

  useUnsavedChangesGuard({
    navigation,
    isDirty: () => dirty && !busy && !saved,
    title: 'Discard changes?',
    message: editing ? "Your edits to this supplier haven't been saved." : "This supplier hasn't been saved.",
    buttons: [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', dispatch: true },
    ],
  });

  const submit = async () => {
    setSubmitted(true);
    if (!name.trim() || vatError || regError) return;
    void dismissKeyboard();
    setBusy(true);
    const payload = {
      name: name.trim(),
      category,
      vat_number: vat.replace(/[\s-]/g, ''),
      registration_number: normaliseRegistrationNumber(reg),
      email: email.trim(),
      phone: phone.trim(),
      ...(editing ? { is_active: active } : {}),
    };
    try {
      if (editing) await updateSupplier(editId, payload);
      else await createSupplier(payload);
      invalidateFor(qc, 'supplier');
      toast.success(editing ? 'Supplier updated' : 'Supplier added');
      setSaved(true);
    } catch (e) {
      // e.g. "A supplier with that name already exists" (names are unique per company).
      toast.error(e instanceof Error ? e.message : "Couldn't save the supplier");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-1">
      <SheetScreen
        title={editing ? 'Edit supplier' : 'Add supplier'}
        variant="modal"
        onBack={() => navigation.goBack()}
        footer={<Button label={editing ? 'Save changes' : 'Add supplier'} loading={busy} onPress={() => void submit()} fullWidth />}
      >
        <View className="gap-4">
          <TextField
            label="Name"
            required
            value={name}
            onChangeText={edit(setName)}
            placeholder="e.g. Engen Midrand"
            error={nameError}
            autoCapitalize="words"
            maxLength={200}
          />
          <SelectField
            label="Usual category"
            value={category}
            options={CATEGORY_OPTIONS}
            onSelect={edit(setCategory)}
          />
          <TextField
            label="VAT number"
            value={vat}
            onChangeText={edit(setVat)}
            placeholder="10 digits, starting with 4"
            keyboardType="number-pad"
            error={vatError}
            maxLength={20}
          />
          <TextField
            label="Company registration number"
            value={reg}
            onChangeText={edit(setReg)}
            placeholder="e.g. 2015/123456/07"
            error={regError}
            maxLength={20}
          />
          <TextField
            label="Email"
            value={email}
            onChangeText={edit(setEmail)}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextField label="Phone" value={phone} onChangeText={edit(setPhone)} keyboardType="phone-pad" maxLength={30} />

          {editing && (
            <View className="flex-row items-center justify-between rounded-control border border-line bg-surface px-3.5 py-3">
              <View className="flex-1 pr-3">
                <Txt className="text-body text-fg">Active</Txt>
                <Txt className="mt-0.5 text-caption text-muted">
                  Inactive suppliers are hidden from the expense picker but keep their history.
                </Txt>
              </View>
              <Toggle value={active} onValueChange={edit(setActive)} />
            </View>
          )}
        </View>
      </SheetScreen>

      <SaveSuccessOverlay
        visible={saved}
        title={editing ? 'Supplier updated' : 'Supplier added'}
        onDone={() => navigation.goBack()}
      />
    </View>
  );
}
