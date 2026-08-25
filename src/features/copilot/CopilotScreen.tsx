import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { View, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { AmbientGlow, Mono, Icon, INPUT_TEXT } from '@/components/ui';
import { status as statusHues } from '@/theme/tokens';
import { resolveNotificationLink } from '@/lib/notificationLink';
import { invalidateFor } from '@/lib/queryInvalidation';
import { toast } from '@/lib/toast';
import { useTheme } from '@/theme/ThemeProvider';
import type { AppStackParamList } from '@/navigation/types';
import {
  CONVERSATIONS_KEY,
  adoptAfterTimeout,
  appendMessages,
  conversationKey,
  createConversation,
  deleteConversation,
  dismissProposal,
  executeProposal,
  isRateLimited,
  isTimeoutish,
  patchProposal,
  sendChat,
  statusFromError,
  useConversation,
  useConversations,
} from './api';
import { useCopilotStore } from './store';
import { MessageList } from './components/MessageList';
import { LiveTurn, type PendingTurn } from './components/LiveTurn';
import { Starters } from './components/Starters';
import { ConversationSheet } from './components/ConversationSheet';
import type { Msg, Proposal } from './types';

type Props = NativeStackScreenProps<AppStackParamList, 'Copilot'>;

let localSeq = 0;
const localKey = (role: string) => `local:${role}:${++localSeq}`;

export function CopilotScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const rootNav = useNavigation();

  const conversationId = useCopilotStore((s) => s.conversationId);
  const setConversationId = useCopilotStore((s) => s.setConversationId);
  const newChat = useCopilotStore((s) => s.newChat);

  const { data: conversations, isFetching: convosFetching } = useConversations();
  const { data: messages } = useConversation(conversationId);

  const [input, setInput] = useState('');
  const [pending, setPending] = useState<PendingTurn | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [proposalBusy, setProposalBusy] = useState(false);
  // State, not the ref below: the ref guards re-entrancy but can't drive a
  // re-render, so the button would never show its spinner or dim.
  const [sending, setSending] = useState(false);
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);

  // Compared after every await. A reply that belongs to a thread the user has
  // since left must be dropped — it's already persisted server-side and will be
  // there when they reopen it. Without this it lands in the wrong conversation.
  const activeConv = useRef<number | null>(conversationId);
  const inFlight = useRef(false);

  const transcript = messages ?? [];
  const isEmpty = transcript.length === 0 && !pending;

  // ── Header: new chat + history ─────────────────────────────────────────────
  const renderRight = useCallback(
    () => (
      <View className="flex-row items-center gap-1">
        <Pressable
          onPress={() => startNewChat()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="New chat"
          className="h-9 w-9 items-center justify-center active:opacity-50"
        >
          <Icon name="plus" size={21} color={colors.accent} strokeWidth={2} />
        </Pressable>
        <Pressable
          onPress={() => setHistoryOpen(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Conversation history"
          className="h-9 w-9 items-center justify-center active:opacity-50"
        >
          <Icon name="clock" size={20} color={colors.accent} strokeWidth={2} />
        </Pressable>
      </View>
    ),
    // startNewChat is stable enough for a header button; it only reads refs/setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colors.accent],
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'AI Copilot',
      // The keyboardVerticalOffset below is only correct because the header is
      // opaque and non-transparent here. Restoring the iOS large title would
      // double-count it and leave a gap above the keyboard.
      headerLargeTitle: false,
      headerTransparent: false,
      headerStyle: { backgroundColor: colors.bgDeep },
      headerRight: renderRight,
    });
  }, [navigation, colors.bgDeep, renderRight]);

  // ── Turn lifecycle ────────────────────────────────────────────────────────
  /** Move the finished live turn into the cached transcript. */
  const settle = useCallback(
    (convId: number, userText: string, reply: string, envelope: Partial<Msg>) => {
      appendMessages(qc, convId, [
        { key: localKey('user'), role: 'user', content: userText, actions: [], proposal: null },
        {
          key: localKey('assistant'),
          role: 'assistant',
          content: reply,
          actions: envelope.actions ?? [],
          proposal: envelope.proposal ?? null,
          ...(envelope.degraded ? { degraded: true } : {}),
        },
      ]);
      setPending(null);
      void qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
    },
    [qc],
  );

  const settleRef = useRef<(() => void) | null>(null);

  /**
   * Commit whatever the live turn is showing and clear it.
   *
   * Every interruption resolves to this — switching thread, sending again,
   * starting a new chat — because the full reply is already in state and the
   * reveal is only presentation. Nothing is ever stored half-typed.
   */
  const flushPending = useCallback(() => {
    settleRef.current?.();
    settleRef.current = null;
    setPending(null);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || inFlight.current) return;
      // A reveal may still be running from the previous turn; commit it rather
      // than overwriting the live slot and losing that reply.
      flushPending();
      setInput('');
      inFlight.current = true;
      setSending(true);
      setPending({ userText: message, status: 'sending' });

      let convId = conversationId;
      try {
        if (convId == null) {
          convId = await createConversation();
          // Seed the transcript as empty. Otherwise useConversation mounts with
          // no data, fires a GET for a conversation that has no messages yet, and
          // that late [] can land AFTER the optimistic write below and erase the
          // reply. With data present the query is fresh and doesn't fetch.
          qc.setQueryData<Msg[]>(conversationKey(convId), []);
          setConversationId(convId);
          activeConv.current = convId;
        }
        const res = await sendChat(convId, message);
        if (activeConv.current !== convId) return; // user switched threads
        setAiAvailable(res.aiAvailable);
        if (res.conversationId != null && res.conversationId !== convId) {
          convId = res.conversationId;
          setConversationId(convId);
          activeConv.current = convId;
        }
        const finalConv = convId;
        settleRef.current = () =>
          settle(finalConv, message, res.reply, {
            actions: res.actions,
            proposal: res.proposal,
            degraded: res.aiAvailable === false,
          });
        setPending({ userText: message, status: 'revealing', reply: res.reply });
      } catch (e) {
        if (activeConv.current !== convId) return;
        // A timeout is not a failure: the view persists the turn before it
        // builds the response, so the reply may well exist. Ask, don't guess.
        if (convId != null && isTimeoutish(e)) {
          const adopted = await adoptAfterTimeout(convId);
          if (adopted && activeConv.current === convId) {
            const finalConv = convId;
            settleRef.current = () =>
              settle(finalConv, message, adopted.content, {
                actions: adopted.actions,
                proposal: adopted.proposal,
              });
            setPending({ userText: message, status: 'revealing', reply: adopted.content });
            return;
          }
        }
        setPending({
          userText: message,
          status: 'error',
          error: isRateLimited(e)
            ? 'Too many questions in a row — give it a minute and try again.'
            : e instanceof Error
              ? e.message
              : 'Something went wrong reaching the copilot.',
        });
      } finally {
        inFlight.current = false;
        setSending(false);
      }
    },
    [conversationId, setConversationId, settle, flushPending, qc],
  );

  const onRevealDone = useCallback(() => {
    settleRef.current?.();
    settleRef.current = null;
  }, []);

  const startNewChat = useCallback(() => {
    flushPending();
    newChat();
    activeConv.current = null;
    setAiAvailable(null);
  }, [flushPending, newChat]);

  const openConversation = useCallback(
    (id: number) => {
      flushPending();
      setConversationId(id);
      activeConv.current = id;
      setAiAvailable(null);
    },
    [flushPending, setConversationId],
  );

  const removeConversation = useCallback(
    async (id: number) => {
      try {
        await deleteConversation(id);
        qc.removeQueries({ queryKey: conversationKey(id) });
        void qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
        if (id === conversationId) startNewChat();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not delete that conversation');
      }
    },
    [qc, conversationId, startNewChat],
  );

  // ── Proposals ─────────────────────────────────────────────────────────────
  const confirmProposal = useCallback(
    async (p: Proposal) => {
      if (proposalBusy || conversationId == null) return;
      setProposalBusy(true);
      const convId = conversationId;
      try {
        const outcome = await executeProposal(p.id);
        patchProposal(qc, convId, p.id, { status: outcome.status, result: outcome.result });
        if (outcome.status === 'executed') {
          appendMessages(qc, convId, [
            {
              key: localKey('assistant'),
              role: 'assistant',
              content: outcome.message ?? 'Done.',
              actions: outcome.action ? [outcome.action] : [],
              proposal: null,
            },
          ]);
          // An executed proposal writes real quotes/loads/invoices and doesn't
          // report which, so this invalidation is deliberately broad.
          invalidateFor(qc, 'copilot');
          void qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
        }
      } catch (e) {
        // 409 means it was already acted on — here or on another device. Show
        // what the server says it is, not "Failed".
        const known = statusFromError(e);
        patchProposal(qc, convId, p.id, {
          status: known ?? 'failed',
          ...(known
            ? {}
            : { result: { error: e instanceof Error ? e.message : 'That action failed.' } }),
        });
        if (known === 'executed') invalidateFor(qc, 'copilot');
      } finally {
        setProposalBusy(false);
      }
    },
    [proposalBusy, conversationId, qc],
  );

  const rejectProposal = useCallback(
    async (p: Proposal) => {
      if (proposalBusy || conversationId == null) return;
      setProposalBusy(true);
      const convId = conversationId;
      try {
        await dismissProposal(p.id);
        patchProposal(qc, convId, p.id, { status: 'dismissed' });
      } catch (e) {
        const known = statusFromError(e);
        // Only mark dismissed once the server confirms it; otherwise leave the
        // card confirmable rather than lying about its state.
        if (known) patchProposal(qc, convId, p.id, { status: known });
        else toast.error(e instanceof Error ? e.message : 'Could not dismiss that');
      } finally {
        setProposalBusy(false);
      }
    },
    [proposalBusy, conversationId, qc],
  );

  // ── Markdown / chip navigation ────────────────────────────────────────────
  const navigateWebPath = useCallback(
    (route: string) => {
      const target = resolveNotificationLink(route);
      if (!target) return;
      (rootNav.navigate as (screen: string, params?: Record<string, unknown>) => void)(
        target.screen,
        target.params,
      );
    },
    [rootNav],
  );

  const canSend = !!input.trim() && !sending;

  return (
    <View className="flex-1 bg-bg-deep">
      <AmbientGlow />
      <KeyboardAvoidingView
        className="flex-1"
        behavior="padding"
        keyboardVerticalOffset={headerHeight}
      >
        <MessageList
          messages={transcript}
          header={
            isEmpty ? (
              <Starters onPick={(prompt) => void send(prompt)} />
            ) : aiAvailable === false ? (
              <View className="mb-2 flex-row items-center gap-1.5">
                <Icon name="alert" size={12} color={statusHues.warning} />
                <Mono
                  className="text-micro uppercase tracking-wide"
                  style={{ color: statusHues.warning }}
                >
                  Rules engine
                </Mono>
              </View>
            ) : null
          }
          footer={
            pending ? (
              <LiveTurn
                turn={pending}
                onNavigate={navigateWebPath}
                onRevealDone={onRevealDone}
                onRetry={(text) => void send(text)}
              />
            ) : null
          }
          onNavigate={navigateWebPath}
          proposalBusy={proposalBusy}
          onConfirmProposal={(p) => void confirmProposal(p)}
          onDismissProposal={(p) => void rejectProposal(p)}
        />

        <View
          className="flex-row items-end gap-2 border-t border-line bg-bg-deep px-3 pt-2"
          style={{ paddingBottom: insets.bottom + 6 }}
        >
          <View className="min-h-[44px] flex-1 justify-center rounded-xs border border-line bg-surface px-3">
            <TextInput
              className="text-fg"
              placeholder="Ask about your operation…"
              placeholderTextColor={colors.faint}
              value={input}
              onChangeText={setInput}
              multiline
              // Enter inserts a newline instead of submitting: onSubmitEditing on
              // a multiline input is unreliable on Android, so sending is the
              // button's job only.
              submitBehavior="newline"
              // Without a cap a long paste grows the dock until it eats the
              // transcript.
              style={[INPUT_TEXT, { maxHeight: 120, paddingVertical: 10 }]}
              scrollEnabled
            />
          </View>
          <Pressable
            onPress={() => void send(input)}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Send"
            accessibilityState={{ disabled: !canSend }}
            className="h-11 w-11 items-center justify-center rounded-xs active:opacity-60"
            style={{ opacity: canSend ? 1 : 0.35 }}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Icon name="send" size={20} color={colors.accent} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {historyOpen && (
        <ConversationSheet
          conversations={conversations ?? []}
          loading={convosFetching}
          activeId={conversationId}
          onOpen={openConversation}
          onDelete={(id) => void removeConversation(id)}
          onNewChat={startNewChat}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </View>
  );
}
