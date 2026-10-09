import { TouchableOpacity, View } from 'react-native';
import { DetailRow, Group, Mono, StatusPill, Txt } from '@/components/ui';
import { contractPct, fmtRatePerTonne, fmtTonnes, loadsText, periodText, type VolumeContract } from './quote/tonnage';

/**
 * A per-tonne quote's terms (rate, minimum, tonnes) and, for a volume
 * contract, the tonnes booked so far and its call-off loads. Same content as
 * the web quote page's TonnageTerms.
 */
export function TonnageTermsGroup({
  quote,
  onOpenLoad,
}: {
  quote: Record<string, unknown>;
  onOpenLoad: (id: number, loadNumber: string) => void;
}) {
  const snapMin = ((quote.costing_snapshot as Record<string, unknown> | undefined)?.tonnage as
    | Record<string, unknown>
    | undefined)?.min_tonnes_per_load;
  const min = (quote.min_tonnes_per_load ?? snapMin ?? null) as number | string | null;
  const c = (quote.volume_contract ?? null) as VolumeContract | null;
  const period = c ? periodText(c.contract_start, c.contract_end) : null;
  const loadsPlanned = quote.loads_planned as number | null | undefined;
  return (
    <Group label={c ? 'Contract' : 'Per tonne'}>
      <DetailRow label="Rate" value={fmtRatePerTonne(quote.rate_per_tonne as number | string | null)} />
      <DetailRow label="Minimum a load" value={min != null ? fmtTonnes(min) : "—"} />
      {c ? (
        <>
          <DetailRow label="Contract" value={`${fmtTonnes(c.total_tonnes)} · ${loadsText(c.loads_planned)}`} />
          {period && <DetailRow label="Period" value={period} mono={false} />}
          <View className="gap-1.5 px-3.5 py-3">
            <View className="h-1.5 overflow-hidden rounded-pill bg-raised">
              <View className="h-full rounded-pill bg-accent" style={{ width: `${contractPct(c)}%` }} />
            </View>
            <View className="flex-row justify-between">
              <Txt className="text-caption text-muted">
                {fmtTonnes(c.booked_tonnes)} booked{c.delivered_tonnes ? `, ${fmtTonnes(c.delivered_tonnes)} weighed` : ''}
              </Txt>
              <Txt className="text-caption text-muted">{fmtTonnes(c.remaining_tonnes)} left</Txt>
            </View>
          </View>
          {(c.loads ?? []).map((l, i, all) => (
            <TouchableOpacity
              key={l.id}
              activeOpacity={0.7}
              accessibilityRole="button"
              onPress={() => onOpenLoad(l.id, l.load_number)}
              className={`min-h-[48px] flex-row items-center justify-between gap-3 px-3.5 py-2 ${i < all.length - 1 ? 'border-b border-line-row' : ''}`}
            >
              <Mono className="flex-1 text-sub text-fg" numberOfLines={1}>
                {l.load_number}
              </Mono>
              <Txt className="text-caption text-muted">
                {l.actual_tonnes != null ? fmtTonnes(l.actual_tonnes) : `${fmtTonnes(l.planned_tonnes)} planned`}
              </Txt>
              <StatusPill status={l.status} />
            </TouchableOpacity>
          ))}
        </>
      ) : (
        <DetailRow
          label="Tonnes"
          value={`${fmtTonnes(quote.tonnes_per_load as number | string | null)}${loadsPlanned && loadsPlanned > 1 ? ` · ${loadsText(loadsPlanned)}` : ''}`}
          last
        />
      )}
    </Group>
  );
}
