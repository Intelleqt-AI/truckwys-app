import { useRef, useState, useLayoutEffect } from 'react';
import { View, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { AmbientGlow, IconButton, Card, Button, Txt, Mono, Label, EmptyState } from '@/components/ui';
import { copilotChat, useProposals, executeProposal, dismissProposal } from './api';
import { str, pick } from '@/lib/api/list';
import { useTheme } from '@/theme/ThemeProvider';
import { toast } from '@/lib/toast';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'Copilot'>;
type Msg = { role: 'user' | 'assistant'; text: string };

export function CopilotScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { colors } = useTheme();
  const [messages, setMessages] = useState<Msg[]>([]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'AI Copilot',
      headerLargeTitle: false,
      headerTransparent: false,
      headerStyle: { backgroundColor: colors.bgDeep },
    });
  }, [navigation, colors.bgDeep]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const { data: proposals } = useProposals();

  const actProposal = async (id: string, execute: boolean) => {
    try {
      await (execute ? executeProposal(id) : dismissProposal(id));
      await qc.invalidateQueries({ queryKey: ['agent-proposals'] });
      toast.success(execute ? 'Proposal executed' : 'Dismissed');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    }
  };
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
    <View className="flex-1 bg-bg-deep">
      <AmbientGlow />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight}
      >
        <ScrollView
          ref={scroll}
          className="flex-1"
          contentContainerStyle={{ padding: 16, gap: 12 }}
          keyboardShouldPersistTaps="handled"
        >
          {!!proposals?.length && (
            <View className="gap-2.5">
              <Label className="text-faint">Proposals</Label>
              {proposals.map((p) => (
                <Card key={p.id} className="p-4">
                  <Mono className="text-body font-medium text-fg">{p.title}</Mono>
                  {p.body ? <Txt className="mt-1 text-sub text-muted">{p.body}</Txt> : null}
                  <View className="mt-3 flex-row gap-2.5">
                    <View className="flex-1">
                      <Button label="Execute" onPress={() => actProposal(p.id, true)} fullWidth />
                    </View>
                    <View className="flex-1">
                      <Button label="Dismiss" variant="secondary" onPress={() => actProposal(p.id, false)} fullWidth />
                    </View>
                  </View>
                </Card>
              ))}
            </View>
          )}
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
