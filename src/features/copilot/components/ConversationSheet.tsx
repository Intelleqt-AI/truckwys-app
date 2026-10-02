import { View, Modal, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt, Mono, Label, Icon, EmptyState, Button } from '@/components/ui';
import { ListSkeleton } from '@/components/feedback';
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
    Alert.alert('Delete this conversation?', `"${c.title}" and its messages will be removed. This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(c.id) },
    ]);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
        className="flex-1 justify-end bg-backdrop"
      >
        {/* Swallows taps on the sheet so only the backdrop dismisses. */}
        <TouchableOpacity
          activeOpacity={1}
          accessible={false}
          onPress={() => {}}
          className="max-h-[76%] rounded-t-panel border-t border-line bg-elevated"
          style={{ paddingBottom: insets.bottom + 8, boxShadow: colors.shadowPop }}
        >
          <View className="flex-row items-center justify-between border-b border-line px-4 py-3">
            <Txt className="text-heading font-semibold text-fg">Conversations</Txt>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={12}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Icon name="x" size={22} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <View className="m-4">
            <Button
              label="New chat"
              icon="plus"
              fullWidth
              onPress={() => {
                onNewChat();
                onClose();
              }}
            />
          </View>

          {loading && !conversations.length ? (
            <View className="px-4 pb-4">
              <ListSkeleton rows={3} />
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
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => {
                      onOpen(c.id);
                      onClose();
                    }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    className={`flex-row items-center gap-3 rounded-card border px-3.5 py-3 ${
                      active ? 'border-line-strong bg-raised' : 'border-line bg-surface'
                    }`}
                  >
                    <View className="flex-1">
                      <Txt numberOfLines={1} className="text-callout text-fg">
                        {c.title}
                      </Txt>
                      <Mono className="mt-0.5 text-caption text-faint">
                        {c.messageCount} messages · {relTime(c.updatedAt)}
                      </Mono>
                    </View>
                    <TouchableOpacity
                      hitSlop={14}
                      activeOpacity={0.6}
                      onPress={() => confirmDelete(c)}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${c.title}`}
                    >
                      <Icon name="x" size={17} color={colors.faint} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
