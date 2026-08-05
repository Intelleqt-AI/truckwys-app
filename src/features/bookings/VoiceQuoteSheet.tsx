import { useEffect, useRef, useState } from 'react';
import { View, Modal, Pressable, Platform } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useAudioRecorder, RecordingPresets, AudioModule, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt, Mono, Button, Icon } from '@/components/ui';
import { toast } from '@/lib/toast';
import { useTheme } from '@/theme/ThemeProvider';

// Voice capture, and nothing else: record, Submit, gone.
//
// Everything after Submit — upload, transcription, field extraction — happens
// behind an overlay on the quote form itself, because that's what's about to
// change and that's where the user is looking. This sheet used to narrate
// "Transcribing…" and "Building your quote" while holding itself open, which
// read like debug output and kept the user away from the form.

const BAR_COUNT = 32;
// Poll rate for the input meter. getStatus() is a synchronous bridge call, so
// there's no point going much faster than this.
const METER_MS = 80;
// Metering is dBFS, floor -160. Speech sits around -30..-5, so normalising
// against -60 rather than -160 uses the full height of the bars instead of
// squashing every voice into the top few percent.
const DB_FLOOR = -60;

function Bar({ heights, index }: { heights: SharedValue<number[]>; index: number }) {
  const { colors } = useTheme();
  const style = useAnimatedStyle(() => {
    'worklet';
    const v = heights.value[index] ?? 0;
    return { height: 4 + v * 56 };
  });
  return (
    <Animated.View style={[{ width: 4, borderRadius: 2, backgroundColor: colors.accent }, style]} />
  );
}

/** Scrolling loudness trace. Amplitude, not a spectrum — one level per poll. */
function LiveWaveform({ heights }: { heights: SharedValue<number[]> }) {
  return (
    <View className="flex-row items-center justify-center" style={{ gap: 4, height: 64 }}>
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <Bar key={i} heights={heights} index={i} />
      ))}
    </View>
  );
}

const mmss = (ms: number) => {
  const t = Math.floor(ms / 1000);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

export function VoiceQuoteSheet({
  onCaptured,
  onClose,
}: {
  /** Fires with the recorded file's URI. The caller owns transcription. */
  onCaptured: (uri: string) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // HIGH_QUALITY alone does NOT enable metering — it has to be spread and the
  // flag added, or getStatus().metering stays undefined forever.
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const [elapsed, setElapsed] = useState(0);
  const [stopping, setStopping] = useState(false);
  const startedAt = useRef(Date.now());

  const heights = useSharedValue<number[]>(new Array(BAR_COUNT).fill(0));

  const haptic = (type: Haptics.ImpactFeedbackStyle) => {
    if (Platform.OS !== 'web') void Haptics.impactAsync(type);
  };

  // Start recording on mount — the sheet only opens because the user tapped
  // the mic, so making them tap again would be a wasted step.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const perm = await AudioModule.requestRecordingPermissionsAsync();
        if (!perm.granted) {
          toast.error('Microphone permission is needed to record');
          onClose();
          return;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        if (!alive) return;
        recorder.record();
        startedAt.current = Date.now();
        haptic(Haptics.ImpactFeedbackStyle.Medium);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not start recording');
        onClose();
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drive the bars off the real input level, and keep the elapsed timer.
  useEffect(() => {
    if (stopping) return;
    const id = setInterval(() => {
      const db = recorder.getStatus().metering;
      // metering is legitimately undefined until the first sample arrives.
      const level = db == null ? 0 : Math.max(0, Math.min(1, (db - DB_FLOOR) / -DB_FLOOR));
      // Shift left and append, so the trace scrolls like a chart recorder.
      // Assigned directly, not through withTiming: each bar is a past sample
      // and should hold its value — the motion is the shift, not a morph. (And
      // withTiming only animates numbers, not arrays.)
      heights.value = [...heights.value.slice(1), level];
      setElapsed(Date.now() - startedAt.current);
    }, METER_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopping, recorder]);

  const submit = async () => {
    if (stopping) return;
    setStopping(true);
    haptic(Haptics.ImpactFeedbackStyle.Light);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error('No audio captured');
      // Hand off and get out of the way — the form takes it from here.
      onCaptured(uri);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not finish recording');
      onClose();
    }
  };

  const cancel = async () => {
    setStopping(true);
    try {
      // Discard the audio — a cancelled recording is never uploaded.
      await recorder.stop();
    } catch {
      /* nothing useful to do if it was never started */
    }
    onClose();
  };

  return (
    <Modal visible transparent={false} animationType="slide" onRequestClose={cancel}>
      <View
        className="flex-1 bg-bg-deep px-6"
        style={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }}
      >
        <View className="flex-row justify-end">
          <Pressable onPress={cancel} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cancel">
            <Icon name="x" size={26} color={colors.muted} />
          </Pressable>
        </View>

        <View className="flex-1 items-center justify-center">
          <LiveWaveform heights={heights} />
          <Mono className="mt-6 text-callout text-accent" style={{ fontVariant: ['tabular-nums'] }}>
            {mmss(elapsed)}
          </Mono>

          <Txt className="mt-8 text-heading font-semibold text-fg">Listening</Txt>
          <Txt className="mt-2 text-center text-sub text-muted">
            Describe the job — route, load, when
          </Txt>
        </View>

        {/* Says what it does: ends the recording and sends it. */}
        <Button label="Submit" icon="check" loading={stopping} onPress={submit} fullWidth />
      </View>
    </Modal>
  );
}
