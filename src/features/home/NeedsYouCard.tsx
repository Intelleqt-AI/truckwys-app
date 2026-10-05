import { View, TouchableOpacity } from 'react-native';
import { Card, Icon, Mono, Txt, type IconName } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import type { NeedsRow } from './signals';

const MAX_ROWS = 5;

const ICON: Record<NeedsRow['kind'], IconName> = {
  invoice: 'file',
  fleet: 'truck',
  other: 'alert',
};

// ── NeedsYouCard: the things that want a decision today (overdue invoices, loads
// left open, idle trucks, the backend's other signals). Rows are built in
// signals.ts buildNeeds; this only draws them. A row opens where its action goes
// (`onOpen`), and shows no action when the role cannot reach that screen. Renders
// nothing when there is nothing to show; a list that failed to build still shows
// its retry notes, so a failure never reads as "all clear".
export function NeedsYouCard({
  rows,
  canOpen,
  onOpen,
  notes,
}: {
  rows: NeedsRow[];
  /** Whether this role can reach a row's destination. */
  canOpen: (row: NeedsRow) => boolean;
  onOpen: (row: NeedsRow) => void;
  /** Parts of the list that could not be built, each with a retry. */
  notes?: { text: string; onRetry: () => void }[];
}) {
  const { colors } = useTheme();
  const shown = rows.slice(0, MAX_ROWS);

  if (shown.length === 0 && !notes?.length) return null;

  return (
    <View className="mb-5">
      <View className="mb-2.5 flex-row items-center justify-between">
        <Mono className="text-sub font-medium text-faint">Needs you</Mono>
        {rows.length > 0 && (
          <Mono className="text-caption text-muted">
            {rows.length > MAX_ROWS ? `${MAX_ROWS} of ${rows.length}` : rows.length}
          </Mono>
        )}
      </View>
      <Card>
        {shown.length === 0 ? (
          <View className="items-center p-4">
            <Txt className="text-center text-caption text-faint">Nothing to show from what loaded.</Txt>
          </View>
        ) : (
          shown.map((row, i) => {
            const actionable = !!row.target && canOpen(row);
            const content = (
              <View
                className={`min-h-[56px] flex-row items-center gap-3 px-4 py-3 ${
                  i === shown.length - 1 && !(notes && notes.length) ? '' : 'border-b border-line-row'
                }`}
              >
                <Icon name={ICON[row.kind]} size={18} color={colors.muted} />
                <View className="flex-1">
                  <Txt className="text-body text-fg" numberOfLines={1}>
                    {row.title}
                  </Txt>
                  {!!row.detail && (
                    <Txt className="mt-0.5 text-caption text-muted" numberOfLines={2}>
                      {row.detail}
                    </Txt>
                  )}
                </View>
                {!!row.amount && (
                  <Mono className="text-callout font-semibold text-fg">{row.amount}</Mono>
                )}
                {actionable && row.actionLabel && (
                  <View className="min-h-[36px] justify-center rounded-control border border-line-active px-2.5">
                    <Mono className="text-caption font-medium text-fg">{row.actionLabel}</Mono>
                  </View>
                )}
              </View>
            );
            return actionable ? (
              <TouchableOpacity
                key={i}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${row.actionLabel ?? 'Open'}: ${row.title}`}
                onPress={() => onOpen(row)}
              >
                {content}
              </TouchableOpacity>
            ) : (
              <View key={i}>{content}</View>
            );
          })
        )}
        {notes?.map((n) => (
          <View key={n.text} className="flex-row items-center gap-3 px-4 py-3">
            <Icon name="alert" size={16} color={colors.faint} />
            <Txt className="flex-1 text-caption text-muted">{n.text}</Txt>
            <TouchableOpacity
              onPress={n.onRetry}
              activeOpacity={0.7}
              hitSlop={8}
              accessibilityRole="button"
              className="min-h-[32px] justify-center px-1"
            >
              <Mono className="text-caption font-medium text-link">Retry</Mono>
            </TouchableOpacity>
          </View>
        ))}
      </Card>
    </View>
  );
}
