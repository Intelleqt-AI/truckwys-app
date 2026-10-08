import { forwardRef, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { VoiceQuoteBar } from '../VoiceQuoteBar';
import type { UiLang } from './nlFill';

export interface NaturalLanguageBarHandle {
  /** Pushes text into the bar without going through a keystroke — used to
      show a voice transcription before submitNL runs, and to clear the bar
      after a successful fill. */
  setText: (t: string) => void;
  /** Reads the bar's current text — used by the unsaved-changes guard
      (Phase 4) so a typed-but-unsubmitted description still counts as
      real work. */
  getText: () => string;
  /** Moves the screen reader back to the bar (after the Replace / Keep confirm). */
  focusA11y: () => void;
}

/**
 * Colocates the "Describe it" text — read in exactly two places before this
 * move (Phase 1 perf pass): VoiceQuoteBar's `value`, and submitNL's
 * `(text ?? nlText)` default in CreateQuoteScreen.tsx. Every keystroke here
 * used to re-render the whole ~1700-line screen (AI card, cost breakdown, map
 * props) for no reason; now it only re-renders this bar.
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
    heard?: string | null;
    lang?: UiLang;
    children?: ReactNode;
  }
>(function NaturalLanguageBar({ busy, onRecord, onSubmit, note, onTyped, heard, lang, children }, ref) {
  const [text, setText] = useState('');
  // Mirrors `text` so getText() below can read the latest value without the
  // handle's own identity changing on every keystroke.
  const textRef = useRef(text);
  textRef.current = text;
  const boxRef = useRef<View>(null);
  useImperativeHandle(
    ref,
    () => ({
      setText,
      getText: () => textRef.current,
      focusA11y: () => {
        if (boxRef.current) AccessibilityInfo.sendAccessibilityEvent(boxRef.current, 'focus');
      },
    }),
    [],
  );

  return (
    <View ref={boxRef}>
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
        heard={heard}
        lang={lang}
      >
        {children}
      </VoiceQuoteBar>
    </View>
  );
});
