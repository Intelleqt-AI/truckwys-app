import { View, Pressable } from 'react-native';
import { TextField, Button, Icon, Label, Txt } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

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
}: {
  value: string;
  onChangeText: (t: string) => void;
  onSubmit: () => void;
  busy: boolean;
  /** Opens the voice sheet. */
  onRecord: () => void;
  note?: string;
}) {
  const { colors } = useTheme();

  return (
    <View className="rounded-xs border border-line bg-surface p-3">
      <View className="mb-2 flex-row items-center gap-1.5">
        <Icon name="sparkle" size={14} color={colors.accent} />
        <Label className="text-accent">Describe it</Label>
      </View>
      <TextField
        placeholder="e.g. 20t steel, Johannesburg to Cape Town, flatbed Tuesday"
        value={value}
        onChangeText={onChangeText}
        multiline
      />
      {note ? <Txt className="mt-1.5 text-caption text-muted">{note}</Txt> : null}
      <View className="mt-2 flex-row items-stretch gap-2.5">
        <Pressable
          onPress={onRecord}
          accessibilityRole="button"
          accessibilityLabel="Record voice"
          className="w-14 items-center justify-center rounded-xs border border-line-active bg-surface active:opacity-70"
        >
          <Icon name="mic" size={20} color={colors.accent} />
        </Pressable>
        <View className="flex-1">
          <Button
            label="Fill from description"
            icon="sparkle"
            variant="secondary"
            loading={busy}
            disabled={!value.trim()}
            onPress={onSubmit}
            fullWidth
          />
        </View>
      </View>
    </View>
  );
}
