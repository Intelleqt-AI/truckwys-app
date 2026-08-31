import { useState } from 'react';
import { View, Modal, Pressable } from 'react-native';
import { KeyboardAvoidingView, KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Txt, Mono, Button, TextField, DateField, SelectField, type Option } from '@/components/ui';
import { formatCurrency, formatPlain, parseNum } from '@/lib/formatters';

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

const todayISO = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

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
}: {
  /** Outstanding balance — caps the amount and backs the "Full" shortcut. */
  balance: number;
  busy?: boolean;
  onConfirm: (draft: PaymentDraft) => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState('');
  // Web leaves this blank and makes the user pick; defaulting to today matches
  // the expense form and is one less tap for the overwhelmingly common case.
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState('EFT');
  const [reference, setReference] = useState('');

  // parseNum, not Number: with `|| 0` a comma amount left RECORD permanently
  // disabled and told the user nothing about why.
  const parsed = parseNum(amount);
  const invalid = amount.trim() !== '' && parsed == null;
  const amountNum = parsed ?? 0;
  // The backend rejects an overpayment (payments.py: amount > invoice.balance),
  // so catch it here rather than letting the user submit into a 400.
  const overpaying = amountNum > balance;
  const canSubmit = amountNum > 0 && !overpaying && !!date && !busy;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable onPress={onCancel} className="flex-1 items-center justify-center bg-black/65 px-6">
        <KeyboardAvoidingView behavior="padding" className="w-full max-w-[420px]">
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="rounded-sm border border-line bg-surface p-5"
          >
            <Txt className="text-heading font-semibold text-fg">Record payment</Txt>
            <Txt className="mb-4 mt-1.5 text-sub text-muted">
              Outstanding balance {formatCurrency(balance)}
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
                  <Pressable
                    hitSlop={8}
                    onPress={() => setAmount(formatPlain(balance, 2))}
                    className="mt-1.5 self-start"
                  >
                    <Mono className="text-caption text-accent">
                      Full — {formatCurrency(balance)}
                    </Mono>
                  </Pressable>
                </View>

                <DateField
                  label="Payment date"
                  value={date}
                  onChange={setDate}
                  maximumDate={new Date()}
                />

                <SelectField
                  label="Method"
                  icon="dollar"
                  options={PAYMENT_METHODS}
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
                  <Mono className="text-micro text-warning">
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
                  label={busy ? 'RECORDING…' : 'RECORD'}
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
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}
