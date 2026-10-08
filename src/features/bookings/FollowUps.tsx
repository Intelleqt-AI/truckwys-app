import { useEffect, useState } from 'react';
import { View, Modal, ScrollView, TouchableOpacity } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useQueryClient } from '@tanstack/react-query';
import { Card, Button, Label, Txt, Mono, TextField } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useRole, canSeeFinanceFeatures } from '@/lib/access';
import {
  adjustmentRow,
  apiMessage,
  cleanNote,
  draftClauseLine,
  expiresLine,
  fuelReferenceLine,
  lastReminderLine,
  NOTE_MAX,
  reminderSendLabel,
  reminderSentText,
  sentLine,
  type FollowUpState,
  type FuelAdjustment,
} from '@/lib/followups';
import { useReminderPreview, sendReminder } from './followupsApi';

// Quote follow-ups on the quote and load screens (FOLLOWUPS-CLIENT-SPEC §2, §4).

/**
 * "Fuel price adjustment" on a sent quote or a load. Hidden when the quote has
 * no clause (or the load no quote).
 */
export function FuelAdjustmentGroup({
  adjustment,
  onOpenInvoice,
}: {
  adjustment: FuelAdjustment | null | undefined;
  onOpenInvoice?: (invoiceId: number) => void;
}) {
  const { colors } = useTheme();
  const row = adjustmentRow(adjustment);
  if (!row) return null;
  return (
    <View className="mb-5">
      <Label className="mb-2.5">Fuel price adjustment</Label>
      <Card>
        <View className="flex-row items-start justify-between gap-3 px-3.5 py-3">
          <View className="flex-1">
            <Txt className="text-callout text-fg">{row.title}</Txt>
            {row.sub && row.invoiceId != null && onOpenInvoice ? (
              <TouchableOpacity
                onPress={() => onOpenInvoice(row.invoiceId!)}
                activeOpacity={0.6}
                accessibilityRole="link"
                hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                className="mt-1 self-start"
              >
                <Txt className="text-caption font-medium text-link">{row.sub}</Txt>
              </TouchableOpacity>
            ) : row.sub ? (
              <Txt className="mt-1 text-caption text-faint">{row.sub}</Txt>
            ) : null}
          </View>
          {row.amount ? (
            <Mono
              className="shrink-0 text-sub font-semibold"
              style={{ color: row.tone === 'down' ? colors.success : colors.fg }}
            >
              {row.amount}
            </Mono>
          ) : null}
        </View>
      </Card>
    </View>
  );
}

/**
 * The muted line under a draft's price: what the PDF will say about fuel
 * (the diesel line, then the clause). Nothing when the company has the clause off.
 */
export function DraftClauseLine({
  quote,
  adjustment,
  className = '',
}: {
  quote: Record<string, unknown> | null | undefined;
  adjustment: FuelAdjustment | null | undefined;
  className?: string;
}) {
  if (!adjustment?.clause) return null;
  const line = draftClauseLine(fuelReferenceLine(quote), adjustment.clause);
  if (!line) return null;
  return <Txt className={`text-caption text-faint ${className}`}>{line}</Txt>;
}

/** The follow-up card on a SENT quote: when it went, when it expires, the reminder. */
export function FollowUpCard({
  quoteId,
  state,
  highlight,
}: {
  quoteId: string | number;
  state: FollowUpState;
  /** Opened from a nudge (?follow_up=1): drawn with the accent border. */
  highlight?: boolean;
}) {
  const { colors } = useTheme();
  const role = useRole();
  const [open, setOpen] = useState(false);
  const lines = [sentLine(state), expiresLine(state), lastReminderLine(state)].filter(
    (l): l is string => !!l,
  );
  const canSend = state.reminder.can_send;
  const mayEmail = canSeeFinanceFeatures(role);

  return (
    <View className="mb-5">
      <Label className="mb-2.5">Follow-up</Label>
      <Card style={highlight ? { borderColor: colors.accent } : undefined}>
        <View className="gap-1 px-3.5 pt-3">
          {lines.map((l) => (
            <Txt key={l} className="text-callout text-fg">
              {l}
            </Txt>
          ))}
        </View>
        {mayEmail && (
          <View className="px-3.5 pb-3.5 pt-3">
            <Button
              label="Send reminder"
              icon="send"
              variant="secondary"
              disabled={!canSend}
              onPress={() => setOpen(true)}
              fullWidth
            />
            {!canSend && state.reminder.reason_text ? (
              <Txt className="mt-2 text-caption text-faint">{state.reminder.reason_text}</Txt>
            ) : null}
          </View>
        )}
        {!mayEmail && <View className="h-3" />}
      </Card>
      {open && <ReminderSheet quoteId={quoteId} onClose={() => setOpen(false)} />}
    </View>
  );
}

/**
 * Send reminder, two steps: the preview (To, Subject, the text, an optional
 * note that re-fetches the preview), then "Send to buyer@acme.test".
 */
function ReminderSheet({ quoteId, onClose }: { quoteId: string | number; onClose: () => void }) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const settled = cleanNote(useDebouncedValue(note, 400));
  const preview = useReminderPreview(quoteId, settled, true);
  const p = preview.data?.preview ?? null;
  const blocked = preview.data ? !preview.data.can_send : false;
  const to = p?.to || null;
  // The preview for the note as typed is still on its way.
  const catchingUp = cleanNote(note) !== settled || preview.isFetching;

  useEffect(() => {
    if (preview.isError) toast.error(apiMessage(preview.error, "Couldn't load the reminder."));
  }, [preview.isError, preview.error]);

  const send = async () => {
    if (sending || blocked || !to) return;
    setSending(true);
    try {
      const res = await sendReminder(quoteId, cleanNote(note));
      toast.notice(reminderSentText(res?.sent_to || to));
      invalidateFor(qc, 'quote');
      onClose();
    } catch (e) {
      toast.error(apiMessage(e, 'The reminder could not be sent. Please try again.'));
      // too_soon / expired / … : the card's state moved on.
      void qc.invalidateQueries({ queryKey: ['quote-follow-up', quoteId] });
    } finally {
      setSending(false);
    }
  };

  const close = () => !sending && onClose();

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <TouchableOpacity
        activeOpacity={1}
        accessible={false}
        onPress={close}
        className="flex-1 items-center justify-center bg-backdrop px-4"
      >
        <KeyboardAvoidingView behavior="padding" className="max-h-[90%] w-full max-w-[440px]">
          <TouchableOpacity
            activeOpacity={1}
            accessible={false}
            className="rounded-panel border border-line bg-elevated p-5"
            style={{ boxShadow: colors.shadowPop }}
          >
            <Txt className="text-heading font-semibold text-fg">Send reminder</Txt>
            <ScrollView
              className="mt-3"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {preview.isPending ? (
                <Txt className="mb-3 text-sub text-muted">Preparing the preview…</Txt>
              ) : p ? (
                <>
                  <View className="mb-3">
                    <Mono className="mb-0.5 text-caption font-medium text-faint">To</Mono>
                    <Txt className="text-sub text-fg">{p.to || 'No email on file'}</Txt>
                  </View>
                  <View className="mb-3">
                    <Mono className="mb-0.5 text-caption font-medium text-faint">Subject</Mono>
                    <Txt className="text-sub text-fg">{p.subject}</Txt>
                  </View>
                  <View
                    className="mb-3 rounded-control border border-line px-3 py-2.5"
                    style={{ opacity: catchingUp ? 0.6 : 1 }}
                  >
                    <Txt className="text-sub text-muted">{p.text}</Txt>
                  </View>
                  {p.reply_to ? (
                    <Txt className="mb-3 text-caption text-faint">Replies go to {p.reply_to}.</Txt>
                  ) : null}
                </>
              ) : null}
              {blocked && preview.data?.reason_text ? (
                <Txt accessibilityRole="alert" className="mb-3 text-sub font-medium text-warning">
                  {preview.data.reason_text}
                </Txt>
              ) : null}
              <TextField
                label="Add a note (optional)"
                placeholder="e.g. Happy to talk through the price."
                value={note}
                onChangeText={setNote}
                multiline
                maxLength={NOTE_MAX}
                style={{ minHeight: 72, textAlignVertical: 'top' }}
              />
              <Mono className="mt-1 text-right text-caption text-faint">
                {note.length}/{NOTE_MAX}
              </Mono>
            </ScrollView>
            <View className="mt-4 gap-2.5">
              <Button
                label={sending ? 'Sending…' : reminderSendLabel(to)}
                icon="send"
                loading={sending}
                disabled={!to || blocked || preview.isPending || catchingUp}
                onPress={() => void send()}
                fullWidth
              />
              <Button
                label="Cancel"
                variant="secondary"
                onPress={close}
                disabled={sending}
                fullWidth
              />
            </View>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>
  );
}
