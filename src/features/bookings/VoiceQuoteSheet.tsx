import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Modal, Pressable, Platform } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import {
  useAudioRecorder,
  RecordingPresets,
  AudioModule,
  setAudioModeAsync,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt, Mono, Button, Icon } from '@/components/ui';
import { aiVoiceQuote } from './api';
import { str, pick } from '@/lib/api/list';
import { toast } from '@/lib/toast';
import { useTheme } from '@/theme/ThemeProvider';

// Full-screen voice capture, in the shape people already know from ChatGPT and
// Claude: one clear state at a time, a waveform that actually reacts to the
// voice, and an obvious way out.
//
// The bar this replaced showed a bare "Transcribing…" with a fake sine-wave
// animation, which left no way to tell "we're listening" from "we're thinking"
// from "we're filling the form".

const BAR_COUNT = 32;
// Poll rate for the input meter. getStatus() is a synchronous bridge call, so
// there's no point going much faster than this.
const METER_MS = 80;
// Metering is dBFS, floor -160. Speech sits around -30..-5, so normalising
// against -60 rather than -160 uses the full height of the bars instead of
// squashing every voice into the top few percent.
const DB_FLOOR = -60;

type Stage = 'listening' | 'transcribing' | 'thinking';

const STAGE_COPY: Record<Stage, { title: string; sub: string }> = {
  listening: { title: 'Listening', sub: 'Describe the job — route, load, when' },
  transcribing: { title: 'Transcribing', sub: 'Turning your words into text' },
  thinking: { title: 'Building your quote', sub: 'Filling in the details' },
};

function Bar({ heights, index }: { heights: SharedValue<number[]>; index: number }) {
  const { colors } = useTheme();
  const style = useAnimatedStyle(() => {
    'worklet';
    const v = heights.value[index] ?? 0;
    return { height: 4 + v * 56 };
  });
  return (
    <Animated.View
      style={[{ width: 4, borderRadius: 2, backgroundColor: colors.accent }, style]}
    />
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
  onTranscribed,
  onClose,
  /** True while the caller is running the AI extraction, so we can hold the
      sheet open on "Building your quote" instead of dumping the user back on
      the form next to a bare spinner. */
  thinking,
}: {
  onTranscribed: (text: string) => void;
  onClose: () => void;
  thinking?: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // HIGH_QUALITY alone does NOT enable metering — it has to be spread and the
  // flag added, or getStatus().metering stays undefined forever.
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const [stage, setStage] = useState<Stage>('listening');
  const [elapsed, setElapsed] = useState(0);
  const [transcript, setTranscript] = useState('');
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
    if (stage !== 'listening') return;
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
  }, [stage, recorder]);

  const finish = useCallback(async () => {
    haptic(Haptics.ImpactFeedbackStyle.Light);
    setStage('transcribing');
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error('No audio captured');
      const res = await aiVoiceQuote({ uri, name: 'quote.m4a', type: 'audio/m4a' });
      const text = str(pick(res, ['text', 'transcription'])).trim();
      if (!text) {
        toast.error("Didn't catch that — try again");
        onClose();
        return;
      }
      // Show what was heard before the form changes under them.
      setTranscript(text);
      setStage('thinking');
      onTranscribed(text);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not transcribe audio');
      onClose();
    }
  }, [recorder, onTranscribed, onClose]);

  // Once the caller's AI step finishes, the sheet's work is done. Wait until
  // we've actually seen `thinking` go true first — otherwise a render in which
  // the stage has advanced but the parent hasn't flipped its busy flag yet
  // would close the sheet immediately.
  const sawThinking = useRef(false);
  if (thinking) sawThinking.current = true;
  useEffect(() => {
    if (stage === 'thinking' && sawThinking.current && !thinking) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, thinking]);

  const cancel = async () => {
    try {
      // Discard the audio — a cancelled recording is never uploaded.
      if (stage === 'listening') await recorder.stop();
    } catch {
      /* nothing useful to do if it was never started */
    }
    onClose();
  };

  const copy = STAGE_COPY[stage];

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
          {stage === 'listening' ? (
            <>
              <LiveWaveform heights={heights} />
              <Mono className="mt-6 text-callout text-accent" style={{ fontVariant: ['tabular-nums'] }}>
                {mmss(elapsed)}
              </Mono>
            </>
          ) : (
            <View className="h-[64px] items-center justify-center">
              <Icon name="sparkle" size={34} color={colors.accent} />
            </View>
          )}

          <Txt className="mt-8 text-heading font-semibold text-fg">{copy.title}</Txt>
          <Txt className="mt-2 text-center text-sub text-muted">{copy.sub}</Txt>

          {!!transcript && (
            <View className="mt-7 w-full rounded-xs border border-line bg-surface p-4">
              <Mono className="mb-1.5 text-micro tracking-wide uppercase text-faint">Heard</Mono>
              <Txt className="text-callout text-fg">{transcript}</Txt>
            </View>
          )}
        </View>

        {stage === 'listening' ? (
          <Button label="Stop" icon="check" onPress={finish} fullWidth />
        ) : (
          <Button label="Cancel" variant="secondary" onPress={cancel} fullWidth />
        )}
      </View>
    </Modal>
  );
}
