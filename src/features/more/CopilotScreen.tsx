import { useRef, useState } from 'react';
import { View, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AmbientGlow, IconButton, Txt, Label, EmptyState } from '@/components/ui';
import { copilotChat } from './api';
import { str, pick } from '@/lib/api/list';
import { useTheme } from '@/theme/ThemeProvider';
import { toast } from '@/lib/toast';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'Copilot'>;
type Msg = { role: 'user' | 'assistant'; text: string };

export function CopilotScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const scroll = useRef<ScrollView>(null);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text }]);
    setBusy(true);
    try {
      const res = await copilotChat(text, conversationId);
      const reply = str(pick(res, ['reply', 'message', 'response', 'content']), 'Done.');
      const cid = pick(res, ['conversation_id', 'conversation', 'id']);
      if (cid) setConversationId(String(cid));
      setMessages((m) => [...m, { role: 'assistant', text: reply }]);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Copilot unavailable');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-1 bg-bg-deep" style={{ paddingTop: insets.top }}>
      <AmbientGlow />
      <View className="flex-row items-center gap-1 px-2 pt-1">
        <IconButton name="chevronLeft" accessibilityLabel="Back" onPress={() => navigation.goBack()} />
        <Txt className="text-heading font-semibold text-fg">AI Copilot</Txt>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 8}
      >
        <ScrollView
          ref={scroll}
          className="flex-1"
          contentContainerStyle={{ padding: 16, gap: 12 }}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 ? (
            <View className="mt-16">
              <EmptyState
                icon="sparkle"
                title="Ask the Copilot"
                body="Ask about quotes, loads, fleet health, cashflow or anything in your operation."
              />
            </View>
          ) : (
            messages.map((m, i) => (
              <View
                key={i}
                className={`max-w-[86%] rounded-md px-3.5 py-2.5 ${
                  m.role === 'user' ? 'self-end bg-accent' : 'self-start border border-line bg-surface'
                }`}
              >
                <Txt className={m.role === 'user' ? 'text-callout text-on-accent' : 'text-callout text-fg'}>
                  {m.text}
                </Txt>
              </View>
            ))
          )}
          {busy && <Label className="self-start text-faint">Thinking…</Label>}
        </ScrollView>

        <View
          className="flex-row items-center gap-2 border-t border-line bg-bg-deep px-3 pt-2"
          style={{ paddingBottom: insets.bottom + 6 }}
        >
          <View className="min-h-[44px] flex-1 justify-center rounded-xs border border-line bg-surface px-3">
            <TextInput
              className="text-body text-fg"
              placeholder="Message Copilot…"
              placeholderTextColor={colors.faint}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={send}
              returnKeyType="send"
              multiline
            />
          </View>
          <IconButton name="send" accessibilityLabel="Send" color={colors.accent} onPress={send} />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
