import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { TextField, Button, Banner, Group, DetailRow, Txt } from '@/components/ui';
import { ListSkeleton, ErrorState } from '@/components/feedback';
import { updateFinanceSettings, useFinanceSettings } from '@/lib/finance/api';
import type { FinanceSettings, FinanceSettingsInput } from '@/lib/finance/types';
import { toast } from '@/lib/toast';

// How invoices and credit notes are numbered: a prefix, the next number to
// issue, and how many digits to pad it to (INV-00012). The number is allocated
// when the invoice is sent, never for a draft, so there are no gaps. Anyone in
// finance can read this; only an admin can change it.

const PREFIX = /^[A-Za-z0-9/_-]{1,12}$/;

/** What the next number will look like, as the server builds it (prefix + padded number). */
const preview = (prefix: string, next: string, padding: string) => {
  const n = parseInt(next, 10);
  const pad = Math.min(10, Math.max(1, parseInt(padding, 10) || 1));
  return Number.isFinite(n) && n >= 1 ? `${prefix}${String(n).padStart(pad, '0')}` : '—';
};

const intOf = (v: string) => (/^\d+$/.test(v.trim()) ? parseInt(v.trim(), 10) : NaN);

export function InvoiceNumberingSection() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useFinanceSettings();
  const [form, setForm] = useState({
    invoice_prefix: '',
    invoice_next_number: '',
    credit_note_prefix: '',
    credit_note_next_number: '',
    number_padding: '',
  });
  const [busy, setBusy] = useState(false);

  // Fill the form from the server, and again after a save.
  useEffect(() => {
    if (!data) return;
    setForm({
      invoice_prefix: data.invoice_prefix,
      invoice_next_number: String(data.invoice_next_number),
      credit_note_prefix: data.credit_note_prefix,
      credit_note_next_number: String(data.credit_note_next_number),
      number_padding: String(data.number_padding),
    });
  }, [data]);

  if (isLoading) return <ListSkeleton rows={4} />;
  if (isError || !data) return <ErrorState onRetry={refetch} message="Couldn't load the numbering settings." />;

  const editable = data.can_edit;
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const errors: Partial<Record<keyof typeof form, string>> = {};
  if (!PREFIX.test(form.invoice_prefix)) errors.invoice_prefix = 'Up to 12 letters, digits, / _ or -';
  if (!PREFIX.test(form.credit_note_prefix)) errors.credit_note_prefix = 'Up to 12 letters, digits, / _ or -';
  if (!(intOf(form.invoice_next_number) >= 1)) errors.invoice_next_number = 'A whole number, 1 or more';
  if (!(intOf(form.credit_note_next_number) >= 1)) errors.credit_note_next_number = 'A whole number, 1 or more';
  const pad = intOf(form.number_padding);
  if (!(pad >= 1 && pad <= 10)) errors.number_padding = 'Between 1 and 10 digits';
  const valid = Object.keys(errors).length === 0;

  // Only what changed goes to the server.
  const changes: FinanceSettingsInput = {};
  if (form.invoice_prefix !== data.invoice_prefix) changes.invoice_prefix = form.invoice_prefix;
  if (intOf(form.invoice_next_number) !== data.invoice_next_number) changes.invoice_next_number = intOf(form.invoice_next_number);
  if (form.credit_note_prefix !== data.credit_note_prefix) changes.credit_note_prefix = form.credit_note_prefix;
  if (intOf(form.credit_note_next_number) !== data.credit_note_next_number) {
    changes.credit_note_next_number = intOf(form.credit_note_next_number);
  }
  if (pad !== data.number_padding) changes.number_padding = pad;
  const dirty = Object.keys(changes).length > 0;

  const save = async () => {
    if (!valid || !dirty) return;
    setBusy(true);
    try {
      const next: FinanceSettings = await updateFinanceSettings(changes);
      qc.setQueryData(['finance-settings'], next);
      toast.success('Numbering saved');
    } catch (e) {
      // e.g. a next number at or below one already issued; the server says which.
      toast.error(e instanceof Error ? e.message : "Couldn't save the numbering");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-4">
      {!editable && <Banner tone="warning" message="Only an admin can change the numbering." />}

      <Group label="Invoices">
        <View className="gap-4 p-3.5">
          <TextField
            label="Prefix"
            value={form.invoice_prefix}
            onChangeText={set('invoice_prefix')}
            editable={editable}
            autoCapitalize="characters"
            maxLength={12}
            error={editable ? errors.invoice_prefix : undefined}
          />
          <TextField
            label="Next number"
            value={form.invoice_next_number}
            onChangeText={set('invoice_next_number')}
            editable={editable}
            keyboardType="number-pad"
            error={editable ? errors.invoice_next_number : undefined}
          />
          <Txt className="text-caption text-muted">
            Next invoice: {preview(form.invoice_prefix, form.invoice_next_number, form.number_padding)}
          </Txt>
        </View>
      </Group>

      <Group label="Credit notes">
        <View className="gap-4 p-3.5">
          <TextField
            label="Prefix"
            value={form.credit_note_prefix}
            onChangeText={set('credit_note_prefix')}
            editable={editable}
            autoCapitalize="characters"
            maxLength={12}
            error={editable ? errors.credit_note_prefix : undefined}
          />
          <TextField
            label="Next number"
            value={form.credit_note_next_number}
            onChangeText={set('credit_note_next_number')}
            editable={editable}
            keyboardType="number-pad"
            error={editable ? errors.credit_note_next_number : undefined}
          />
          <Txt className="text-caption text-muted">
            Next credit note: {preview(form.credit_note_prefix, form.credit_note_next_number, form.number_padding)}
          </Txt>
        </View>
      </Group>

      <Group label="Format">
        <View className="gap-4 p-3.5">
          <TextField
            label="Digits"
            value={form.number_padding}
            onChangeText={set('number_padding')}
            editable={editable}
            keyboardType="number-pad"
            error={editable ? errors.number_padding : undefined}
          />
          <Txt className="text-caption text-muted">
            Numbers are padded with zeros to this length. Drafts have no number until they are sent.
          </Txt>
        </View>
      </Group>

      <Group label="VAT">
        <DetailRow
          label="VAT registered"
          value={data.vat_registered ? 'Yes' : 'No'}
          mono={false}
          hint={data.vat_registered ? undefined : 'Invoices carry no VAT'}
          last
        />
      </Group>

      {editable && (
        <Button
          label="Save numbering"
          loading={busy}
          disabled={!valid || !dirty}
          onPress={() => void save()}
          fullWidth
        />
      )}
    </View>
  );
}
