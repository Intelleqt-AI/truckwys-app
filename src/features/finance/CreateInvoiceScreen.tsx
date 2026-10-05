import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
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
  SegmentedControl,
  Button,
  Label,
  Banner,
  Txt,
  SaveSuccessOverlay,
  type TextFieldProps,
} from '@/components/ui';
import { createInvoice, updateInvoice, useInvoice } from './api';
import { InvoiceLineEditor } from './components/InvoiceLineEditor';
import { TotalsBreakdown } from './components/TotalsBreakdown';
import { useCustomers } from '@/features/customers/api';
import {
  invoiceSchema,
  INVOICE_FIELD_ORDER,
  INVOICE_TOTAL_LIMIT,
  type InvoiceFormValues,
} from './validation';
import { useFinanceSettings, useTaxCodes } from '@/lib/finance/api';
import { blankLine, linesForApi, linesFromInvoice, lineProblems, type EditorLine } from '@/lib/finance/lines';
import { computeTotals, lineIsBlank, toNumber } from '@/lib/finance/tax';
import type { InvoiceLine, TaxCode } from '@/lib/finance/types';
import { str, pick } from '@/lib/api/list';
import { isInvoiceLocked } from '@/lib/invoiceStatus';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import { dismissKeyboard } from '@/lib/keyboard';
import { useSubscription } from '@/hooks/useSubscription';
import { useErrorShake } from '@/hooks/useErrorShake';
import { useFieldAnchors } from '@/hooks/useFieldAnchors';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import type { AppStackParamList } from '@/navigation/types';
import { localDateISO } from '@/lib/dates';

type Props = NativeStackScreenProps<AppStackParamList, 'CreateInvoice'>;

// The server's choices for Invoice.payment_terms.
const PAYMENT_TERMS = ['NET7', 'NET14', 'NET30', 'NET45', 'NET60', 'NET90'].map((v) => ({
  label: v.replace('NET', 'Net '),
  value: v,
}));
const termDays = (terms: string): number | null => {
  const m = /^NET(\d+)$/.exec(terms);
  return m ? Number(m[1]) : null;
};

const SAVE_AS = [
  { label: 'Draft', value: 'DRAFT' as const },
  { label: 'Mark as sent', value: 'SENT' as const },
];

/** `iso` plus `days`, as a calendar date (no time-zone drift). */
function addDaysISO(iso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const base = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
  return localDateISO(new Date(base.getFullYear(), base.getMonth(), base.getDate() + days));
}

function fromInvoiceRecord(r: Record<string, unknown>): InvoiceFormValues {
  const issue = str(pick(r, ['issue_date'])).slice(0, 10) || localDateISO();
  const terms = str(pick(r, ['payment_terms'])) || 'NET30';
  return {
    customer: str(pick(r, ['customer'])),
    issue_date: issue,
    due_date: str(pick(r, ['due_date'])).slice(0, 10) || addDaysISO(issue, termDays(terms) ?? 30),
    payment_terms: terms,
    // The invoice's notes print on it; there is no separate description column.
    description: str(pick(r, ['notes'])),
    status: 'DRAFT',
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
  onChangeExtra,
  ...rest
}: {
  control: Control<InvoiceFormValues>;
  name: keyof InvoiceFormValues;
  anchors: IAnchors;
  warning?: string;
  /** Side-effect after the date commits (the due date follows the issue date). */
  onChangeExtra?: (value: string) => void;
} & Omit<ComponentProps<typeof DateField>, 'value' | 'onChange' | 'error' | 'warning'>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, value }, fieldState }) => (
        <View onLayout={anchors.registerY(name)}>
          <DateField
            value={value ?? ''}
            onChange={(v) => {
              onChange(v);
              onChangeExtra?.(v);
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

export function CreateInvoiceScreen({ route, navigation }: Props) {
  const editId = route.params?.id;
  const preview = (route.params?.preview ?? {}) as Record<string, unknown>;
  const editing = editId != null;
  const qc = useQueryClient();
  const subscription = useSubscription();
  const { data: customers } = useCustomers();
  const { data: taxData } = useTaxCodes();
  const { data: settings } = useFinanceSettings();
  // Re-fetches on edit instead of trusting `preview` forever, same fix as
  // fleet's useVehicle/useDriver.
  const { data: full } = useInvoice(editId ?? '', editing ? preview : undefined, editing);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const taxCodes = taxData?.codes;
  const defaultTax: TaxCode = taxData?.default_tax_code ?? 'STANDARD';

  const customerOptions = useMemo(
    () => (customers ?? []).map((c) => ({ label: c.name, value: String(c.id) })),
    [customers],
  );

  const resolver = useMemo(() => zodResolver(invoiceSchema()), []);

  const { control, handleSubmit, reset, watch, setValue, formState } = useForm<InvoiceFormValues>({
    resolver,
    defaultValues: fromInvoiceRecord(preview),
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });

  const anchors = useFieldAnchors<keyof InvoiceFormValues>();
  const { shakeStyle, trigger: triggerShake } = useErrorShake();

  // The lines live outside react-hook-form: they are a list the editor owns.
  const [lines, setLines] = useState<EditorLine[]>(() =>
    editing
      ? linesFromInvoice(
          pick(preview, ['lines']) as InvoiceLine[] | undefined,
          pick(preview, ['subtotal']) as string | undefined,
          'STANDARD',
        )
      : [blankLine('STANDARD')],
  );
  const [linesTouched, setLinesTouched] = useState(false);
  const [lineErrors, setLineErrors] = useState<string[]>([]);
  const changeLines = (next: EditorLine[]) => {
    setLinesTouched(true);
    setLineErrors([]);
    setLines(next);
  };

  // The due date follows the issue date and terms until the person sets it
  // themselves; an existing invoice's due date is theirs from the start.
  const dueManual = useRef(editing);
  const termsManual = useRef(editing);

  // Re-hydrates from `full` every time it changes — but only until the user
  // actually edits something (`reset()` clears isDirty, so this re-arms after
  // each hydration and stops for good once real typing happens).
  useEffect(() => {
    if (!editing || !full || formState.isDirty || linesTouched) return;
    reset(fromInvoiceRecord(full));
    setLines(
      linesFromInvoice(
        pick(full, ['lines']) as InvoiceLine[] | undefined,
        pick(full, ['subtotal']) as string | undefined,
        defaultTax,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, full, defaultTax]);

  // A new invoice's first line takes the company's default tax code once known
  // (a company that isn't VAT-registered gets NO_VAT, not 15%).
  useEffect(() => {
    if (editing || linesTouched || !taxData) return;
    setLines((cur) => cur.map((l) => ({ ...l, tax_code: taxData.default_tax_code })));
  }, [editing, linesTouched, taxData]);

  const dirty = formState.isDirty || linesTouched;
  useUnsavedChangesGuard({
    navigation,
    isDirty: () => dirty && !busy && !saved,
    title: 'Discard changes?',
    message: editing
      ? "Your edits to this invoice haven't been saved."
      : "This invoice hasn't been saved.",
    buttons: [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', dispatch: true },
    ],
  });

  // Preview of what the server will save, computed with its own rounding.
  const totals = useMemo(
    () => computeTotals(lines.filter((l) => !lineIsBlank(l)), taxCodes),
    [lines, taxCodes],
  );

  const issueDate = watch('issue_date');
  const dueDate = watch('due_date');
  const duePassed = !!dueDate && dueDate < localDateISO();

  const reseedDue = (issue: string, terms: string) => {
    const days = termDays(terms);
    if (days != null) setValue('due_date', addDaysISO(issue, days), { shouldValidate: true, shouldDirty: true });
  };

  const onPickCustomer = (id: string) => {
    // The customer's usual terms, until terms have been chosen by hand.
    if (termsManual.current) return;
    const raw = customers?.find((c) => String(c.id) === id)?.raw;
    const terms = str(pick(raw ?? {}, ['payment_terms_default']));
    if (!terms || termDays(terms) == null) return;
    setValue('payment_terms', terms, { shouldDirty: true });
    if (!dueManual.current) reseedDue(watch('issue_date'), terms);
  };

  // An invoice that has been sent can't be changed any more.
  const locked = editing && !!full && isInvoiceLocked(full);

  const onValid = async (v: InvoiceFormValues) => {
    if (subscription.blocked) return toast.error(subscription.notice ?? 'Subscription inactive');

    const apiLines = linesForApi(lines);
    const problems = lineProblems(lines);
    if (apiLines.length === 0) problems.push('Add at least one line with a description and a price.');
    if (toNumber(totals.total) > INVOICE_TOTAL_LIMIT) problems.push("The invoice total is too large.");
    if (problems.length) {
      setLineErrors(problems);
      triggerShake();
      return;
    }

    // Starts closing the keyboard the instant Save is tapped, rather than
    // leaving it up behind SaveSuccessOverlay.
    void dismissKeyboard();
    setBusy(true);
    // No totals are sent: the server works them out from the lines, and ignores
    // any it is given. The number is assigned when the invoice is sent.
    const payload = {
      customer: Number(v.customer),
      issue_date: v.issue_date,
      due_date: v.due_date,
      payment_terms: v.payment_terms,
      notes: (v.description ?? '').trim(),
      lines: apiLines,
      ...(editing ? {} : { status: v.status }),
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
      // e.g. the invoice was sent from the web while this screen was open.
      toast.error(e instanceof Error ? e.message : 'Could not save invoice');
      if (editing) invalidateFor(qc, 'invoice');
    } finally {
      setBusy(false);
    }
  };

  const onInvalid = (errors: FieldErrors<InvoiceFormValues>) => {
    triggerShake();
    const first = INVOICE_FIELD_ORDER.find((n) => errors[n]);
    if (first) anchors.scrollToField(first);
  };

  if (locked) {
    return (
      <SheetScreen title="Edit invoice" variant="modal" onBack={() => navigation.goBack()}>
        <Banner
          tone="warning"
          message={
            str(pick(full ?? {}, ['lock_reason'])) ||
            "This invoice has been sent, so its lines and amounts can't be changed. Issue a credit note to correct it."
          }
        />
        <View className="mt-4">
          <Button label="Back to invoice" variant="secondary" onPress={() => navigation.goBack()} fullWidth />
        </View>
      </SheetScreen>
    );
  }

  const numberHint = settings?.next_invoice_number_preview
    ? `The number is assigned when the invoice is sent. Next is ${settings.next_invoice_number_preview}.`
    : 'The number is assigned when the invoice is sent.';

  return (
    <View className="flex-1">
      <SheetScreen
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
          <Txt className="text-caption text-muted">{numberHint}</Txt>

          <ISelect
            control={control}
            name="customer"
            anchors={anchors}
            label="Customer"
            icon="building"
            required
            placeholder="Select customer"
            options={customerOptions}
            onSelectExtra={onPickCustomer}
          />
          <IDate
            control={control}
            name="issue_date"
            anchors={anchors}
            label="Issue date"
            required
            onChangeExtra={(v) => {
              if (!dueManual.current) reseedDue(v, watch('payment_terms'));
            }}
          />
          <ISelect
            control={control}
            name="payment_terms"
            anchors={anchors}
            label="Payment terms"
            options={PAYMENT_TERMS}
            onSelectExtra={(v) => {
              // Picking terms is an explicit request to recalculate the due date.
              termsManual.current = true;
              dueManual.current = false;
              reseedDue(issueDate, v);
            }}
          />
          <IDate
            control={control}
            name="due_date"
            anchors={anchors}
            label="Due date"
            required
            warning={
              duePassed ? 'This date has passed, so the invoice will go out already overdue.' : undefined
            }
            onChangeExtra={() => {
              dueManual.current = true;
            }}
          />

          {!editing && (
            <View>
              <Label className="mb-1.5">Save as</Label>
              <Controller
                control={control}
                name="status"
                render={({ field: { onChange, value } }) => (
                  <SegmentedControl options={SAVE_AS} value={value} onChange={onChange} />
                )}
              />
            </View>
          )}

          <Label className="mt-1">Lines</Label>
          <InvoiceLineEditor
            lines={lines}
            onChange={changeLines}
            taxCodes={taxCodes ?? []}
            defaultTaxCode={defaultTax}
          />

          {lineErrors.length > 0 && <Banner tone="danger" message={lineErrors.join('\n')} />}

          <TotalsBreakdown
            label="Summary"
            subtotal={totals.subtotal}
            discount={totals.discount}
            vat={totals.vat}
            total={totals.total}
            byCode={totals.byCode}
          />

          <Label className="text-muted">Optional</Label>
          <IText
            control={control}
            name="description"
            anchors={anchors}
            label="Note on the invoice"
            placeholder="Shown on the invoice, e.g. PO number or delivery reference"
            multiline
          />
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
