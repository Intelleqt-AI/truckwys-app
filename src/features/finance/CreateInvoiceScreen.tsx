import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import { View } from 'react-native';
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
  DetailRow,
  Group,
  SaveSuccessOverlay,
  type TextFieldProps,
} from '@/components/ui';
import { createInvoice, updateInvoice, useInvoice } from './api';
import { useCustomers } from '@/features/customers/api';
import { invoiceSchema, INVOICE_FIELD_ORDER, type InvoiceFormValues } from './validation';
import { num, str, pick } from '@/lib/api/list';
import { formatCurrency, parseNum, formatPlain } from '@/lib/formatters';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import { dismissKeyboard } from '@/lib/keyboard';
import { useSubscription } from '@/hooks/useSubscription';
import { useErrorShake } from '@/hooks/useErrorShake';
import { useFieldAnchors } from '@/hooks/useFieldAnchors';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'CreateInvoice'>;

function plusDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const PAYMENT_TERMS = ['NET30', 'NET60', 'NET90'].map((v) => ({
  label: v.replace('NET', 'Net '),
  value: v,
}));
const TERM_DAYS: Record<string, number> = { NET30: 30, NET60: 60, NET90: 90 };

function fromInvoiceRecord(r: Record<string, unknown>): InvoiceFormValues {
  return {
    customer: str(pick(r, ['customer'])),
    subtotal: pick(r, ['subtotal']) != null ? formatPlain(num(pick(r, ['subtotal'])), 2) : '',
    // The Invoice model has no `description` column — preserve the mapping
    // onto `notes`, the free-text field it does have.
    description: str(pick(r, ['notes'])),
    due_date: str(pick(r, ['due_date'])) || plusDays(30),
    payment_terms: str(pick(r, ['payment_terms'])) || 'NET30',
  };
}

type IAnchors = ReturnType<typeof useFieldAnchors<keyof InvoiceFormValues>>;

// Local Controller wrappers — same convention as AddVehicleScreen's
// VText/VSelect/VDate — kept per-screen rather than shared/generic.
function IText({
  control,
  name,
  anchors,
  warning,
  ...rest
}: {
  control: Control<InvoiceFormValues>;
  name: keyof InvoiceFormValues;
  anchors: IAnchors;
  warning?: string;
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
            onChangeText={onChange}
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

function ISelect({
  control,
  name,
  anchors,
  warning,
  onSelectExtra,
  ...rest
}: {
  control: Control<InvoiceFormValues>;
  name: keyof InvoiceFormValues;
  anchors: IAnchors;
  warning?: string;
  /** Extra side-effect after the value commits — picking Payment terms
   * reseeds Due date, same as fleet's chooseType seeding capacity. */
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

function IDate({
  control,
  name,
  anchors,
  warning,
  ...rest
}: {
  control: Control<InvoiceFormValues>;
  name: keyof InvoiceFormValues;
  anchors: IAnchors;
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

export function CreateInvoiceScreen({ route, navigation }: Props) {
  const editId = route.params?.id;
  const preview = (route.params?.preview ?? {}) as Record<string, unknown>;
  const editing = editId != null;
  const qc = useQueryClient();
  const subscription = useSubscription();
  const { data: customers } = useCustomers();
  // Re-fetches on edit instead of trusting `preview` forever, same fix as
  // fleet's useVehicle/useDriver.
  const { data: full } = useInvoice(editId ?? '', editing ? preview : undefined, editing);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const customerOptions = useMemo(
    () => (customers ?? []).map((c) => ({ label: c.name, value: String(c.id) })),
    [customers],
  );

  // Grandfathers a DRAFT invoice that was created (and never sent) with a due
  // date that's since slipped into the past — see validation.ts.
  const [originalDueDate, setOriginalDueDate] = useState(() => str(pick(preview, ['due_date'])));
  const resolver = useMemo(() => zodResolver(invoiceSchema({ originalDueDate })), [originalDueDate]);

  const { control, handleSubmit, reset, watch, setValue, formState } = useForm<InvoiceFormValues>({
    resolver,
    defaultValues: fromInvoiceRecord(preview),
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });

  const anchors = useFieldAnchors<keyof InvoiceFormValues>();
  const { shakeStyle, trigger: triggerShake } = useErrorShake();

  // Re-hydrates from `full` every time it changes — but only until the user
  // actually edits something (`reset()` clears isDirty, so this re-arms after
  // each hydration and stops for good once real typing happens).
  useEffect(() => {
    if (!editing || !full || formState.isDirty) return;
    reset(fromInvoiceRecord(full));
    const due = str(pick(full, ['due_date']));
    if (due) setOriginalDueDate(due);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, full]);

  useUnsavedChangesGuard({
    navigation,
    isDirty: () => formState.isDirty && !busy && !saved,
    title: 'Discard changes?',
    message: editing
      ? "Your edits to this invoice haven't been saved."
      : "This invoice hasn't been saved.",
    buttons: [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', dispatch: true },
    ],
  });

  // Read-only preview only — parseNum, not Number: `|| 0` on a NaN turned a
  // comma amount into a zero-value invoice whose VAT and total both rendered
  // R 0,00.
  const subtotalW = watch('subtotal');
  const sub = parseNum(subtotalW) ?? 0;
  // Matches the backend's own Invoice.calculate_vat(), which also hardcodes
  // 15% for South Africa — not a bug, just mirrored here for the preview.
  const vat = Math.round(sub * 0.15 * 100) / 100;
  const total = sub + vat;

  const onValid = async (v: InvoiceFormValues) => {
    if (subscription.blocked) return toast.error(subscription.notice ?? 'Subscription inactive');
    // Starts closing the keyboard the instant Save is tapped, rather than
    // leaving it up behind SaveSuccessOverlay.
    void dismissKeyboard();
    setBusy(true);
    const subN = parseNum(v.subtotal) ?? 0;
    const vatN = Math.round(subN * 0.15 * 100) / 100;
    const payload = {
      customer: Number(v.customer),
      subtotal: subN,
      total_amount: subN + vatN,
      notes: (v.description ?? '').trim(),
      due_date: v.due_date,
      payment_terms: v.payment_terms,
      // invoice_number, balance and status are all filled/recomputed
      // server-side (InvoiceSerializer.create / Invoice.save()).
    };
    try {
      if (editing) await updateInvoice(editId, payload);
      else await createInvoice(payload);
      invalidateFor(qc, 'invoice');
      toast.success(editing ? 'Invoice updated' : 'Invoice created');
      // Guarantee it's gone before the overlay shows — covers a fast/cached
      // response where the tap-time dismiss above hasn't finished yet.
      await dismissKeyboard();
      setSaved(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save invoice');
    } finally {
      setBusy(false);
    }
  };

  const onInvalid = (errors: FieldErrors<InvoiceFormValues>) => {
    triggerShake();
    const first = INVOICE_FIELD_ORDER.find((n) => errors[n]);
    if (first) anchors.scrollToField(first);
  };

  return (
    <View className="flex-1">
      <SheetScreen
        eyebrow={editing ? 'Edit' : 'New invoice'}
        title={editing ? 'Edit invoice' : 'Create invoice'}
        variant="modal"
        onBack={() => navigation.goBack()}
        scrollRef={anchors.scrollRef}
        footer={
          <Button
            label={editing ? 'Save changes' : 'Create invoice'}
            loading={busy}
            onPress={handleSubmit(onValid, onInvalid)}
            fullWidth
          />
        }
      >
        <Animated.View className="gap-4" style={shakeStyle}>
          <ISelect
            control={control}
            name="customer"
            anchors={anchors}
            label="Customer"
            icon="building"
            required
            placeholder="Select customer"
            options={customerOptions}
          />
          <IText
            control={control}
            name="subtotal"
            anchors={anchors}
            label="Amount (excl. VAT)"
            required
            placeholder="0,00"
            prefix="R"
            keyboardType="decimal-pad"
            numeric
            decimals={2}
          />
          <IDate
            control={control}
            name="due_date"
            anchors={anchors}
            label="Due date"
            required
            minimumDate={new Date()}
          />
          <ISelect
            control={control}
            name="payment_terms"
            anchors={anchors}
            label="Payment terms"
            options={PAYMENT_TERMS}
            onSelectExtra={(v) => {
              const days = TERM_DAYS[v];
              if (days != null) {
                setValue('due_date', plusDays(days), { shouldValidate: true, shouldDirty: true });
              }
            }}
          />

          <Label className="mt-1 text-muted">Optional</Label>
          <IText
            control={control}
            name="description"
            anchors={anchors}
            label="Description"
            placeholder="What is this invoice for?"
          />

          <Group label="Summary">
            <DetailRow label="Subtotal" value={formatCurrency(sub)} />
            <DetailRow label="VAT (15%)" value={formatCurrency(vat)} />
            <DetailRow label="Total" value={formatCurrency(total)} last />
          </Group>
        </Animated.View>
      </SheetScreen>

      <SaveSuccessOverlay
        visible={saved}
        title={editing ? 'Invoice updated' : 'Invoice created'}
        onDone={() => navigation.goBack()}
      />
    </View>
  );
}
