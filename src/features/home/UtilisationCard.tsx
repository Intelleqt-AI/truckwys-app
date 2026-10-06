import { useCallback } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Group, Mono, Label, Txt } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { formatNumber } from '@/lib/formatters';
import { useReveal } from './motion';

const COLS = 7;
const ROWS = 4;

// ── UtilisationCard: loads booked per day for the last 28 days, as a 7x4 heat
// grid (reads as calendar weeks; matches the web's 28-day bars). Cells cascade in
// on a diagonal (row+col) delay. Figures (derive.ts):
//   booked    loads created in the last 28 days (the grid's total)
//   active    open loads that are not stale: not past delivery date, open <= 30 days
//   notClosed open loads that are: said beside the figure, never in it
//   available vehicles with status Available, of every vehicle
export function UtilisationCard({
  booked28,
  activeLoads,
  notClosed,
  heat,
  availableVehicles,
  totalVehicles,
}: {
  booked28: number;
  activeLoads: number;
  notClosed: number;
  heat: number[];
  availableVehicles: number;
  totalVehicles: number;
}) {
  const { colors } = useTheme();
  const reveal = useReveal();
  // v is 0..3 (derive.ts); spread across the 6-step theme ramp, 0 = empty cell.
  const heatColor = useCallback(
    (v: number) => colors.heat[[0, 2, 3, 5][v] ?? 0] ?? colors.line,
    [colors],
  );

  return (
    <Group label="Loads booked · last 28 days">
      <View className="p-3.5">
        <View className="mb-3.5 flex-row items-end justify-between">
          <View>
            <Mono className="text-title font-semibold text-fg">
              {formatNumber(booked28)}
            </Mono>
            <Txt className="mt-0.5 text-caption text-muted">
              {booked28 === 0 ? 'None booked in the last 28 days' : 'booked in the last 28 days'}
            </Txt>
          </View>
          <View className="items-end">
            <Label className="text-faint">Active loads</Label>
            <Mono className="text-title font-semibold text-fg">
              {formatNumber(activeLoads)}
            </Mono>
            {notClosed > 0 && (
              <Mono className="text-caption text-warning">{`+${formatNumber(notClosed)} not closed`}</Mono>
            )}
          </View>
        </View>
        {Array.from({ length: ROWS }, (_, row) => (
          <View key={row} className={`flex-row gap-1 ${row < ROWS - 1 ? 'mb-1' : ''}`}>
            {heat.slice(row * COLS, row * COLS + COLS).map((v, col) => (
              <Animated.View
                key={col}
                entering={reveal.heat(row + col)}
                className="flex-1 rounded-xs"
                // A fixed height, not aspectRatio: 1 — square cells across 7
                // narrow columns made each row ~45-50px tall (4 rows ≈
                // 180-200px), noticeably taller than the original 2-row grid.
                style={{ height: 11, backgroundColor: heatColor(v) }}
              />
            ))}
          </View>
        ))}
        <Txt className="mt-2.5 text-caption text-faint">
          {totalVehicles > 0
            ? `${formatNumber(availableVehicles)} of ${formatNumber(totalVehicles)} vehicles available now`
            : 'No vehicles added yet'}
        </Txt>
      </View>
    </Group>
  );
}
