import { useState } from 'react';
import { View, Modal, StyleSheet, TouchableOpacity } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Txt, Button, DateField } from '@/components/ui';
import { formatDate } from '@/lib/formatters';

// Change an invoice's due date. The backend allows it until the invoice is paid
// or cancelled, writes it to the audit log, and rejects a date before the issue
// date. Moving the date into the future takes an overdue invoice back to sent,
// so reminders and the overdue status follow the new date.

const toDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
};

export function DueDateSheet({
  invoiceNumber,
  issueDate,
  dueDate,
  busy,
  error,
  onSave,
  onCancel,
}: {
  invoiceNumber: string;
  /** ISO date the invoice was issued; the due date cannot be earlier. */
  issueDate: string;
  /** Current due date (ISO). */
  dueDate: string;
  busy?: boolean;
  /** The server's message when the last save was refused. */
  error?: string | null;
  onSave: (dueDate: string) => void;
  onCancel: () => void;
}) {
  const current = dueDate.slice(0, 10);
  const [draft, setDraft] = useState(current);
  const canSave = !!draft && draft !== current && !busy;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => !busy && onCancel()}>
      <View className="flex-1 items-center justify-center bg-backdrop px-6">
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => !busy && onCancel()}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={StyleSheet.absoluteFill}
        />
        <KeyboardAvoidingView behavior="padding" className="w-full max-w-[420px]">
          <View className="rounded-panel border border-line bg-elevated p-5">
            <Txt className="text-heading font-semibold text-fg">Change due date</Txt>
            <Txt className="mb-4 mt-1.5 text-sub text-muted">
              {invoiceNumber}
              {issueDate ? ` · issued ${formatDate(issueDate)}` : ''}
            </Txt>

            <DateField
              label="Due date"
              value={draft}
              onChange={setDraft}
              minimumDate={issueDate ? toDate(issueDate) : undefined}
              error={error ?? undefined}
            />
            {!error && (
              <Txt className="mt-2 text-caption text-faint">
                Reminders and overdue status follow the new date.
              </Txt>
            )}

            <View className="mt-5 flex-row gap-2.5">
              <View className="flex-1">
                <Button label="Cancel" variant="secondary" onPress={onCancel} disabled={busy} fullWidth />
              </View>
              <View className="flex-1">
                <Button
                  label={busy ? 'Saving…' : 'Save'}
                  loading={busy}
                  disabled={!canSave}
                  onPress={() => canSave && onSave(draft)}
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
