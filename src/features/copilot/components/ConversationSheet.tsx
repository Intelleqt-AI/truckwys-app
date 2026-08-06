import { View, Modal, Pressable, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt, Mono, Label, Icon, EmptyState } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import type { ConversationSummary } from '../types';

// Past conversations.
//
// A plain RN Modal, matching features/bookings/AssignSheet.tsx, rather than
// @gorhom/bottom-sheet — that package is a dependency but is used nowhere in
// src/, and introducing a second sheet idiom for one screen isn't worth it.
//
// There is no rename: the backend has no PATCH route for a conversation and
// titles are generated server-side from the first message.

/** "now" / "5m" / "3h" / "2d", matching the web sidebar's relTime. */
function relTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const secs = Math.floor((Date.now() - t) / 1000);
  if (secs < 60) return 'now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

export function ConversationSheet({
  conversations,
  loading,
  activeId,
  onOpen,
  onDelete,
  onNewChat,
  onClose,
}: {
  conversations: ConversationSummary[];
  loading?: boolean;
  activeId: number | null;
  onOpen: (id: number) => void;
  onDelete: (id: number) => void;
  onNewChat: () => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const confirmDelete = (c: ConversationSummary) =>
    Alert.alert('Delete conversation?', `"${c.title}" will be removed for good.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(c.id) },
    ]);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 justify-end bg-black/60">
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="max-h-[76%] rounded-t-lg border-t border-line bg-bg-deep"
          style={{ paddingBottom: insets.bottom + 8 }}
        >
          <View className="flex-row items-center justify-between border-b border-line px-4 py-3">
            <Txt className="text-heading font-semibold text-fg">Conversations</Txt>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <Icon name="x" size={22} color={colors.muted} />
            </Pressable>
          </View>

          <Pressable
            onPress={() => {
              onNewChat();
              onClose();
            }}
            accessibilityRole="button"
            className="m-4 flex-row items-center justify-center gap-2 rounded-xs bg-accent py-3 active:opacity-70"
          >
            <Icon name="plus" size={16} color={colors.onAccent} />
            <Mono className="text-micro tracking-wide uppercase text-on-accent">New chat</Mono>
          </Pressable>

          {loading && !conversations.length ? (
            <View className="items-center py-10">
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : conversations.length === 0 ? (
            <View className="px-4 pb-6">
              <EmptyState
                icon="sparkle"
                title="No conversations yet"
                body="Ask the Copilot something and it will be saved here."
              />
            </View>
          ) : (
            <ScrollView className="px-4" contentContainerStyle={{ paddingBottom: 12, gap: 8 }}>
              <Label className="text-faint">History</Label>
              {conversations.map((c) => {
                const active = c.id === activeId;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => {
                      onOpen(c.id);
                      onClose();
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    className="flex-row items-center gap-3 rounded-xs border bg-surface px-3.5 py-3 active:opacity-70"
                    style={{
                      borderColor: active ? colors.accent : colors.line,
                      borderLeftWidth: active ? 2 : 1,
                    }}
                  >
                    <View className="flex-1">
                      <Txt numberOfLines={1} className="text-callout text-fg">
                        {c.title}
                      </Txt>
                      <Mono className="mt-0.5 text-micro text-faint">
                        {c.messageCount} msgs · {relTime(c.updatedAt)}
                      </Mono>
                    </View>
                    <Pressable
                      hitSlop={10}
                      onPress={(e) => {
                        e.stopPropagation();
                        confirmDelete(c);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${c.title}`}
                    >
                      <Icon name="x" size={17} color={colors.faint} />
                    </Pressable>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
