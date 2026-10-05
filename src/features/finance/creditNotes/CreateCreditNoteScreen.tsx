import { useMemo, useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  SheetScreen,
  SegmentedControl,
  SelectField,
  TextField,
  DateField,
  Button,
  Card,
  Banner,
  Group,
  DetailRow,
  Icon,
  Label,
  SelectionDot,
  Txt,
  Mono,
} from '@/components/ui';
import { DetailSkeleton, ErrorState } from '@/components/feedback';
import { useTheme } from '@/theme/ThemeProvider';
import { useInvoice } from '../api';
import { TotalsBreakdown } from '../components/TotalsBreakdown';
import { createCreditNote, useTaxCodes } from '@/lib/finance/api';
import { creditFromLine, lineRemaining, round2 } from '@/lib/finance/creditNote';
import {
  computeLine,
  formatQuantity,
  normaliseDecimalInput,
  sumLines,
  taxCodeShort,
  toNumber,
} from '@/lib/finance/tax';
import type {
  CreditNote,
  CreditNoteCreateInput,
  CreditNoteLineInput,
  InvoiceLine,
  TaxCode,
} from '@/lib/finance/types';
import { str, pick } from '@/lib/api/list';
import { formatCurrency } from '@/lib/formatters';
import { invoiceDisplayNumber } from '@/lib/invoiceStatus';
import { localDateISO } from '@/lib/dates';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'CreateCreditNote'>;

type Mode = 'full' | 'pick' | 'custom';
interface Pick1 {
  on: boolean;
  qty: string;
}
interface Custom {
  key: number;
  description: string;
  amount: string;
  tax_code: TaxCode;
}

const money = (v: string | number) => formatCurrency(toNumber(v));

/** Reduces what the customer owes on an invoice, without changing the invoice as it was sent. */
export function CreateCreditNoteScreen({ route, navigation }: Props) {
  const { invoiceId, preview } = route.params;
  const { colors } = useTheme();
  const qc = useQueryClient();
  const { data, isError, isPending, refetch } = useInvoice(invoiceId, preview);
  const { data: taxData } = useTaxCodes();
  const codes = taxData?.codes;
  const defaultTax: TaxCode = taxData?.default_tax_code ?? 'STANDARD';

  const [mode, setMode] = useState<Mode>('full');
  const [reason, setReason] = useState('');
  const [issueDate, setIssueDate] = useState(localDateISO());
  const [picks, setPicks] = useState<Record<number, Pick1>>({});
  const [custom, setCustom] = useState<Custom[]>([{ key: 1, description: '', amount: '', tax_code: 'STANDARD' }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const inv = (data ?? {}) as Record<string, unknown>;
  const allLines = useMemo(
    () =>
      [...((Array.isArray(inv.lines) ? inv.lines : []) as InvoiceLine[])].sort((a, b) => a.position - b.position),
    [inv.lines],
  );
  // Fully credited lines can't be credited again, so the picker leaves them out.
  const lines = useMemo(() => allLines.filter((l) => toNumber(lineRemaining(l)) > 0.004), [allLines]);
  const pickOf = (l: InvoiceLine): Pick1 => picks[l.id] ?? { on: false, qty: formatQuantity(l.quantity) };

  if (isError && !data) return <ErrorState onRetry={refetch} message="Couldn't load this invoice." />;
  if (!data && isPending) {
    return (
      <SheetScreen title="Credit note" variant="modal" onBack={() => navigation.goBack()}>
        <DetailSkeleton />
      </SheetScreen>
    );
  }

  const total = toNumber(str(pick(inv, ['total_amount', 'total']), '0'));
  const credited = toNumber(str(pick(inv, ['credited_amount']), '0'));
  const paid = toNumber(str(pick(inv, ['paid_amount']), '0'));
  const remaining = round2(total - credited);
  const number = invoiceDisplayNumber(inv, `#${invoiceId}`);

  // The lines this credit note would carry (pick / custom modes).
  const creditLines: CreditNoteLineInput[] =
    mode === 'pick'
      ? lines.flatMap((l) => {
          const p = pickOf(l);
          const cl = p.on ? creditFromLine(l, p.qty) : null;
          return cl ? [cl] : [];
        })
      : mode === 'custom'
        ? custom
            .filter((c) => c.description.trim() && toNumber(normaliseDecimalInput(c.amount)) > 0)
            .map((c) => ({
              description: c.description.trim(),
              quantity: '1',
              unit_price: normaliseDecimalInput(c.amount),
              tax_code: c.tax_code,
            }))
        : [];
  const amountsOf = (l: CreditNoteLineInput) =>
    computeLine(
      { quantity: l.quantity, unit_price: l.unit_price, discount: '', discount_mode: 'amount', tax_code: l.tax_code },
      codes,
    );
  const preview1 = sumLines(
    creditLines.map((l) => {
      const a = amountsOf(l);
      return { net: a.net, vat: a.vat, tax_code: l.tax_code };
    }),
  );
  const creditTotal = mode === 'full' ? remaining : toNumber(preview1.total);
  const overCredit = mode !== 'full' && creditTotal > remaining + 0.005;
  const pickProblems =
    mode === 'pick'
      ? lines
          .filter((l) => pickOf(l).on)
          .flatMap((l) => {
            const p = pickOf(l);
            if (toNumber(normaliseDecimalInput(p.qty)) > toNumber(l.quantity) + 1e-9) {
              return [`"${l.description}": at most ${formatQuantity(l.quantity)}.`];
            }
            const cl = creditFromLine(l, p.qty);
            const net = cl ? toNumber(amountsOf(cl).net) : 0;
            return net > toNumber(lineRemaining(l)) + 0.004
              ? [`"${l.description}": only ${money(lineRemaining(l))} excl. VAT is left to credit.`]
              : [];
          })
      : [];

  const canSubmit =
    !!reason.trim() &&
    !busy &&
    !overCredit &&
    pickProblems.length === 0 &&
    (mode === 'full' ? remaining > 0 : creditLines.length > 0);

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    const body: CreditNoteCreateInput =
      mode === 'full'
        ? { invoice: Number(invoiceId), reason: reason.trim(), issue_date: issueDate || undefined, full: true }
        : { invoice: Number(invoiceId), reason: reason.trim(), issue_date: issueDate || undefined, lines: creditLines };
    try {
      const note: CreditNote = await createCreditNote(body);
      invalidateFor(qc, 'credit-note');
      toast.success('Credit note issued');
      // Land on the new credit note rather than back on the invoice.
      navigation.replace('CreditNoteDetail', { id: note.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't issue the credit note. Try again.");
      setBusy(false);
    }
  };

  const balanceAfter = round2(total - paid - credited - creditTotal);

  const modeOptions = [
    { label: 'Everything left', value: 'full' as const },
    ...(lines.length > 0 ? [{ label: 'Some lines', value: 'pick' as const }] : []),
    { label: 'An amount', value: 'custom' as const },
  ];

  const setPick = (l: InvoiceLine, patch: Partial<Pick1>) =>
    setPicks((s) => ({ ...s, [l.id]: { ...pickOf(l), ...patch } }));
  const setCustomLine = (key: number, patch: Partial<Custom>) =>
    setCustom((cs) => cs.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  return (
    <SheetScreen
      title={`Credit note for ${number}`}
      variant="modal"
      onBack={() => navigation.goBack()}
      footer={
        <Button
          label={creditTotal > 0 ? `Issue credit note for ${money(creditTotal)}` : 'Issue credit note'}
          loading={busy}
          disabled={!canSubmit}
          onPress={() => void submit()}
          fullWidth
        />
      }
    >
      <View className="gap-4">
        <Txt className="text-sub text-muted">
          A credit note reduces what the customer owes on this invoice. The invoice itself stays as it was sent.
        </Txt>

        <View>
          <Label className="mb-1.5">What to credit</Label>
          <SegmentedControl options={modeOptions} value={mode} onChange={setMode} />
        </View>

        {mode === 'full' && (
          <Card className="p-3.5">
            <Txt className="text-body font-medium text-fg">Credits {money(remaining)} incl. VAT</Txt>
            <Txt className="mt-1 text-sub text-muted">
              {credited > 0
                ? `The invoice total less ${money(credited)} already credited.`
                : 'The whole invoice, line by line.'}
            </Txt>
          </Card>
        )}

        {mode === 'pick' &&
          lines.map((l) => {
            const p = pickOf(l);
            const cl = p.on ? creditFromLine(l, p.qty) : null;
            const a = cl ? amountsOf(cl) : null;
            return (
              <Card key={l.id} className="gap-3 p-3.5">
                <TouchableOpacity
                  onPress={() => setPick(l, { on: !p.on })}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: p.on }}
                  className="flex-row items-center gap-3"
                >
                  <SelectionDot selected={p.on} />
                  <View className="flex-1">
                    <Txt className="text-body text-fg">{l.description}</Txt>
                    <Txt className="mt-0.5 text-caption text-muted">
                      {`${formatQuantity(l.quantity)} × ${money(l.unit_price)} · ${taxCodeShort(l.tax_code)} · ${money(lineRemaining(l))} left`}
                    </Txt>
                  </View>
                </TouchableOpacity>
                {p.on && (
                  <View className="flex-row items-end gap-3">
                    <View className="flex-1">
                      <TextField
                        label="Credit qty"
                        value={p.qty}
                        onChangeText={(t) => setPick(l, { qty: t })}
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <View className="flex-1 pb-3">
                      <Txt className="text-caption text-muted">Credit excl. VAT</Txt>
                      <Mono className="text-body font-semibold text-fg">{a ? money(a.net) : '—'}</Mono>
                    </View>
                  </View>
                )}
              </Card>
            );
          })}

        {mode === 'custom' && (
          <View className="gap-3">
            {custom.map((c, i) => (
              <Card key={c.key} className="gap-3 p-3.5">
                <View className="flex-row items-center justify-between">
                  <Mono className="text-sub font-medium text-muted">Line {i + 1}</Mono>
                  {custom.length > 1 && (
                    <TouchableOpacity
                      onPress={() => setCustom((cs) => cs.filter((x) => x.key !== c.key))}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove credit line ${i + 1}`}
                    >
                      <Icon name="trash" size={17} color={colors.faint} />
                    </TouchableOpacity>
                  )}
                </View>
                <TextField
                  label="Description"
                  value={c.description}
                  onChangeText={(t) => setCustomLine(c.key, { description: t })}
                  placeholder="e.g. Rate correction, waiting time"
                />
                <View className="flex-row gap-3">
                  <View className="flex-[3]">
                    <TextField
                      label="Amount (excl. VAT)"
                      value={c.amount}
                      onChangeText={(t) => setCustomLine(c.key, { amount: t })}
                      keyboardType="decimal-pad"
                      placeholder="0,00"
                      prefix="R"
                    />
                  </View>
                  <View className="flex-[2]">
                    <SelectField
                      label="Tax"
                      value={c.tax_code}
                      options={(codes ?? []).map((o) => ({ label: o.label, value: o.code }))}
                      onSelect={(v) => setCustomLine(c.key, { tax_code: v as TaxCode })}
                    />
                  </View>
                </View>
              </Card>
            ))}
            <Button
              label="Add a line"
              icon="plus"
              variant="secondary"
              onPress={() =>
                setCustom((cs) => [
                  ...cs,
                  { key: Date.now(), description: '', amount: '', tax_code: cs[cs.length - 1]?.tax_code ?? defaultTax },
                ])
              }
              fullWidth
            />
          </View>
        )}

        <TextField
          label="Reason"
          required
          value={reason}
          onChangeText={setReason}
          placeholder="e.g. Rate agreed at R 18 500, invoiced at R 19 500"
          multiline
          maxLength={500}
        />
        <DateField label="Credit note date" value={issueDate} onChange={setIssueDate} />

        {mode !== 'full' ? (
          <TotalsBreakdown
            label="Credit"
            subtotal={preview1.subtotal}
            vat={preview1.vat}
            total={preview1.total}
            byCode={preview1.byCode}
          />
        ) : credited === 0 && allLines.length > 0 ? (
          // Nothing credited yet: the credit mirrors the invoice line by line.
          (() => {
            const t = sumLines(
              allLines.map((l) => ({ net: l.net_amount, vat: l.vat_amount, tax_code: l.tax_code })),
            );
            return (
              <TotalsBreakdown label="Credit" subtotal={t.subtotal} vat={t.vat} total={t.total} byCode={t.byCode} />
            );
          })()
        ) : (
          <Group label="Credit">
            <DetailRow label="Credit, incl. VAT" value={money(remaining)} boldValue last />
          </Group>
        )}

        <Group label="Invoice after this credit">
          <DetailRow label="Balance" value={money(balanceAfter)} boldValue last />
        </Group>
        {balanceAfter < -0.005 && (
          <Txt className="text-caption text-muted">
            The customer has paid more than the invoice will be worth: {money(-balanceAfter)} becomes a credit in
            their favour.
          </Txt>
        )}

        {overCredit && (
          <Banner tone="danger" message={`The credit is more than the ${money(remaining)} left to credit on this invoice.`} />
        )}
        {pickProblems.length > 0 && <Banner tone="danger" message={pickProblems.join('\n')} />}
        {!!error && <Banner tone="danger" message={error} />}
      </View>
    </SheetScreen>
  );
}
