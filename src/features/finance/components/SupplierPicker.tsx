import { useMemo, useState } from 'react';
import { View, Modal, StyleSheet, TouchableOpacity } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { SelectField, TextField, Button, Txt } from '@/components/ui';
import { fetchData } from '@/lib/api/client';
import { createSupplier } from '@/lib/finance/api';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { vatNumberProblem } from '@/lib/finance/validation';
import type { Supplier } from '@/lib/finance/types';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';

// Picks the supplier an expense was bought from. Options are the first active
// suppliers matching what was typed (the server searches name, VAT or
// registration number and email, so a long supplier list is never downloaded),
// "No supplier" or, for an expense raised before suppliers existed, "Not linked
// (Shell)" showing the old free-text name. The last option adds a new supplier
// without leaving the expense. The linked supplier is fetched by id, so its name
// shows even when it is inactive or outside the current matches.

const NONE = '';
const ADD_NEW = '__add_new__';
/** Matches shown at once; typing narrows the rest. */
const LIMIT = 20;

export function SupplierPicker({
  value,
  onChange,
  fallbackName,
  category,
  error,
}: {
  /** The supplier's id, or '' for none. */
  value: string;
  onChange: (id: string, supplier?: Supplier) => void;
  /** An older expense's free-text vendor name, shown while no supplier is linked. */
  fallbackName?: string;
  /** The expense's category: a supplier added here starts in it. */
  category?: string;
  error?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [typed, setTyped] = useState('');
  const q = useDebouncedValue(typed.trim());

  const matches = useQuery({
    queryKey: ['suppliers', 'picker', q],
    queryFn: () => {
      const params = new URLSearchParams({ is_active: 'true', page_size: String(LIMIT) });
      if (q) params.set('search', q);
      return fetchData<{ count: number; results: Supplier[] }>(`suppliers/?${params.toString()}`);
    },
    placeholderData: keepPreviousData,
  });
  // The linked supplier's name, even when it's inactive or not among the matches.
  const current = useQuery({
    queryKey: ['suppliers', 'one', value],
    queryFn: () => fetchData<Supplier>(`suppliers/${value}/`),
    enabled: !!value,
    staleTime: 60_000,
  });

  const results = matches.data?.results ?? [];
  const more = Math.max(0, (matches.data?.count ?? 0) - results.length);

  const options = useMemo(
    () => [
      { label: fallbackName ? `Not linked (${fallbackName})` : 'No supplier', value: NONE },
      ...results.map((s) => ({ label: s.name, value: String(s.id), sub: s.vat_number ? `VAT ${s.vat_number}` : undefined })),
      { label: 'Add a new supplier…', value: ADD_NEW },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matches.data, fallbackName],
  );
  const selectedLabel = current.data
    ? `${current.data.name}${current.data.is_active ? '' : ' (inactive)'}`
    : value
      ? current.isError
        ? 'Linked supplier'
        : 'Loading…'
      : undefined;

  return (
    <>
      <SelectField
        label="Supplier"
        icon="building"
        value={value}
        options={options}
        error={error}
        onSearch={setTyped}
        searching={matches.isFetching && typed.trim() !== ''}
        selectedLabel={selectedLabel}
        listNote={more > 0 ? `${more} more. Keep typing to narrow the list.` : undefined}
        onSelect={(v) => {
          if (v === ADD_NEW) return setAdding(true);
          onChange(v, v ? results.find((s) => String(s.id) === v) : undefined);
        }}
      />
      {adding && (
        <NewSupplierDialog
          category={category}
          onCancel={() => setAdding(false)}
          onCreated={(s) => {
            setAdding(false);
            onChange(String(s.id), s);
          }}
        />
      )}
    </>
  );
}

function NewSupplierDialog({
  category,
  onCancel,
  onCreated,
}: {
  category?: string;
  onCancel: () => void;
  onCreated: (s: Supplier) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [vat, setVat] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const nameError = submitted && !name.trim() ? 'Name is required' : undefined;
  const vatError = vat.trim() ? (vatNumberProblem(vat) ?? undefined) : undefined;

  const submit = async () => {
    setSubmitted(true);
    if (!name.trim() || vatError) return;
    setBusy(true);
    try {
      const s = await createSupplier({
        name: name.trim(),
        vat_number: vat.replace(/[\s-]/g, ''),
        // Starts in the expense's category, so the next one fills itself in.
        ...(category ? { category } : {}),
      });
      qc.setQueryData(['suppliers', 'one', String(s.id)], s);
      invalidateFor(qc, 'supplier');
      onCreated(s);
    } catch (e) {
      // e.g. a supplier with that name already exists.
      toast.error(e instanceof Error ? e.message : "Couldn't add the supplier");
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center bg-backdrop px-6">
        <TouchableOpacity
          activeOpacity={1}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={StyleSheet.absoluteFill}
        />
        <KeyboardAvoidingView behavior="padding" className="w-full max-w-[420px]">
          <View className="rounded-panel border border-line bg-elevated p-5">
            <Txt className="text-heading font-semibold text-fg">New supplier</Txt>
            <Txt className="mb-4 mt-1.5 text-sub text-muted">
              Add the rest of their details later from Finance, Suppliers.
            </Txt>
            <View className="gap-4">
              <TextField
                label="Name"
                required
                value={name}
                onChangeText={setName}
                placeholder="e.g. Engen Midrand"
                error={nameError}
                autoCapitalize="words"
                autoFocus
                maxLength={200}
              />
              <TextField
                label="VAT number (optional)"
                value={vat}
                onChangeText={setVat}
                placeholder="10 digits, starting with 4"
                keyboardType="number-pad"
                error={vatError}
                maxLength={20}
              />
            </View>
            <View className="mt-4 flex-row gap-2.5">
              <View className="flex-1">
                <Button label="Cancel" variant="secondary" onPress={onCancel} fullWidth />
              </View>
              <View className="flex-1">
                <Button label="Add" loading={busy} onPress={() => void submit()} fullWidth />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
