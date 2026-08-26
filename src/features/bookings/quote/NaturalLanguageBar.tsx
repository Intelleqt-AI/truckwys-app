import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { VoiceQuoteBar } from '../VoiceQuoteBar';

export interface NaturalLanguageBarHandle {
  /** Pushes text into the bar without going through a keystroke — used to
      show a voice transcription before submitNL runs, and to clear the bar
      after a successful fill. */
  setText: (t: string) => void;
  /** Reads the bar's current text — used by the unsaved-changes guard
      (Phase 4) so a typed-but-unsubmitted description still counts as
      real work. */
  getText: () => string;
}

/**
 * Colocates the "Describe it" text — read in exactly two places before this
 * move (Phase 1 perf pass): VoiceQuoteBar's `value`, and submitNL's
 * `(text ?? nlText)` default in CreateQuoteScreen.tsx. Every keystroke here
 * used to re-render the whole ~1700-line screen (AI card, ProfitCurve, cost
 * breakdown, map props) for no reason; now it only re-renders this bar.
 *
 * `nlBusy`/`nlReply` stay in the parent (nlBusy also drives WorkingOverlay;
 * nlReply is written by submitNL) and are passed down as plain props.
 */
export const NaturalLanguageBar = forwardRef<
  NaturalLanguageBarHandle,
  {
    busy: boolean;
    onRecord: () => void;
    onSubmit: (text: string) => void;
    note?: string;
    /** Fires on every keystroke — lets the parent clear a stale nlReply. */
    onTyped?: () => void;
  }
>(function NaturalLanguageBar({ busy, onRecord, onSubmit, note, onTyped }, ref) {
  const [text, setText] = useState('');
  // Mirrors `text` so getText() below can read the latest value without the
  // handle's own identity changing on every keystroke.
  const textRef = useRef(text);
  textRef.current = text;
  useImperativeHandle(ref, () => ({ setText, getText: () => textRef.current }), []);

  return (
    <VoiceQuoteBar
      value={text}
      onChangeText={(t) => {
        setText(t);
        onTyped?.();
      }}
      onSubmit={() => onSubmit(text)}
      busy={busy}
      onRecord={onRecord}
      note={note}
    />
  );
});
