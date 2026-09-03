import { useCallback } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Group, Mono, Label, Txt } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { HEAT_REVEAL } from './motion';

const COLS = 7;
const ROWS = 4;

// ── UtilisationCard: fleet utilisation heat grid, 7x4 (matches web's
// `.heatmap-grid { repeat(7, 1fr) }` — also reads as calendar weeks, unlike
// the previous 2x14 strip). Cells cascade in on a diagonal (row+col) delay.
export function UtilisationCard({
  activeVehicles,
  totalVehicles,
  activeLoads,
  heat,
}: {
  activeVehicles: number;
  totalVehicles: number;
  activeLoads: number;
  heat: number[];
}) {
  const { colors } = useTheme();
  const heatColor = useCallback(
    (v: number) =>
      ['rgba(77,158,255,0.12)', 'rgba(77,158,255,0.3)', 'rgba(77,158,255,0.6)', colors.accent][v] ??
      colors.line,
    [colors],
  );
  const available = totalVehicles - activeVehicles;

  return (
    <Group label="Fleet utilisation · 28 days">
      <View className="p-4">
        <View className="mb-3.5 flex-row items-end justify-between">
          <View>
            <Mono className="text-fg" style={{ fontSize: 24, fontWeight: '600' }}>
              {totalVehicles ? Math.round((activeVehicles / totalVehicles) * 100) : 0}%
            </Mono>
            <Txt className="mt-0.5 text-caption text-muted">
              {activeVehicles} of {totalVehicles} vehicles active
            </Txt>
          </View>
          <View className="items-end">
            <Label className="text-faint">Active loads</Label>
            <Mono className="text-accent" style={{ fontSize: 18, fontWeight: '600' }}>
              {activeLoads}
            </Mono>
          </View>
        </View>
        {Array.from({ length: ROWS }, (_, row) => (
          <View key={row} className={`flex-row gap-1 ${row < ROWS - 1 ? 'mb-1' : ''}`}>
            {heat.slice(row * COLS, row * COLS + COLS).map((v, col) => (
              <Animated.View
                key={col}
                entering={HEAT_REVEAL[(row + col) % HEAT_REVEAL.length]}
                className="flex-1 rounded-xs"
                // A fixed height, not aspectRatio: 1 — square cells across 7
                // narrow columns made each row ~45-50px tall (4 rows ≈
                // 180-200px), noticeably taller than the original 2-row grid.
                style={{ height: 14, backgroundColor: heatColor(v) }}
              />
            ))}
          </View>
        ))}
        {totalVehicles > 0 && (
          <Txt className="mt-3 text-caption text-faint">
            {available} vehicle{available === 1 ? '' : 's'} available
          </Txt>
        )}
      </View>
    </Group>
  );
}
