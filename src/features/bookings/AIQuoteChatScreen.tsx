import { useRef, useState, useLayoutEffect } from 'react';
import { View, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import {
  useAudioRecorder,
  RecordingPresets,
  AudioModule,
  setAudioModeAsync,
} from 'expo-audio';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AmbientGlow, IconButton, Button, Txt, Label, Group, DetailRow, EmptyState } from '@/components/ui';
import { aiChatQuote, aiVoiceQuote } from './api';
import { str, pick } from '@/lib/api/list';
import { useTheme } from '@/theme/ThemeProvider';
import { toast } from '@/lib/toast';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'AIQuoteChat'>;
type Msg = { role: 'user' | 'assistant'; text: string };
type Fields = Record<string, unknown>;

export function AIQuoteChatScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { colors } = useTheme();
  const [messages, setMessages] = useState<Msg[]>([]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'AI quote',
      headerLargeTitle: false,
      headerTransparent: false,
      headerStyle: { backgroundColor: colors.bgDeep },
    });
  }, [navigation, colors.bgDeep]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Fields>({});
  const [recording, setRecording] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const scroll = useRef<ScrollView>(null);

  const push = (m: Msg) => setMessages((prev) => [...prev, m]);
  const scrollDown = () => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);

  const sendText = async (text: string) => {
    if (!text.trim() || busy) return;
    push({ role: 'user', text });
    setInput('');
    setBusy(true);
    scrollDown();
    try {
      const res = await aiChatQuote(text, messages, preview);
      const reply = str(pick(res, ['reply', 'message', 'response']), 'Got it.');
      const extracted = (pick(res, ['extracted_fields']) ?? {}) as Fields;
      setPreview((p) => ({ ...p, ...extracted }));
      push({ role: 'assistant', text: reply });
      scrollDown();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI unavailable');
    } finally {
      setBusy(false);
    }
  };

  const toggleRecord = async () => {
    if (recording) {
      setRecording(false);
      setBusy(true);
      try {
        await recorder.stop();
        const uri = recorder.uri;
        if (!uri) throw new Error('No recording');
        const res = await aiVoiceQuote({ uri, name: 'quote.m4a', type: 'audio/m4a' });
        const text = str(pick(res, ['text', 'transcription']));
        if (text) await sendText(text);
        else toast.info('Could not transcribe audio');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Voice failed');
      } finally {
        setBusy(false);
      }
      return;
    }
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) return toast.error('Microphone permission denied');
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecording(true);
  };

  const canCreate = !!(pick(preview, ['pickup_location']) && pick(preview, ['delivery_location']));

  const createFromPreview = () =>
    navigation.replace('CreateQuote', {
      ai: true,
      prefill: {
        cargo_description: str(pick(preview, ['cargo_description'])),
        weight: str(pick(preview, ['weight'])),
      },
    });

  return (
    <View className="flex-1 bg-bg-deep">
      <AmbientGlow />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight}
      >
        <ScrollView ref={scroll} className="flex-1" contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
          {messages.length === 0 ? (
            <View className="mt-10">
              <EmptyState
                icon="sparkle"
                title="Describe your load"
                body="e.g. “20t steel, Johannesburg to Cape Town, flatbed, Tuesday” — or tap the mic."
              />
            </View>
          ) : (
            messages.map((m, i) => (
              <View
                key={i}
                className={`max-w-[86%] rounded-md px-3.5 py-2.5 ${m.role === 'user' ? 'self-end bg-accent' : 'self-start border border-line bg-surface'}`}
              >
                <Txt className={m.role === 'user' ? 'text-callout text-on-accent' : 'text-callout text-fg'}>{m.text}</Txt>
              </View>
            ))
          )}
          {busy && <Label className="self-start text-faint">Thinking…</Label>}

          {Boolean(pick(preview, ['pickup_location']) || pick(preview, ['delivery_location'])) && (
            <Group label="Quote preview">
              <DetailRow label="Pickup" value={str(pick(preview, ['pickup_location']), '—')} mono={false} />
              <DetailRow label="Drop-off" value={str(pick(preview, ['delivery_location']), '—')} mono={false} />
              <DetailRow label="Cargo" value={str(pick(preview, ['cargo_description']), '—')} mono={false} />
              <DetailRow label="Weight" value={str(pick(preview, ['weight']), '—')} />
              <DetailRow label="Vehicle" value={str(pick(preview, ['vehicle_type']), '—')} mono={false} last />
            </Group>
          )}
          {canCreate && <Button label="Create this quote" icon="arrowRight" onPress={createFromPreview} fullWidth />}
        </ScrollView>

        <View className="flex-row items-center gap-2 border-t border-line bg-bg-deep px-3 pt-2" style={{ paddingBottom: insets.bottom + 6 }}>
          <IconButton
            name={recording ? 'x' : 'phone'}
            accessibilityLabel={recording ? 'Stop recording' : 'Record voice'}
            color={recording ? '#FF4949' : colors.accent}
            onPress={toggleRecord}
          />
          <View className="min-h-[44px] flex-1 justify-center rounded-xs border border-line bg-surface px-3">
            <TextInput
              className="text-body text-fg"
              placeholder={recording ? 'Recording…' : 'Describe your load…'}
              placeholderTextColor={colors.faint}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => sendText(input)}
              editable={!recording}
              returnKeyType="send"
              multiline
            />
          </View>
          <IconButton name="send" accessibilityLabel="Send" color={colors.accent} onPress={() => sendText(input)} />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
