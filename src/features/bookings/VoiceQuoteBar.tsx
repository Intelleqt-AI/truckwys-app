import { View, TouchableOpacity } from 'react-native';
import { TextField, Button, Card, Icon, Label, Txt } from '@/components/ui';
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
    <Card className="p-3">
      <View className="mb-2 flex-row items-center gap-1.5">
        <Icon name="sparkle" size={14} color={colors.muted} />
        <Label className="text-muted">Describe it</Label>
      </View>
      <TextField
        placeholder="e.g. 20t steel, Johannesburg to Cape Town, flatbed Tuesday"
        value={value}
        onChangeText={onChangeText}
        multiline
        bottomSheet
      />
      {note ? <Txt className="mt-1.5 text-caption text-muted">{note}</Txt> : null}
      <View className="mt-2 flex-row items-stretch gap-2.5">
        <TouchableOpacity
          onPress={onRecord}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Record voice"
          className="w-14 items-center justify-center rounded-control border border-line-active bg-surface"
        >
          <Icon name="mic" size={20} color={colors.fg} />
        </TouchableOpacity>
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
    </Card>
  );
}
