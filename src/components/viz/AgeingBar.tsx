import { View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

// ── AgeingBar: one customer's overdue balance, split by how late ────────────
// Segments are the Debtors age buckets past "Current" (1 to 30, 31 to 60, 61 to
// 90, over 90 days), in order from mildest to worst. A segment's width is its
// rand, so the bar says how much is owed and how old it is at a glance. `scale`
// (0 to 1) shortens the whole bar, which lets a list share one scale and rank by eye.
export function AgeingBar({ buckets, scale = 1 }: { buckets: number[]; scale?: number }) {
  const { colors } = useTheme();
  // Mild to severe: amber, strong amber, soft red, red.
  const fills = [
    { color: colors.warning, opacity: 0.45 },
    { color: colors.warning, opacity: 0.95 },
    { color: colors.danger, opacity: 0.6 },
    { color: colors.danger, opacity: 1 },
  ];
  const parts = buckets.slice(1).map((v, i) => ({ v, ...fills[i]! }));

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: `${Math.max(8, Math.min(1, scale) * 100)}%` }}
      className="h-[6px] flex-row gap-[2px] overflow-hidden rounded-full"
    >
      {parts.map((p, i) =>
        p.v > 0.005 ? (
          <View key={i} style={{ flex: p.v, backgroundColor: p.color, opacity: p.opacity }} />
        ) : null,
      )}
    </View>
  );
}
