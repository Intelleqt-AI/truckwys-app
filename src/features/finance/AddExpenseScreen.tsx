import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { View, TouchableOpacity } from 'react-native';
import Animated from 'react-native-reanimated';
import { useForm, Controller, type Control, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  SheetScreen,
  SelectField,
  TextField,
  DateField,
  Button,
  Label,
  Txt,
  SaveSuccessOverlay,
  type TextFieldProps,
} from '@/components/ui';
import { createExpense, updateExpense, useExpense, EXPENSE_CATEGORIES } from './api';
import { SupplierPicker } from './components/SupplierPicker';
import { useTaxCodes } from '@/lib/finance/api';
import { normaliseDecimalInput, subtractDecimals, toNumber, vatFromGross } from '@/lib/finance/tax';
import type { TaxCode } from '@/lib/finance/types';
import { useVehicles } from '@/features/fleet/api';
import {
  expenseSchema,
  expenseWarnings,
  EXPENSE_FIELD_ORDER,
  type ExpenseFormValues,
} from './validation';
import { num, str, pick } from '@/lib/api/list';
import { parseNum, formatPlain, formatCurrency, round2 } from '@/lib/formatters';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import { dismissKeyboard } from '@/lib/keyboard';
import { useErrorShake } from '@/hooks/useErrorShake';
import { useFieldAnchors } from '@/hooks/useFieldAnchors';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import type { AppStackParamList } from '@/navigation/types';
import { localDateISO } from '@/lib/dates';

type Props = NativeStackScreenProps<AppStackParamList, 'AddExpense'>;

const today = () => localDateISO();

// Web embeds fuel litres/price into `notes` as "Fuel: {L}L @ R{price}/L".
//
// The character class has to allow a comma and a grouping space, not just
// [\d.]: a South African keyboard types `23,40`, and once the field grouped its
// value on blur it can also be `1 350`. With the old dot-only pattern neither
// re-populated on edit — the fields just came back empty. We still WRITE a
// canonical dot-decimal, so the round-trip matches what web produces.
const FUEL_NOTE = /Fuel:\s*([\d.,  ]+?)L\s*@\s*R?\s*([\d.,  ]+?)\/L\s*\n?/i;

/** Field text for a parsed number: comma decimal, no grouping. */
const asFieldValue = (v: string | null | undefined): string => {
  const n = parseNum(v);
  return n == null ? '' : formatPlain(n);
};

/**
 * Whether the saved VAT is a figure the person typed rather than amount x 15/115.
 * A saved figure that differs from the calculation was typed, so it stays typed.
 */
function savedVatWasTyped(r: Record<string, unknown>): boolean {
  const code = str(pick(r, ['tax_code']), 'STANDARD');
  const vat = pick(r, ['vat_amount']);
  if (code !== 'STANDARD' || vat == null || vat === '') return false;
  const calculated = toNumber(vatFromGross(String(pick(r, ['amount']) ?? 0), code));
  return Math.abs(toNumber(String(vat)) - calculated) > 0.004;
}

function fromExpenseRecord(r: Record<string, unknown>): ExpenseFormValues {
  const rawNotes = str(pick(r, ['notes']));
  const fuelMatch = rawNotes.match(FUEL_NOTE);
  return {
    category: str(pick(r, ['category']), 'FUEL').toUpperCase(),
    description: str(pick(r, ['description'])),
    amount: pick(r, ['amount']) != null ? formatPlain(num(pick(r, ['amount'])), 2) : '',
    // '' until the tenant default is known (see the screen); a saved code is kept.
    tax_code: str(pick(r, ['tax_code'])),
    // Filled in from the amount unless the saved figure was typed by hand.
    vat_amount: savedVatWasTyped(r) ? formatPlain(num(pick(r, ['vat_amount'])), 2) : '',
    date: str(pick(r, ['expense_date', 'date'])) || today(),
    litres: asFieldValue(fuelMatch?.[1]),
    pricePerLitre: asFieldValue(fuelMatch?.[2]),
    vehicle: str(pick(r, ['vehicle'])),
    supplier: str(pick(r, ['supplier'])),
    vendor: str(pick(r, ['vendor'])),
    receipt: str(pick(r, ['receipt_number'])),
    notes: rawNotes.replace(FUEL_NOTE, '').trim(),
  };
}

const resolver = zodResolver(expenseSchema());

type EAnchors = ReturnType<typeof useFieldAnchors<keyof ExpenseFormValues>>;

// Local Controller wrappers — same convention as AddVehicleScreen's
// VText/VSelect/VDate — kept per-screen rather than shared/generic.
function EText({
  control,
  name,
  anchors,
  warning,
  onChangeExtra,
  ...rest
}: {
  control: Control<ExpenseFormValues>;
  name: keyof ExpenseFormValues;
  anchors: EAnchors;
  warning?: string;
  /** Side-effect after the value commits (typing in "VAT included" stops it being calculated). */
  onChangeExtra?: (text: string) => void;
} & Omit<TextFieldProps, 'value' | 'onChangeText' | 'onBlur' | 'error' | 'warning'>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, onBlur, value }, fieldState }) => (
        <View onLayout={anchors.registerY(name)}>
          <TextField
            ref={anchors.registerInput(name)}
            value={value ?? ''}
            onChangeText={(t) => {
              onChange(t);
              onChangeExtra?.(t);
            }}
            onBlur={onBlur}
            error={fieldState.error?.message}
            warning={warning}
            {...rest}
          />
        </View>
      )}
    />
  );
}

function ESelect({
  control,
  name,
  anchors,
  warning,
  onSelectExtra,
  ...rest
}: {
  control: Control<ExpenseFormValues>;
  name: keyof ExpenseFormValues;
  anchors: EAnchors;
  warning?: string;
  /** Extra side-effect after the value commits — clears litres/price when
   * leaving FUEL so a stale hidden-field error can't block submit. */
  onSelectExtra?: (value: string) => void;
} & Omit<ComponentProps<typeof SelectField>, 'value' | 'onSelect' | 'error' | 'warning'>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, value }, fieldState }) => (
        <View onLayout={anchors.registerY(name)}>
          <SelectField
            value={value ?? ''}
            onSelect={(v) => {
              onChange(v);
              onSelectExtra?.(v);
            }}
            error={fieldState.error?.message}
            warning={warning}
            {...rest}
          />
        </View>
      )}
    />
  );
}

function EDate({
  control,
  name,
  anchors,
  warning,
  ...rest
}: {
  control: Control<ExpenseFormValues>;
  name: keyof ExpenseFormValues;
  anchors: EAnchors;
  warning?: string;
} & Omit<ComponentProps<typeof DateField>, 'value' | 'onChange' | 'error' | 'warning'>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, value }, fieldState }) => (
        <View onLayout={anchors.registerY(name)}>
          <DateField
            value={value ?? ''}
            onChange={onChange}
            error={fieldState.error?.message}
            warning={warning}
            {...rest}
          />
        </View>
      )}
    />
  );
}

export function AddExpenseScreen({ route, navigation }: Props) {
  const editId = route.params?.id;
  const preview = (route.params?.preview ?? {}) as Record<string, unknown>;
  const editing = editId != null;
  const qc = useQueryClient();
  const { data: vehicles } = useVehicles();
  // Re-fetches on edit instead of trusting `preview` forever — the previous
  // version never refreshed, so any field this screen didn't already display
  // (or that changed since the list was last fetched) saved back over itself
  // unseen.
  const { data: full } = useExpense(editId ?? '', editing ? preview : undefined, editing);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const { data: taxData } = useTaxCodes();
  const taxCodes = taxData?.codes;
  const taxOptions = useMemo(
    () => (taxCodes ?? []).map((c) => ({ label: c.label, value: c.code })),
    [taxCodes],
  );
  // VAT follows the amount (gross x 15 / 115 at the standard rate) until the
  // person types their own figure.
  const [vatTyped, setVatTyped] = useState(() => editing && savedVatWasTyped(preview));
  // A new expense starts in the chosen supplier's usual category, until the
  // category has been picked by hand.
  const categoryTouched = useRef(editing);

  const vehicleOptions = useMemo(
    () => [
      { label: 'None', value: '' },
      ...(vehicles ?? []).map((v) => ({
        label: `${v.name}${v.plate ? ` · ${v.plate}` : ''}`,
        value: String(v.id),
      })),
    ],
    [vehicles],
  );

  const { control, handleSubmit, reset, watch, setValue, formState } = useForm<ExpenseFormValues>({
    resolver,
    defaultValues: fromExpenseRecord(preview),
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });

  const anchors = useFieldAnchors<keyof ExpenseFormValues>();
  const { shakeStyle, trigger: triggerShake } = useErrorShake();

  // Re-hydrates from `full` every time it changes (both the synchronous
  // initialData pass and the real network response) — but only until the
  // user actually edits something. `reset()` clears isDirty, so the guard
  // re-arms after each hydration and only ever blocks once real typing has
  // happened. Same pattern as AddVehicleScreen/AddDriverScreen.
  useEffect(() => {
    if (!editing || !full || formState.isDirty) return;
    reset(fromExpenseRecord(full));
    setVatTyped(savedVatWasTyped(full));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, full]);

  // The tax code the expense carries: the saved one, else the company's default
  // (NO_VAT when it isn't VAT-registered).
  const taxCodeW = watch('tax_code');
  const taxCode = (taxCodeW || taxData?.default_tax_code || 'STANDARD') as TaxCode;
  const amountW = watch('amount');
  const vatW = watch('vat_amount');
  const calculatedVat = useMemo(
    () => vatFromGross(normaliseDecimalInput(amountW ?? '') || '0', taxCode, taxCodes),
    [amountW, taxCode, taxCodes],
  );
  // Show the calculation while nothing has been typed (comma decimal, as the
  // other amount fields do).
  useEffect(() => {
    if (vatTyped) return;
    const shown = calculatedVat.replace('.', ',');
    // Compared against what is showing, so a reset() that blanked the field
    // (re-hydrating an edit) is put right even when the calculation hasn't moved.
    if (vatW !== shown) setValue('vat_amount', shown, { shouldValidate: false });
  }, [vatTyped, calculatedVat, vatW, setValue]);
  const vatNormalised = normaliseDecimalInput(vatW ?? '') || '0';
  const netAmount = subtractDecimals(normaliseDecimalInput(amountW ?? '') || '0', vatNormalised);

  // Auto-calc amount for fuel when litres × price are both present (Amount
  // becomes read-only then). Re-homed into RHF's setValue with
  // shouldValidate: true, so the resolver re-runs on `amount` every time
  // litres/price change — unlike the old plain-useState version, the amount
  // error can no longer go stale when the user fixes it via litres/price
  // instead of typing directly into Amount (Amount's own onChange never
  // fires in that state, so a manually-managed error string never cleared).
  const category = watch('category');
  const litresW = watch('litres');
  const priceW = watch('pricePerLitre');
  const isFuel = category === 'FUEL';
  const litresN = parseNum(litresW) ?? 0;
  const priceN = parseNum(priceW) ?? 0;
  const autoAmount = isFuel && litresN > 0 && priceN > 0;

  useEffect(() => {
    if (!autoAmount) return;
    setValue('amount', formatPlain(litresN * priceN, 2), { shouldValidate: true, shouldDirty: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAmount, litresN, priceN]);

  // Advisory-only — computed from watched values, never blocks a save.
  const dateW = watch('date');
  const warnings = useMemo(() => expenseWarnings({ date: dateW }), [dateW]);

  useUnsavedChangesGuard({
    navigation,
    isDirty: () => formState.isDirty && !busy && !saved,
    title: 'Discard changes?',
    message: editing
      ? "Your edits to this expense haven't been saved."
      : "This expense hasn't been saved.",
    buttons: [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', dispatch: true },
    ],
  });

  const onValid = async (v: ExpenseFormValues) => {
    // Starts closing the keyboard the instant Save is tapped, rather than
    // leaving it up behind SaveSuccessOverlay.
    void dismissKeyboard();
    setBusy(true);
    let outNotes = (v.notes ?? '').trim();
    if (isFuel && litresN > 0 && priceN > 0) {
      // Written with plain dot decimals and no grouping — this string is data
      // the FUEL_NOTE regex has to read back, and web writes the same shape.
      outNotes = `Fuel: ${litresN}L @ R${priceN.toFixed(2)}/L${outNotes ? `\n${outNotes}` : ''}`;
    }
    const payload = {
      category: v.category,
      description: v.description.trim(),
      // Expense.amount is DecimalField(max_digits=10, decimal_places=2) — the
      // Amount field's decimals={2} only reformats on blur, so a value still
      // focused when Save is tapped can still carry more than 2 decimals.
      amount: round2(parseNum(v.amount) ?? 0),
      expense_date: v.date,
      // vehicle is a nullable FK, so null is right for "no vehicle". supplier
      // likewise (company-scoped; a stranger's id is refused).
      vehicle: v.vehicle || null,
      supplier: v.supplier ? Number(v.supplier) : null,
      tax_code: taxCode,
      // Left out, the server works VAT out from the amount; a typed figure is
      // sent. Only standard-rated expenses carry input VAT (the server refuses
      // VAT on any other code).
      ...(vatTyped && taxCode === 'STANDARD' ? { vat_amount: vatNormalised } : {}),
      // vendor/receipt_number are blank=True but NOT null=True, so DRF sets
      // allow_null=False on them — sending null 400s ("may not be null"),
      // which meant an expense only saved if BOTH were filled in. '' is the
      // empty value those columns actually accept, and it also makes
      // clearing a vendor possible on the edit (PATCH) path.
      vendor: (v.vendor ?? '').trim(),
      receipt_number: (v.receipt ?? '').trim(),
      notes: outNotes,
    };
    try {
      if (editing) await updateExpense(editId, payload);
      else await createExpense(payload);
      invalidateFor(qc, 'expense');
      toast.success(editing ? 'Expense updated' : 'Expense added');
      // Guarantee it's gone before the overlay shows — covers a fast/cached
      // response where the tap-time dismiss above hasn't finished yet.
      await dismissKeyboard();
      setSaved(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save expense');
    } finally {
      setBusy(false);
    }
  };

  const onInvalid = (errors: FieldErrors<ExpenseFormValues>) => {
    triggerShake();
    const first = EXPENSE_FIELD_ORDER.find((n) => errors[n]);
    if (first) anchors.scrollToField(first);
  };

  return (
    <View className="flex-1">
      <SheetScreen
        title={editing ? 'Edit expense' : 'Add expense'}
        variant="modal"
        onBack={() => navigation.goBack()}
        scrollRef={anchors.scrollRef}
        footer={
          <Button
            label={editing ? 'Save changes' : 'Add expense'}
            loading={busy}
            onPress={handleSubmit(onValid, onInvalid)}
            fullWidth
          />
        }
      >
        <Animated.View className="gap-4" style={shakeStyle}>
          <ESelect
            control={control}
            name="category"
            anchors={anchors}
            label="Category"
            icon="banknote"
            required
            options={EXPENSE_CATEGORIES}
            onSelectExtra={(v) => {
              categoryTouched.current = true;
              if (v !== 'FUEL') {
                setValue('litres', '', { shouldValidate: true });
                setValue('pricePerLitre', '', { shouldValidate: true });
              }
            }}
          />
          <EText
            control={control}
            name="description"
            anchors={anchors}
            label="Description"
            required
            placeholder="What was this for?"
          />

          {isFuel && (
            <View className="flex-row gap-3">
              <View className="flex-1">
                <EText
                  control={control}
                  name="litres"
                  anchors={anchors}
                  label="Litres"
                  placeholder="e.g. 350"
                  keyboardType="decimal-pad"
                  numeric
                />
              </View>
              <View className="flex-1">
                <EText
                  control={control}
                  name="pricePerLitre"
                  anchors={anchors}
                  label="Price / litre"
                  placeholder="e.g. 23,40"
                  prefix="R"
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
          )}

          <EText
            control={control}
            name="amount"
            anchors={anchors}
            label="Amount incl. VAT (ZAR)"
            required
            placeholder="0,00"
            prefix="R"
            // decimal-pad, not numeric: on Android `numeric` offers a minus
            // sign, which is meaningless for an expense amount.
            keyboardType="decimal-pad"
            numeric
            decimals={2}
            editable={!autoAmount}
          />
          <Controller
            control={control}
            name="tax_code"
            render={({ field: { onChange } }) => (
              <View onLayout={anchors.registerY('tax_code')}>
                <SelectField
                  label="Tax code"
                  value={taxCode}
                  options={taxOptions}
                  onSelect={(v) => {
                    onChange(v);
                    // Only the standard rate carries input VAT.
                    if (v !== 'STANDARD') setVatTyped(false);
                  }}
                />
              </View>
            )}
          />
          <View>
            <EText
              control={control}
              name="vat_amount"
              anchors={anchors}
              label={vatTyped ? 'VAT included (ZAR)' : 'VAT included (ZAR) · calculated'}
              placeholder="0,00"
              prefix="R"
              keyboardType="decimal-pad"
              editable={taxCode === 'STANDARD'}
              onChangeExtra={() => setVatTyped(true)}
            />
            <View className="mt-1.5 flex-row flex-wrap items-center gap-x-1.5">
              <Txt className="text-caption text-muted">
                {`Excl. VAT ${formatCurrency(toNumber(netAmount))}.`}
                {!vatTyped &&
                  (taxCode === 'STANDARD' ? ' Amount × 15 ÷ 115; type to change it.' : ' No VAT on this code.')}
              </Txt>
              {vatTyped && (
                <TouchableOpacity
                  onPress={() => setVatTyped(false)}
                  hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                >
                  <Txt className="text-caption text-link">Use the calculated VAT</Txt>
                </TouchableOpacity>
              )}
            </View>
          </View>
          <EDate
            control={control}
            name="date"
            anchors={anchors}
            label="Date"
            required
            warning={warnings.date}
          />

          <Label className="mt-1 text-muted">Optional</Label>
          <ESelect
            control={control}
            name="vehicle"
            anchors={anchors}
            label="Vehicle"
            icon="truck"
            options={vehicleOptions}
            placeholder="None"
          />
          <Controller
            control={control}
            name="supplier"
            render={({ field: { onChange, value } }) => (
              <View onLayout={anchors.registerY('supplier')}>
                <SupplierPicker
                  value={value ?? ''}
                  fallbackName={str(watch('vendor'))}
                  category={category}
                  onChange={(id, supplier) => {
                    onChange(id);
                    // A new expense starts in the supplier's usual category.
                    if (supplier?.category && !categoryTouched.current) {
                      setValue('category', supplier.category, { shouldDirty: true, shouldValidate: true });
                    }
                  }}
                />
              </View>
            )}
          />
          <EText control={control} name="receipt" anchors={anchors} label="Receipt #" placeholder="Optional" />
          <EText
            control={control}
            name="notes"
            anchors={anchors}
            label="Notes"
            placeholder="Optional note"
            multiline
          />
        </Animated.View>
      </SheetScreen>

      <SaveSuccessOverlay
        visible={saved}
        title={editing ? 'Expense updated' : 'Expense added'}
        onDone={() => navigation.goBack()}
      />
    </View>
  );
}
