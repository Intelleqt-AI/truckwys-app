import type { ReactNode } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { TextField, Button, Card, Icon, Label, Txt } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { t, type UiLang } from './quote/nlFill';

// "Describe it" — type a job in plain language, or tap the mic.
//
// Recording used to happen inline here, with a fake sine-wave animation and a
// bare "Transcribing…" label. It now hands off to VoiceQuoteSheet, which shows
// a real input-level waveform and names each stage, so the mic button's only
// job is to open it.

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

  return (
    <Card className="p-3">
      <View className="mb-2 flex-row items-center gap-1.5">
        <Icon name="sparkle" size={14} color={colors.muted} />
        <Label className="text-muted">{t(lang, 'describe')}</Label>
      </View>
      <TextField
        placeholder={t(lang, 'placeholder')}
        accessibilityLabel={t(lang, 'describe')}
        value={value}
        onChangeText={onChangeText}
        multiline
        bottomSheet
      />
      {heard ? <Txt className="mt-1.5 text-caption text-faint">{heard}</Txt> : null}
      {/* The reply, in the person's language. Polite: read after what's being said. */}
      <View accessibilityLiveRegion="polite">
        {note ? <Txt className="mt-1.5 text-caption text-muted">{note}</Txt> : null}
      </View>
      <View className="mt-2 flex-row items-stretch gap-2.5">
        <TouchableOpacity
          onPress={onRecord}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t(lang, 'record')}
          className="min-h-[44px] w-14 items-center justify-center rounded-control border border-line-active bg-surface"
        >
          <Icon name="mic" size={20} color={colors.fg} />
        </TouchableOpacity>
        <View className="flex-1">
          <Button
            label={t(lang, 'fill')}
            icon="sparkle"
            variant="secondary"
            loading={busy}
            disabled={!value.trim()}
            onPress={onSubmit}
            fullWidth
          />
        </View>
      </View>
      {children}
    </Card>
  );
}
