import { View } from 'react-native';
import { Mono, Label, PressScale } from '@/components/ui';
import type { OverviewData } from './api';
import type { useAppNavigation } from '@/navigation/useAppNavigation';

type Stat = { label: string; value: string; onPress?: () => void; warn: boolean };

// ── CommandBar: the three operational stats (Active loads / Fleet ready /
// Advances pending), web parity for copy. Equal-width (`flex-1`) columns —
// not natural-width ones — so a long label wraps within its own column
// instead of pushing the row past the screen edge. The clock this used to
// carry moved into the header's date eyebrow (HomeScreen.tsx); a live clock
// side-by-side with three stat cells never fits a phone's width.
export function CommandBar({
  data,
  hasFleet,
  goTab,
  openMore,
}: {
  data: Pick<OverviewData, 'activeLoads' | 'activeVehicles' | 'totalVehicles' | 'advancesPending'>;
  hasFleet: boolean;
  goTab: ReturnType<typeof useAppNavigation>['goTab'];
  openMore: () => void;
}) {
  const stats: Stat[] = [
    {
      label: 'Active loads',
      value: String(data.activeLoads),
      onPress: () => goTab('Bookings', { tab: 'orders' }),
      warn: false,
    },
    // Fleet ready still reads fine for a driver; it just isn't tappable when
    // the Fleet tab is hidden for their role.
    {
      label: 'Fleet ready',
      value: `${data.activeVehicles}/${data.totalVehicles}`,
      onPress: hasFleet ? () => goTab('Fleet') : undefined,
      warn: false,
    },
    {
      label: 'Advances pending',
      value: String(data.advancesPending),
      onPress: openMore,
      warn: data.advancesPending > 0,
    },
  ];

  return (
    <View className="mb-5 flex-row rounded-xs border border-line bg-surface py-3">
      {stats.map((s, i) => (
        <PressScale
          key={s.label}
          onPress={s.onPress}
          disabled={!s.onPress}
          center
          className={`flex-1 ${i ? 'border-l border-line' : ''}`}
        >
          <Label className="mb-1 text-center text-faint" numberOfLines={2} style={{ fontSize: 9 }}>
            {s.label}
          </Label>
          <Mono
            className={s.warn ? 'text-warning' : 'text-fg'}
            style={{ fontSize: 20, fontWeight: '700' }}
          >
            {s.value}
          </Mono>
        </PressScale>
      ))}
    </View>
  );
}
