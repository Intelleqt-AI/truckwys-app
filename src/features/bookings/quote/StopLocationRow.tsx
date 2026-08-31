import { memo } from 'react';
import { View, Pressable } from 'react-native';
import { Icon } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { LocationField } from './LocationField';
import type { Loc, StopEntry } from './types';

/**
 * One stop row: its LocationField plus the reorder/remove chevrons that sit
 * next to the label. Extracted out of the `stops.map(...)` in
 * CreateQuoteScreen.tsx (Phase 1 perf pass) — before this, `onChange`,
 * `onPickOnMap` and the whole `headerRight` element were fresh closures
 * allocated per stop on every screen render, which defeated memoizing
 * LocationField. Memoized here; re-renders only when this row's own props
 * change.
 */
function StopLocationRowImpl({
  stop,
  index,
  isFirst,
  isLast,
  updateStop,
  moveStop,
  removeStop,
  beginPick,
}: {
  stop: StopEntry;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  updateStop: (id: string, loc: Loc) => void;
  moveStop: (id: string, dir: -1 | 1) => void;
  removeStop: (id: string) => void;
  beginPick: (target: { stop: string }) => void;
}) {
  const { colors } = useTheme();
  return (
    <LocationField
      label={`Stop ${index + 1}`}
      value={stop.loc}
      onChange={(l) => updateStop(stop.id, l)}
      placeholder="Search stop"
      onPickOnMap={() => beginPick({ stop: stop.id })}
      headerRight={
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => moveStop(stop.id, -1)}
            disabled={isFirst}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={`Move stop ${index + 1} up`}
            accessibilityState={{ disabled: isFirst }}
          >
            <Icon name="chevronUp" size={16} color={isFirst ? colors.faint : colors.muted} />
          </Pressable>
          <Pressable
            onPress={() => moveStop(stop.id, 1)}
            disabled={isLast}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={`Move stop ${index + 1} down`}
            accessibilityState={{ disabled: isLast }}
          >
            <Icon name="chevronDown" size={16} color={isLast ? colors.faint : colors.muted} />
          </Pressable>
          <Pressable
            onPress={() => removeStop(stop.id)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={`Remove stop ${index + 1}`}
          >
            <Icon name="x" size={16} color={colors.faint} />
          </Pressable>
        </View>
      }
    />
  );
}

export const StopLocationRow = memo(StopLocationRowImpl);
