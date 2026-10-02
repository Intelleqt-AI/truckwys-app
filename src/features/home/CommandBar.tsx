import { View, TouchableOpacity } from 'react-native';
import { Card, Mono, Label, Txt, PressScale } from '@/components/ui';
import { Skeleton } from '@/components/feedback';

// One stat in the bar. Each cell has its own source, so one can fail or still be
// loading while the other shows: a failed cell says so and offers a Retry, never
// a zero.
export type CommandCell =
  | { state: 'loading' }
  | { state: 'error'; onRetry: () => void }
  | {
      state: 'ready';
      value: string;
      /** A second line under the figure, e.g. "+3 not closed". */
      note?: string;
      /** Note tone: warn for loads left open. */
      warn?: boolean;
      onPress?: () => void;
    };

// ── CommandBar: the two operational stats (Active loads / Fleet ready).
// Equal-width (`flex-1`) columns — not natural-width ones — so a long label wraps
// within its own column instead of pushing the row past the screen edge. "Advances
// pending" is not here: Fast Pay is not live, so there are no advances to count.
export function CommandBar({ activeLoads, fleetReady }: { activeLoads: CommandCell; fleetReady: CommandCell }) {
  const stats: { label: string; cell: CommandCell }[] = [
    { label: 'Active loads', cell: activeLoads },
    { label: 'Fleet ready', cell: fleetReady },
  ];

  return (
    <Card className="mb-5 flex-row py-3">
      {stats.map((s, i) => {
        const cell = s.cell;
        const body =
          cell.state === 'loading' ? (
            <View className="items-center py-0.5">
              <Skeleton width={44} height={24} />
            </View>
          ) : cell.state === 'error' ? (
            <View className="items-center gap-1">
              <Txt className="text-center text-caption text-muted">{"Couldn't load"}</Txt>
              <TouchableOpacity
                onPress={cell.onRetry}
                activeOpacity={0.7}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Retry loading ${s.label.toLowerCase()}`}
              >
                <Mono className="text-caption font-medium text-link">Retry</Mono>
              </TouchableOpacity>
            </View>
          ) : (
            <View className="items-center">
              <Mono className="text-title font-semibold text-fg">
                {cell.value}
              </Mono>
              {cell.note && (
                <Mono className={`mt-0.5 text-caption ${cell.warn ? 'text-warning' : 'text-faint'}`}>
                  {cell.note}
                </Mono>
              )}
            </View>
          );

        return (
          <PressScale
            key={s.label}
            onPress={cell.state === 'ready' ? cell.onPress : undefined}
            disabled={cell.state !== 'ready' || !cell.onPress}
            center
            className={`flex-1 ${i ? 'border-l border-line' : ''}`}
          >
            <Label className="mb-1 text-center text-faint" numberOfLines={2}>
              {s.label}
            </Label>
            {body}
          </PressScale>
        );
      })}
    </Card>
  );
}
