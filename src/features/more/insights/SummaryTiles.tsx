import { useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Icon, Mono, StatCard, Txt } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { formatCurrencyCompact } from '@/lib/formatters';
import { plural } from '@/lib/ledger';
import { randWhole, type Finding, type FindingsSummary } from './findings';

const HALF = { width: '47.5%' } as const;

/**
 * The four summary tiles: cash held up, findings, customers involved and
 * overdue invoices chased. `findings` are the main ones (not "Worth checking").
 */
export function SummaryTiles({ findings, summary }: { findings: Finding[]; summary: FindingsSummary }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const high = findings.filter((f) => f.severity === 'high').length;
  const cash = summary.cash >= 1_000_000 ? formatCurrencyCompact(summary.cash) : randWhole(summary.cash);
  const cashNote = [
    summary.invoiceCount ? plural(summary.invoiceCount, 'invoice') : null,
    summary.loadCount ? plural(summary.loadCount, 'load') : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View className="mb-5">
      <View className="flex-row flex-wrap gap-3">
        <View className="flex-row" style={HALF}>
          <StatCard label="Cash held up" value={cash} sub={cashNote || 'Nothing held up'} />
        </View>
        <View className="flex-row" style={HALF}>
          <StatCard
            label="Findings"
            value={String(findings.length)}
            sub={high > 0 ? `${high} high severity` : 'None high severity'}
          />
        </View>
        <View className="flex-row" style={HALF}>
          <StatCard
            label="Customers involved"
            value={String(summary.customerCount)}
            sub="in cash findings"
          />
        </View>
        <View className="flex-row" style={HALF}>
          <StatCard
            label="Overdue chased"
            value={`${summary.reminded} of ${summary.overdueCount}`}
            sub={
              summary.reminded === 0 && summary.overdueCount > 0
                ? 'No reminder recorded'
                : 'With a reminder recorded'
            }
          />
        </View>
      </View>

      <TouchableOpacity
        onPress={() => setOpen((o) => !o)}
        activeOpacity={0.6}
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 8 }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="mt-3 min-h-[36px] flex-row items-center gap-1 self-start"
      >
        <Mono className="text-caption font-medium text-muted">How cash held up is worked out</Mono>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={12} color={colors.muted} />
      </TouchableOpacity>
      {open && (
        <Txt className="mt-2 text-sub text-muted">
          Money you have earned but not collected, across the findings below: unsent drafts, open
          balances and loads with a vehicle that were left open. Pending loads were never picked up,
          so they are not counted. Each invoice and load is counted once, even if it is in two
          findings. Costs and estimates are not included.
        </Txt>
      )}
    </View>
  );
}
