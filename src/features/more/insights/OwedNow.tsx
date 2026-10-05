import { useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Mono, Txt } from '@/components/ui';
import { AgeingBar, type OwedRow } from '@/components/viz';
import { plural } from '@/lib/ledger';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { useTheme } from '@/theme/ThemeProvider';
import { randWhole } from './findings';

const MAX_ROWS = 6;

const reminded = (ago: number | null) =>
  ago == null ? 'never reminded' : ago === 0 ? 'reminded today' : `reminded ${plural(ago, 'day')} ago`;

/**
 * Overdue balances by customer, biggest first. The bar under each name is that
 * customer's overdue rand split by how late it is, on one scale for the list.
 * Tap a customer for its invoices; tap an invoice to open it (the reminder is
 * sent from there, after its preview).
 */
export function OwedNow({ rows }: { rows: OwedRow[] }) {
  const { colors } = useTheme();
  const { openInvoice, openCustomer } = useAppNavigation();
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  const shown = all ? rows : rows.slice(0, MAX_ROWS);
  const top = Math.max(1, ...rows.map((r) => r.overdue));

  return (
    <View>
      {shown.map((r, idx) => {
        const isOpen = open === r.id;
        const last = idx === shown.length - 1 && rows.length <= MAX_ROWS;
        return (
          <TouchableOpacity
            key={r.id}
            onPress={() => setOpen(isOpen ? null : r.id)}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityState={{ expanded: isOpen }}
            accessibilityLabel={`${r.label}: ${randWhole(r.overdue)} overdue on ${plural(r.invoices.length, 'invoice')}, oldest ${plural(r.oldest, 'day')} late`}
            className={`py-3 ${last ? '' : 'border-b border-line-row'}`}
          >
            <View className="flex-row items-baseline justify-between gap-3">
              <Txt className="flex-1 text-callout font-medium text-fg" numberOfLines={1}>
                {r.label}
              </Txt>
              <Mono className="text-callout font-semibold text-fg">{randWhole(r.overdue)}</Mono>
            </View>
            <Mono className="mb-2 mt-0.5 text-caption" style={{ color: r.oldest > 90 ? colors.danger : colors.muted }}>
              {`${plural(r.invoices.length, 'invoice')} · oldest ${plural(r.oldest, 'day')} late`}
            </Mono>
            <AgeingBar buckets={r.buckets} scale={r.overdue / top} />

            {isOpen ? (
              <View className="mt-2">
                {r.invoices.map((i) => (
                  <TouchableOpacity
                    key={i.id}
                    onPress={() => openInvoice(i.id)}
                    activeOpacity={0.6}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${i.ref}`}
                    className="min-h-[44px] flex-row items-center justify-between gap-3 py-1"
                  >
                    <View className="flex-1">
                      <Txt className="text-caption text-fg" numberOfLines={1}>
                        {`${i.ref} · ${plural(i.daysLate, 'day')} late`}
                      </Txt>
                      <Txt
                        className="text-caption"
                        style={{ color: i.remindedAgo == null ? colors.danger : colors.muted }}
                      >
                        {reminded(i.remindedAgo)}
                      </Txt>
                    </View>
                    <Mono className="text-caption text-fg">{randWhole(i.balance)}</Mono>
                  </TouchableOpacity>
                ))}
                {r.customerId != null ? (
                  <TouchableOpacity
                    onPress={() => openCustomer(r.customerId!)}
                    activeOpacity={0.6}
                    accessibilityRole="button"
                    className="min-h-[44px] justify-center self-start"
                  >
                    <Mono className="text-caption font-medium text-link">{`Open ${r.label}`}</Mono>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}

      {rows.length > MAX_ROWS ? (
        <TouchableOpacity
          onPress={() => setAll((a) => !a)}
          activeOpacity={0.6}
          accessibilityRole="button"
          className="min-h-[44px] items-center justify-center"
        >
          <Mono className="text-caption font-medium text-link">
            {all ? `Show top ${MAX_ROWS}` : `Show all ${rows.length} customers`}
          </Mono>
        </TouchableOpacity>
      ) : null}

      <View className="mt-1 flex-row flex-wrap gap-x-4 gap-y-1">
        {[
          ['1 to 30', 0.45, colors.warning],
          ['31 to 60', 0.95, colors.warning],
          ['61 to 90', 0.6, colors.danger],
          ['Over 90 days', 1, colors.danger],
        ].map(([label, opacity, color]) => (
          <View key={label as string} className="flex-row items-center gap-1.5">
            <View
              className="h-[8px] w-[8px] rounded-full"
              style={{ backgroundColor: color as string, opacity: opacity as number }}
            />
            <Txt className="text-micro text-faint">{label as string}</Txt>
          </View>
        ))}
      </View>
    </View>
  );
}
