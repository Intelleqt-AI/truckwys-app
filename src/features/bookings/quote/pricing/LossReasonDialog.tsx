import { useState } from 'react';
import { Modal, TouchableOpacity, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Button, Mono, TextField, Txt } from '@/components/ui';
import { LOSS_REASONS, type LossReason, type LossReasonCode } from '@/lib/pricing';

/**
 * Marking a quote lost or declined: one calm step with an optional reason
 * (port of the web's LossReasonDialog). Nothing is required: "Mark declined"
 * works with no reason picked. A second tap on a reason clears it.
 */
export function LossReasonDialog({
  quoteNumber,
  title = 'Mark quote as declined',
  confirmLabel = 'Mark declined',
  busy = false,
  onConfirm,
  onCancel,
}: {
  quoteNumber?: string;
  title?: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: (reason: LossReason) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState<LossReasonCode | null>(null);
  const [note, setNote] = useState('');
  const cancel = () => {
    if (!busy) onCancel();
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={cancel}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={cancel}
        className="flex-1 items-center justify-center bg-backdrop px-6"
      >
        <KeyboardAvoidingView behavior="padding" className="w-full max-w-[420px]">
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {}}
            className="rounded-panel border border-line bg-surface p-5"
          >
            <Txt className="text-heading font-semibold text-fg" accessibilityRole="header">
              {title}
            </Txt>
            <Txt className="mt-1.5 text-sub text-muted">
              {quoteNumber ? `${quoteNumber}. ` : ''}Why did it not go ahead? Optional, and it sharpens future price
              suggestions.
            </Txt>
            <View
              className="mt-4 flex-row flex-wrap gap-2"
              accessibilityRole="radiogroup"
              accessibilityLabel="Reason (optional)"
            >
              {LOSS_REASONS.map((r) => {
                const on = code === r.code;
                return (
                  <TouchableOpacity
                    key={r.code}
                    // A second tap clears it: the reason stays optional.
                    onPress={() => setCode(on ? null : r.code)}
                    activeOpacity={0.7}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={r.label}
                    className={`min-h-[44px] items-center justify-center rounded-control border px-3.5 ${
                      on ? 'border-line-strong bg-raised' : 'border-line-active bg-surface'
                    }`}
                  >
                    <Mono className={`text-callout ${on ? 'font-semibold text-fg' : 'font-medium text-muted'}`}>
                      {r.label}
                    </Mono>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View className="mt-4">
              <TextField label="Note (optional)" value={note} onChangeText={setNote} maxLength={200} />
            </View>
            <View className="mt-5 flex-row gap-2.5">
              <View className="flex-1">
                <Button label="Cancel" variant="secondary" onPress={cancel} disabled={busy} fullWidth />
              </View>
              <View className="flex-1">
                <Button
                  label={busy ? 'Saving…' : confirmLabel}
                  variant="danger"
                  loading={busy}
                  onPress={() => onConfirm({ code, note })}
                  fullWidth
                />
              </View>
            </View>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>
  );
}
