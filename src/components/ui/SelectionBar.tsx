import { useState } from 'react';
import { View, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Mono } from './Text';
import { Icon } from './icons';
import { useTheme } from '@/theme/ThemeProvider';
import { status as statusHues } from '@/theme/tokens';

/**
 * The circular tick a row shows in selection mode — same shape the
 * VehicleTypesSection batch-delete rows already use (Settings screen), pulled
 * out here so Customers and Fleet can share it instead of re-inventing it.
 */
export function SelectionDot({ selected, disabled }: { selected: boolean; disabled?: boolean }) {
  const { colors } = useTheme();
  if (disabled) {
    return (
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          borderWidth: 1.5,
          borderColor: colors.faint,
          opacity: 0.35,
        }}
      />
    );
  }
  return selected ? (
    <Icon name="checkCircle" size={20} color={colors.accent} />
  ) : (
    <View
      style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.faint }}
    />
  );
}

/**
 * "Select all" + "Delete" as a pair of real, sharp-cornered `sm` buttons
 * (matching `Button`'s own `size="sm"` — `primitives.tsx`) that live in the
 * host's own header while selecting — Customers and Fleet both swap their
 * native/AppHeader for a contextual one and drop this pair in as
 * `headerRight`. No floating bar: the app's own 2px-radius language stays
 * consistent, and the tab bar never needs to get out of the way.
 *
 * Quotes, invoices, loads and trips PROTECT the records a fleet most wants to
 * clean up, so a partial result (some deleted, some kept with a reason) is
 * the normal case here, not an edge one — see core/views_bulk_delete.py —
 * which is why Delete confirms with a native destructive Alert rather than
 * firing immediately.
 */
export function SelectionActions({
  count,
  total,
  noun,
  nounPlural,
  onSelectAll,
  onConfirmDelete,
}: {
  count: number;
  /** Rows currently selectable (post search/filter) — lets "Select all" flip
   *  to "Deselect all" once everything's already ticked. Omit to leave
   *  select-all out entirely. */
  total?: number;
  noun: string;
  nounPlural: string;
  /** Selects (or clears) every row `total` counts — the host decides what
   *  "every row" means (typically the currently filtered list). */
  onSelectAll?: () => void;
  /** Performs the delete and reports its own result (Alert/toast) — this
   *  component only tracks busy state around it. */
  onConfirmDelete: () => Promise<void>;
}) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const label = count === 1 ? noun : nounPlural;
  const allSelected = !!total && count >= total;

  const confirm = () => {
    Alert.alert(`Delete ${count} ${label}?`, 'Records linked to quotes, invoices, loads or trips are kept instead.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await onConfirmDelete();
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <View className="flex-row items-center gap-2">
      {onSelectAll && (
        <TouchableOpacity
          onPress={onSelectAll}
          activeOpacity={0.85}
          accessibilityRole="button"
          className="min-h-[32px] flex-row items-center justify-center gap-1 rounded-control border border-line-active bg-surface px-2.5"
        >
          <Icon name="check" size={14} color={colors.fg} strokeWidth={2.2} />
          <Mono className="text-nano uppercase tracking-wide text-fg">
            {allSelected ? 'Deselect all' : 'Select all'}
          </Mono>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        onPress={confirm}
        disabled={count === 0 || busy}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${count} ${label}`}
        accessibilityState={{ disabled: count === 0 || busy }}
        className={`min-h-[32px] flex-row items-center justify-center gap-1 rounded-control border border-danger bg-danger-bg px-2.5 ${
          count === 0 ? 'opacity-40' : ''
        }`}
      >
        {busy ? (
          <ActivityIndicator size="small" color={statusHues.danger} />
        ) : (
          <>
            <Icon name="trash" size={14} color={statusHues.danger} strokeWidth={2.2} />
            <Mono className="text-nano uppercase tracking-wide text-danger">
              {count > 0 ? count : ''}
            </Mono>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}
