import { Modal, TouchableOpacity, ScrollView, View } from 'react-native';
import { Txt, Mono } from './Text';
import { Button } from './primitives';
import { useTheme } from '@/theme/ThemeProvider';

// Preview-and-confirm for every message that leaves TruckWys (quote, invoice,
// reminder): who gets it, the subject, what it says, and a second explicit tap
// to send. Port of the web app's SendPreviewDialog. Nothing is sent from here;
// `onConfirm` runs the caller's existing API call unchanged.

export interface SendPreviewRow {
  label: string;
  value: string;
  /** Draws the value in the warning colour (e.g. "expired"). */
  warn?: boolean;
}

export interface SendPreviewSheetProps {
  /** e.g. "Send reminder", "Send invoice", "Send quote to customer". */
  title: string;
  /** Recipient email. `undefined` while it loads, `null` when none is on file. */
  to: string | null | undefined;
  /** Who the recipient is, e.g. the customer name. */
  toName?: string;
  /** The recipient lookup failed. */
  toError?: boolean;
  /** Subject line as the server sends it, when known. */
  subject?: string;
  /** What the message says, as short label/value rows. */
  rows: SendPreviewRow[];
  /** One short line under the summary (e.g. what the email links to). */
  note?: string;
  /** A problem worth reading before sending, in the warning colour. */
  warning?: string;
  confirmLabel: string;
  /** Allow confirming without an email on file (a quote is still marked sent). */
  noEmailConfirmLabel?: string;
  /** Shown when there is no email on file. */
  noEmailHint?: string;
  sending?: boolean;
  /**
   * A better next step than sending (e.g. "Edit quote" on an expired quote).
   * When set it is the primary button and the send button steps down to
   * secondary; the send handler is unchanged.
   */
  preferredAction?: { label: string; onPress: () => void };
  onConfirm: () => void;
  onCancel: () => void;
}

export function SendPreviewSheet({
  title,
  to,
  toName,
  toError,
  subject,
  rows,
  note,
  warning,
  confirmLabel,
  noEmailConfirmLabel,
  noEmailHint,
  sending = false,
  preferredAction,
  onConfirm,
  onCancel,
}: SendPreviewSheetProps) {
  const { colors } = useTheme();
  const loadingTo = to === undefined && !toError;
  const noEmail = to === null;
  const blocked = loadingTo || (noEmail && !noEmailConfirmLabel);
  const label = sending
    ? 'Sending…'
    : noEmail && noEmailConfirmLabel
      ? noEmailConfirmLabel
      : confirmLabel;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => !sending && onCancel()}>
      <TouchableOpacity
        activeOpacity={1}
        accessible={false}
        onPress={() => !sending && onCancel()}
        className="flex-1 items-center justify-center bg-backdrop px-6"
      >
        {/* Inner touchable swallows taps so they don't reach the backdrop. */}
        <TouchableOpacity
          activeOpacity={1}
          accessible={false}
          className="max-h-[88%] w-full max-w-[420px] rounded-panel border border-line bg-elevated p-5"
          style={{ boxShadow: colors.shadowPop }}
        >
          <Txt className="text-heading font-semibold text-fg">{title}</Txt>

          <ScrollView className="mt-3" showsVerticalScrollIndicator={false}>
            <View className="mb-3">
              <Mono className="mb-0.5 text-caption font-medium text-faint">To</Mono>
              {loadingTo ? (
                <Txt className="text-sub text-muted">Looking up email…</Txt>
              ) : toError ? (
                <Txt className="text-sub text-muted">
                  {toName ? `${toName}, ` : ''}email on file (couldn’t check it here)
                </Txt>
              ) : noEmail ? (
                <Txt className="text-sub text-warning">
                  {toName ? `${toName} has` : 'This customer has'} no email on file
                </Txt>
              ) : (
                <View>
                  {!!toName && <Txt className="text-sub font-medium text-fg">{toName}</Txt>}
                  <Txt className="text-sub text-muted">{to}</Txt>
                </View>
              )}
            </View>

            {!!subject && (
              <View className="mb-3">
                <Mono className="mb-0.5 text-caption font-medium text-faint">Subject</Mono>
                <Txt className="text-sub text-fg">{subject}</Txt>
              </View>
            )}

            {rows.length > 0 && (
              <View className="mb-3 overflow-hidden rounded-control border border-line">
                {rows.map((r, i) => (
                  <View
                    key={r.label}
                    className={`flex-row items-start justify-between gap-3 px-3 py-2.5 ${
                      i < rows.length - 1 ? 'border-b border-line-row' : ''
                    }`}
                  >
                    <Txt className="text-sub text-muted">{r.label}</Txt>
                    <Txt
                      className={`flex-1 text-right text-sub ${r.warn ? 'text-warning' : 'text-fg'}`}
                    >
                      {r.value}
                    </Txt>
                  </View>
                ))}
              </View>
            )}

            {!!warning && (
              <Txt accessibilityRole="alert" className="mb-2 text-sub font-medium text-warning">
                {warning}
              </Txt>
            )}
            {noEmail && !!noEmailHint && <Txt className="mb-2 text-sub text-muted">{noEmailHint}</Txt>}
            {!!note && <Txt className="mb-1 text-sub text-muted">{note}</Txt>}
          </ScrollView>

          <View className="mt-4 gap-2.5">
            {preferredAction ? (
              <>
                <Button
                  label={preferredAction.label}
                  onPress={preferredAction.onPress}
                  disabled={sending}
                  fullWidth
                />
                <Button
                  label={label}
                  variant="secondary"
                  loading={sending}
                  disabled={blocked}
                  onPress={onConfirm}
                  fullWidth
                />
              </>
            ) : (
              <Button label={label} loading={sending} disabled={blocked} onPress={onConfirm} fullWidth />
            )}
            <Button label="Cancel" variant="secondary" onPress={onCancel} disabled={sending} fullWidth />
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
