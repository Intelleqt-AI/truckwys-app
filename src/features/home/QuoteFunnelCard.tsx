import { View, TouchableOpacity } from 'react-native';
import { Group, Mono, Txt } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { formatNumber } from '@/lib/formatters';
import type { QuoteFunnel } from './derive';

// ── QuoteFunnelCard: how far quotes get. Quoted → Sent → Accepted → Booked → On
// the road → Delivered, each a bar against the first stage. Stage rules and the
// counting are in derive.ts computeFunnel (the web's QuoteConversion + pipeline):
// expired quotes are never live Draft or Sent, and in-transit loads left open are
// said under "On the road", not counted in it. The last stage wears the accent.
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
              className="min-h-[40px] justify-center rounded-control border border-line-active px-4"
            >
              <Mono className="text-caption font-medium text-fg">New quote</Mono>
            </TouchableOpacity>
          )}
        </View>
      </Group>
    );
  }

  const first = Math.max(1, funnel.stages[0]?.count ?? 0);
  const lastIndex = funnel.stages.length - 1;
  const waiting: string[] = [
    funnel.awaiting > 0 ? `${funnel.awaiting} awaiting a reply` : '',
    funnel.drafts > 0 ? `${funnel.drafts} ${funnel.drafts === 1 ? 'draft' : 'drafts'}` : '',
    funnel.declined > 0 ? `${funnel.declined} declined` : '',
    funnel.expired > 0 ? `${funnel.expired} expired` : '',
  ].filter(Boolean);

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
                    width: s.count === 0 ? 0 : `${Math.max((s.count / first) * 100, 2)}%`,
                    borderRadius: 4,
                    backgroundColor: i === lastIndex ? colors.accent : colors.chartMuted,
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
              <Txt className="mt-0.5 text-micro text-faint" style={{ marginLeft: 108 }}>
                {s.note ?? s.sub}
              </Txt>
            )}
          </View>
        ))}

        <View className="mt-3.5 gap-1 border-t border-line pt-3">
          <Txt className="text-caption text-muted">
            {funnel.winRate != null
              ? `Win rate ${funnel.winRate}%: ${funnel.accepted} of ${funnel.sentEver} quotes sent were accepted.`
              : 'Win rate shows once a quote has been sent.'}
          </Txt>
          {waiting.length > 0 && (
            <Txt className="text-caption text-faint">{`Other quotes: ${waiting.join(', ')}.`}</Txt>
          )}
          <Txt className="text-caption text-faint">{`All ${formatNumber(total)} ${total === 1 ? 'quote' : 'quotes'}.`}</Txt>
        </View>
      </View>
    </Group>
  );
}
