import { View } from 'react-native';
import { Mono, Txt } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { plural } from '@/lib/ledger';
import type { FunnelStage } from './types';

// ── Funnel: how far things got ──────────────────────────────────────────────
// One bar per stage, sized against the first, so the drop between stages is the
// thing you see. The last stage is the accent (it is where the money is); a dashed
// ghost shows what fell out since the stage before, named under the bar.
export function Funnel({ stages, noun }: { stages: FunnelStage[]; /** "invoice" */ noun: string }) {
  const { colors } = useTheme();
  const first = stages[0];
  if (!first || first.count <= 0) return null;
  const last = stages.length - 1;

  return (
    <View className="gap-4">
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1]! : null;
        const pct = (s.count / first.count) * 100;
        const lost = prev ? Math.max(0, prev.count - s.count) : 0;
        const lostPct = (lost / first.count) * 100;
        const ofPrev = prev && prev.count > 0 ? Math.round((s.count / prev.count) * 100) : 100;
        return (
          <View key={s.key} accessible accessibilityLabel={`${s.label}: ${plural(s.count, noun)}${s.sub ? `, ${s.sub}` : ''}`}>
            <View className="flex-row items-baseline justify-between gap-3">
              <View className="flex-1">
                <Txt className="text-callout font-medium text-fg">{s.label}</Txt>
                {s.sub ? <Mono className="text-caption text-faint">{s.sub}</Mono> : null}
              </View>
              <View className="items-end">
                <Mono className="text-callout font-semibold text-fg">{plural(s.count, noun)}</Mono>
                <Mono className="text-caption text-faint">{prev ? `${ofPrev}% of previous` : '100%'}</Mono>
              </View>
            </View>

            <View className="mt-1.5 h-[10px] flex-row">
              <View
                className="h-[10px] rounded-pill"
                style={{
                  width: `${Math.max(pct, s.count > 0 ? 1.5 : 0)}%`,
                  backgroundColor: i === last ? colors.accent : colors.chartMuted,
                  opacity: i === last ? 1 : 0.45,
                }}
              />
              {lost > 0 ? (
                <View
                  className="ml-0.5 h-[10px] rounded-pill border border-dashed"
                  style={{ width: `${Math.max(lostPct - 0.5, 1.5)}%`, borderColor: colors.chartMuted }}
                />
              ) : null}
            </View>

            {lost > 0 ? (
              <Txt className="mt-1 text-caption text-faint">
                {s.dropNote ? `${lost} ${s.dropNote}` : `${lost} dropped out`}
              </Txt>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
