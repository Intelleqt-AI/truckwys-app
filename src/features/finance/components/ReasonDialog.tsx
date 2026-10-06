import { useState } from 'react';
import { View, Modal, StyleSheet, TouchableOpacity } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Txt, Button, TextField } from '@/components/ui';

// A short text prompt in a dialog. By default it asks for a reason before a
// change that can't be quietly undone (voiding an invoice or a credit note): the
// reason is stored on the record and shown on it afterwards, so it is required.
// It also serves a plain optional field, e.g. the note on an issued invoice.
export function ReasonDialog({
  title,
  message,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
  label = 'Reason',
  placeholder = 'e.g. Raised against the wrong customer',
  initial = '',
  required = true,
  destructive = true,
}: {
  title: string;
  message?: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: (text: string) => void;
  onCancel: () => void;
  label?: string;
  placeholder?: string;
  initial?: string;
  /** False lets an empty value through (clearing a note). */
  required?: boolean;
  /** Danger-coloured confirm button. */
  destructive?: boolean;
}) {
  const [text, setText] = useState(initial);
  const trimmed = text.trim();
  const canConfirm = !busy && (!required || !!trimmed);
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
            <Txt className="text-heading font-semibold text-fg">{title}</Txt>
            {message ? <Txt className="mb-4 mt-1.5 text-sub text-muted">{message}</Txt> : <View className="h-4" />}
            <TextField
              label={label}
              required={required}
              placeholder={placeholder}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={500}
              autoFocus
            />
            <View className="mt-4 flex-row gap-2.5">
              <View className="flex-1">
                <Button label="Cancel" variant="secondary" onPress={onCancel} fullWidth />
              </View>
              <View className="flex-1">
                <Button
                  label={confirmLabel}
                  variant={destructive ? 'danger' : 'primary'}
                  loading={busy}
                  disabled={!canConfirm}
                  onPress={() => canConfirm && onConfirm(trimmed)}
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
