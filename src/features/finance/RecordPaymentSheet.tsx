import { useState } from 'react';
import { View, Modal, StyleSheet, TouchableOpacity } from 'react-native';
import { KeyboardAvoidingView, KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Txt, Mono, Button, TextField, DateField, SelectField, type Option } from '@/components/ui';
import { formatCurrency, formatPlain, parseNum, round2 } from '@/lib/formatters';
import { localDateISO } from '@/lib/dates';
import { paymentMethodLabel } from './api';

// Records a payment against an invoice — the mobile counterpart of the web
// invoice page's inline payment form.
//
// `payment_date` and `payment_method` are REQUIRED by the Payment model with no
// defaults, and record_payment() doesn't fill them in. The old mobile flow was
// a one-tap "record the full balance" confirm that sent only {invoice, amount},
// so every attempt came back 400 "payment_date: This field is required."

// Values must match Payment.PAYMENT_METHOD_CHOICES exactly — PaymentSerializer
// is fields='__all__', so DRF enforces the model's choices.
//
// Labels mirror the web picker, but note the web sends 'CARD', which is NOT a
// valid choice — recording a card payment fails there today. The correct value
// is CREDIT_CARD. EARLY_PAY is deliberately absent: it's set by the system when
// a Fast Pay advance settles, not something to pick by hand.
const PAYMENT_METHODS: Option[] = [
  { label: 'EFT', value: 'EFT' },
  { label: 'Cash', value: 'CASH' },
  { label: 'Card', value: 'CREDIT_CARD' },
  { label: 'Cheque', value: 'CHEQUE' },
];

const todayISO = () => localDateISO();

export interface PaymentDraft {
  amount: number;
  payment_date: string;
  payment_method: string;
  reference: string;
}

export function RecordPaymentSheet({
  balance,
  busy,
  onConfirm,
  onCancel,
  initial,
}: {
  /**
   * The most the amount can be, and what the "Full balance" shortcut fills in:
   * the outstanding balance when recording, or the balance plus this payment's
   * own amount when editing it.
   */
  balance: number;
  busy?: boolean;
  onConfirm: (draft: PaymentDraft) => void;
  onCancel: () => void;
  /** Editing an existing payment: its current values. Omit to record a new one. */
  initial?: PaymentDraft;
}) {
  const editing = !!initial;
  const [amount, setAmount] = useState(initial ? formatPlain(initial.amount, 2) : '');
  // Web leaves this blank and makes the user pick; defaulting to today matches
  // the expense form and is one less tap for the overwhelmingly common case.
  const [date, setDate] = useState(initial?.payment_date.slice(0, 10) || todayISO());
  const [method, setMethod] = useState(initial?.payment_method || 'EFT');
  const [reference, setReference] = useState(initial?.reference ?? '');
  // A payment can have a method that isn't pickable by hand (EARLY_PAY, BANK_TRANSFER):
  // keep showing it rather than a blank field.
  const methods: Option[] = PAYMENT_METHODS.some((m) => m.value === method)
    ? PAYMENT_METHODS
    : [...PAYMENT_METHODS, { label: paymentMethodLabel(method), value: method }];

  // parseNum, not Number: with `|| 0` a comma amount left RECORD permanently
  // disabled and told the user nothing about why.
  const parsed = parseNum(amount);
  const invalid = amount.trim() !== '' && parsed == null;
  // Payment.amount is DecimalField(max_digits=10, decimal_places=2). This
  // field's Amount input can still be focused when RECORD is tapped — the
  // sheet's scroll view uses keyboardShouldPersistTaps="handled", so the
  // decimals={2} blur-reformat may never run — so round here regardless.
  const amountNum = round2(parsed ?? 0);
  // The backend rejects an overpayment (payments.py: amount > invoice.balance),
  // so catch it here rather than letting the user submit into a 400.
  const overpaying = amountNum > balance;
  const canSubmit = amountNum > 0 && !overpaying && !!date && !busy;

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
            <Txt className="text-heading font-semibold text-fg">
              {editing ? 'Edit payment' : 'Record payment'}
            </Txt>
            <Txt className="mb-4 mt-1.5 text-sub text-muted">
              {editing
                ? `Up to ${formatCurrency(balance)}, including this payment`
                : `Outstanding balance ${formatCurrency(balance)}`}
            </Txt>

            <KeyboardAwareScrollView
              className="mb-4 max-h-[380px]"
              keyboardShouldPersistTaps="handled"
            >
              <View className="gap-4">
                <View>
                  <TextField
                    label="Amount"
                    placeholder="0,00"
                    prefix="R"
                    keyboardType="decimal-pad"
                    numeric
                    decimals={2}
                    error={invalid ? 'Enter a number, e.g. 12 500,00' : undefined}
                    value={amount}
                    onChangeText={setAmount}
                  />
                  <TouchableOpacity
                    hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                    activeOpacity={0.6}
                    accessibilityRole="button"
                    onPress={() => setAmount(formatPlain(balance, 2))}
                    className="mt-1.5 self-start"
                  >
                    <Mono className="text-caption text-link">
                      Full balance, {formatCurrency(balance)}
                    </Mono>
                  </TouchableOpacity>
                </View>

                <DateField
                  label="Payment date"
                  value={date}
                  onChange={setDate}
                  maximumDate={new Date()}
                />

                <SelectField
                  label="Method"
                  icon="banknote"
                  options={methods}
                  value={method}
                  onSelect={setMethod}
                />

                <TextField
                  label="Reference (optional)"
                  placeholder="e.g. bank reference"
                  value={reference}
                  onChangeText={setReference}
                />

                {overpaying && (
                  <Mono className="text-caption text-warning">
                    Amount is more than the {formatCurrency(balance)} outstanding.
                  </Mono>
                )}
              </View>
            </KeyboardAwareScrollView>

            <View className="flex-row gap-2.5">
              <View className="flex-1">
                <Button label="Cancel" variant="secondary" onPress={onCancel} fullWidth />
              </View>
              <View className="flex-1">
                <Button
                  label={busy ? (editing ? 'Saving…' : 'Recording…') : editing ? 'Save' : 'Record'}
                  loading={busy}
                  disabled={!canSubmit}
                  onPress={() =>
                    canSubmit &&
                    onConfirm({
                      amount: amountNum,
                      payment_date: date,
                      payment_method: method,
                      reference: reference.trim(),
                    })
                  }
                  fullWidth
                />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
