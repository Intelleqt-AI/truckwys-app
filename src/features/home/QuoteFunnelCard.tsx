import { View, TouchableOpacity } from 'react-native';
import { Group, Mono, Txt } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { formatNumber } from '@/lib/formatters';
import type { QuoteFunnel } from './derive';

// ── QuoteFunnelCard: where quotes stand. Draft, Sent, Accepted, Booked, On the
// road, Declined and (only when there is one) Expired, each a bar against the
// largest stage, then the single win-rate figure. Stage rules and the counting
// are in derive.ts computeFunnel (the web's QuoteConversion + pipeline): expired
// quotes are never live Draft or Sent, and in-transit loads left open are said
// under "On the road", not counted in it. Accepted wears the accent.
export function QuoteFunnelCard({
  funnel,
  total,
  onViewAll,
  onNewQuote,
}: {
  funnel: QuoteFunnel;
  total: number;
  onViewAll?: () => void;
  onNewQuote?: () => void;
}) {
  const { colors } = useTheme();

  if (total === 0) {
    return (
      <Group label="Quote pipeline">
        <View className="items-center gap-3 p-4">
          <Txt className="text-center text-caption text-faint">No quotes yet</Txt>
          {onNewQuote && (
            <TouchableOpacity
              onPress={onNewQuote}
              activeOpacity={0.7}
              accessibilityRole="button"
              className="min-h-[44px] justify-center rounded-control border border-line-active px-4"
            >
              <Mono className="text-caption font-medium text-fg">New quote</Mono>
            </TouchableOpacity>
          )}
        </View>
      </Group>
    );
  }

  const max = Math.max(1, ...funnel.stages.map((s) => s.count));

  return (
    <Group label="Quote pipeline" action={onViewAll ? 'View all' : undefined} onAction={onViewAll}>
      <View className="p-3.5">
        {funnel.stages.map((s, i) => (
          <View key={s.key} className={i === 0 ? '' : 'mt-3'}>
            <View className="flex-row items-center gap-3">
              <View style={{ width: 96 }}>
                <Txt className="text-callout text-fg" numberOfLines={1}>
                  {s.label}
                </Txt>
              </View>
              <View className="h-2 flex-1 overflow-hidden rounded-pill bg-surface-hover">
                <View
                  style={{
                    height: 8,
                    width: s.count === 0 ? 0 : `${Math.max((s.count / max) * 100, 2)}%`,
                    borderRadius: 4,
                    backgroundColor: s.key === 'accepted' ? colors.accent : colors.chartMuted,
                  }}
                />
              </View>
              <Mono
                className="text-right text-callout font-semibold text-fg"
                style={{ width: 36 }}
              >
                {formatNumber(s.count)}
              </Mono>
            </View>
            {(s.sub || s.note) && (
              <Txt className="mt-0.5 text-caption text-faint" style={{ marginLeft: 108 }}>
                {s.note ?? s.sub}
              </Txt>
            )}
          </View>
        ))}

        <View className="mt-3.5 border-t border-line pt-3">
          {funnel.winRate != null ? (
            <View className="flex-row items-baseline gap-2">
              <Mono className="text-title font-semibold text-fg">{`${funnel.winRate}%`}</Mono>
              <Txt className="flex-1 text-caption text-muted">
                {`win rate: ${funnel.accepted} of ${funnel.sentEver} quotes sent were accepted`}
              </Txt>
            </View>
          ) : (
            <Txt className="text-caption text-muted">Win rate shows once a quote has been sent.</Txt>
          )}
          <Txt className="mt-1 text-caption text-faint">{`All ${formatNumber(total)} ${total === 1 ? 'quote' : 'quotes'}.`}</Txt>
        </View>
      </View>
    </Group>
  );
}
