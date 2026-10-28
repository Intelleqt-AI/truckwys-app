import { useId, useState, type ReactNode } from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Card, Icon, INPUT_TEXT, KeyboardDoneBar, Label, Txt } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { motion, radius } from '@/theme/tokens';
import { useQuoteMotion } from './quote/motion';
import { t, type UiLang } from './quote/nlFill';

// "Describe it" — type a job in plain language, or tap the mic.
//
// Recording used to happen inline here, with a fake sine-wave animation and a
// bare "Transcribing…" label. It now hands off to VoiceQuoteSheet, which shows
// a real input-level waveform and names each stage, so the mic button's only
// job is to open it.
//
// Laid out as a composer, the way a message box is: one rounded field with the
// mic and the send arrow docked inside it at the right. The arrow only appears
// once there is something to send. The field is multiline (a job description
// runs to a few lines), so Return types a newline and the iOS Done bar above
// the keyboard is the way to dismiss it — hence KeyboardDoneBar, which a bare
// BottomSheetTextInput doesn't bring with it the way TextField does.

export function VoiceQuoteBar({
  value,
  onChangeText,
  onSubmit,
  busy,
  onRecord,
  note,
  heard,
  lang = 'en',
  children,
}: {
  value: string;
  onChangeText: (t: string) => void;
  onSubmit: () => void;
  busy: boolean;
  /** Opens the voice sheet. */
  onRecord: () => void;
  note?: string;
  /** "Heard in Afrikaans" under the transcription. */
  heard?: string | null;
  lang?: UiLang;
  /** What the last Fill did: chips, the confirm, Undo. */
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  const m = useQuoteMotion();
  const [focused, setFocused] = useState(false);
  // One accessory view per field, so the id has to be unique per instance.
  const accessoryID = useId();
  const canFill = value.trim().length > 0;

  // The border eases between states, as TextField's does.
  const borderStyle = useAnimatedStyle(() => ({
    borderColor: withTiming(focused ? colors.accent : colors.lineControl, {
      duration: motion.fast,
    }),
  }));

  return (
    <Card className="p-3">
      <View className="mb-2 flex-row items-center gap-1.5">
        <Icon name="sparkle" size={14} color={colors.muted} />
        <Label className="text-muted">{t(lang, 'describe')}</Label>
      </View>
      <Animated.View
        className="flex-row items-end gap-1.5 border bg-input py-1.5 pl-3.5 pr-1.5"
        style={[
          { borderRadius: radius.card },
          borderStyle,
          focused ? { boxShadow: `0 0 0 3px ${colors.focusRing}` } : null,
        ]}
      >
        <BottomSheetTextInput
          className="flex-1 text-fg"
          placeholder={t(lang, 'placeholder')}
          placeholderTextColor={colors.placeholder}
          accessibilityLabel={t(lang, 'describe')}
          value={value}
          onChangeText={onChangeText}
          multiline
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          inputAccessoryViewID={accessoryID}
          style={[
            INPUT_TEXT,
            { paddingTop: 10, paddingBottom: 10, minHeight: 40, maxHeight: 120, textAlignVertical: 'top' },
          ]}
        />
        <TouchableOpacity
          onPress={onRecord}
          activeOpacity={0.7}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={t(lang, 'record')}
          className="h-9 w-9 items-center justify-center rounded-control bg-raised"
        >
          <Icon name="mic" size={18} color={colors.fg} />
        </TouchableOpacity>
        {canFill || busy ? (
          <Animated.View entering={m.enter}>
            <TouchableOpacity
              onPress={onSubmit}
              disabled={busy || !canFill}
              activeOpacity={0.8}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={t(lang, 'fill')}
              accessibilityState={{ disabled: busy || !canFill, busy }}
              className="h-9 w-9 items-center justify-center rounded-control"
              style={{ backgroundColor: colors.btnPrimaryBg }}
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.btnPrimaryFg} />
              ) : (
                <Icon name="arrowRight" size={18} color={colors.btnPrimaryFg} strokeWidth={2.2} />
              )}
            </TouchableOpacity>
          </Animated.View>
        ) : null}
      </Animated.View>
      <KeyboardDoneBar nativeID={accessoryID} />
      {heard ? <Txt className="mt-1.5 text-caption text-faint">{heard}</Txt> : null}
      {/* The reply, in the person's language. Polite: read after what's being said. */}
      <View accessibilityLiveRegion="polite">
        {note ? <Txt className="mt-1.5 text-caption text-muted">{note}</Txt> : null}
      </View>
      {children}
    </Card>
  );
}
