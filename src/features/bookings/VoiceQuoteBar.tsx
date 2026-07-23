import { useEffect, useState } from 'react';
import { View, Pressable, Platform } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { useAudioRecorder, RecordingPresets, AudioModule, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { TextField, Button, Icon, Label, Mono, Txt } from '@/components/ui';
import { aiVoiceQuote } from './api';
import { str, pick } from '@/lib/api/list';
import { toast } from '@/lib/toast';
import { useTheme } from '@/theme/ThemeProvider';

// Premium "AI is listening" describe-it bar: type OR speak → transcribe →
// natural-language autofill. Record → stop → POST ai/voice-quote/ → text →
// onTranscribed(text) (parent runs ai/chat-quote and fills the form).
const BAR_COUNT = 22;

function WaveBar({ clock, index }: { clock: SharedValue<number>; index: number }) {
  const { colors } = useTheme();
  const style = useAnimatedStyle(() => {
    'worklet';
    const phase = clock.value * Math.PI * 2 + index * 0.55;
    const amp = 0.5 + 0.5 * Math.sin(phase);
    return { height: 5 + amp * 24 };
  });
  return (
    <Animated.View style={[{ width: 3, borderRadius: 2, backgroundColor: colors.accent }, style]} />
  );
}

function Waveform() {
  const clock = useSharedValue(0);
  useEffect(() => {
    clock.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1, false);
  }, [clock]);
  return (
    <View className="flex-1 flex-row items-center justify-center" style={{ gap: 3, height: 32 }}>
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <WaveBar key={i} clock={clock} index={i} />
      ))}
    </View>
  );
}

export function VoiceQuoteBar({
  value,
  onChangeText,
  onSubmit,
  busy,
  onTranscribed,
  note,
}: {
  value: string;
  onChangeText: (t: string) => void;
  onSubmit: () => void;
  busy: boolean;
  onTranscribed: (text: string) => void;
  note?: string;
}) {
  const { colors } = useTheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const haptic = (type: Haptics.ImpactFeedbackStyle) => {
    if (Platform.OS !== 'web') void Haptics.impactAsync(type);
  };

  const start = async () => {
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) return toast.error('Microphone permission is needed to record');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      haptic(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start recording');
    }
  };

  const stop = async () => {
    haptic(Haptics.ImpactFeedbackStyle.Light);
    setRecording(false);
    setTranscribing(true);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error('No audio captured');
      const res = await aiVoiceQuote({ uri, name: 'quote.m4a', type: 'audio/m4a' });
      const text = str(pick(res, ['text', 'transcription'])).trim();
      if (text) onTranscribed(text);
      else toast.error('Could not transcribe that — try again');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not transcribe audio');
    } finally {
      setTranscribing(false);
    }
  };

  // Recording — focused "listening" panel.
  if (recording) {
    return (
      <View className="rounded-xs border border-accent bg-surface p-4">
        <View className="mb-3 flex-row items-center justify-center gap-2">
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />
          <Label className="text-accent">Listening…</Label>
        </View>
        <View className="flex-row items-center gap-3">
          <Waveform />
          <Pressable
            onPress={stop}
            accessibilityRole="button"
            accessibilityLabel="Stop recording"
            className="h-10 flex-row items-center gap-1.5 rounded-xs px-4"
            style={{ backgroundColor: '#FF4949' }}
          >
            <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#fff' }} />
            <Mono
              className="text-micro font-semibold uppercase tracking-wide"
              style={{ color: '#fff' }}
            >
              Stop
            </Mono>
          </Pressable>
        </View>
      </View>
    );
  }

  // Transcribing.
  if (transcribing) {
    return (
      <View className="rounded-xs border border-line bg-surface p-4">
        <View className="flex-row items-center justify-center gap-2">
          <Icon name="sparkle" size={16} color={colors.accent} />
          <Label className="text-muted">Transcribing…</Label>
        </View>
      </View>
    );
  }

  // Idle — type or tap the mic.
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
          onPress={start}
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
