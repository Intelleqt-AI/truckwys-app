import { RefreshControl, ScrollView, TouchableOpacity, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Button, Mono, StatusPill, Txt } from '@/components/ui';
import { fetchData } from '@/lib/api/client';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { contractPct, fmtRatePerTonne, fmtTonnes, periodText, type VolumeContract } from './quote/tonnage';

interface ContractRow {
  id: number;
  quote_number: string;
  customer_name?: string | null;
  status: string;
  pickup_location: string;
  delivery_location: string;
  rate_per_tonne: string | null;
  min_tonnes_per_load: string | null;
  costing_snapshot?: { tonnage?: { min_tonnes_per_load?: number | null } | null } | null;
  volume_contract: VolumeContract | null;
}

const place = (s: string) => (s || '').split(',')[0]?.trim() || '—';

/**
 * Volume contracts: per-tonne quotes with a total, booked as call-off loads.
 * Created and edited in the quote builder (Per tonne, Contract). Same list as
 * the web's Contracts tab.
 */
export function ContractsTab() {
  const nav = useAppNavigation();
  const q = useQuery({
    queryKey: ['quotes', 'contracts'],
    queryFn: () => fetchData<{ results?: ContractRow[] } | ContractRow[]>('quotes/?contract=true&page_size=100'),
  });
  const rows: ContractRow[] = Array.isArray(q.data) ? q.data : (q.data?.results ?? []);
  const newContract = () => nav.nav.navigate('CreateQuote', { prefill: { contract: true, pricing_basis: 'per_tonne' } });
  return (
    <ScrollView
      contentContainerClassName="gap-2.5 px-screen pb-28 pt-3"
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
    >
      {!q.isPending && rows.length === 0 ? (
        <View className="items-start gap-3 rounded-card border border-line bg-surface p-4">
          <Txt className="text-sub text-muted">
            {q.isError ? "Couldn't load contracts." : 'No contracts yet. Quote a total in tonnes and book each load as it is called off.'}
          </Txt>
          <Button label={q.isError ? 'Try again' : 'New contract'} variant="secondary" size="sm" onPress={q.isError ? () => q.refetch() : newContract} />
        </View>
      ) : (
        rows.map((r) => {
          const c = r.volume_contract;
          const min = r.min_tonnes_per_load ?? r.costing_snapshot?.tonnage?.min_tonnes_per_load ?? null;
          const period = c ? periodText(c.contract_start, c.contract_end) : null;
          return (
            <TouchableOpacity
              key={r.id}
              activeOpacity={0.7}
              accessibilityRole="button"
              onPress={() => nav.openQuote(r.id)}
              className="gap-2 rounded-card border border-line bg-surface p-3.5"
            >
              <View className="flex-row items-center justify-between gap-3">
                <Txt className="flex-1 text-callout font-semibold" numberOfLines={1}>
                  {r.customer_name || '—'}
                </Txt>
                <StatusPill status={r.status} />
              </View>
              <Txt className="text-caption text-muted" numberOfLines={1}>
                {place(r.pickup_location)} → {place(r.delivery_location)}
                {period ? ` · ${period}` : ''}
              </Txt>
              <View className="flex-row items-center justify-between">
                <Mono className="text-callout font-semibold text-fg">{fmtRatePerTonne(r.rate_per_tonne)}</Mono>
                <Txt className="text-caption text-muted">Min {min != null ? fmtTonnes(min) : '—'} a load</Txt>
              </View>
              {c && (
                <View className="gap-1.5">
                  <View className="h-1.5 overflow-hidden rounded-pill bg-raised">
                    <View className="h-full rounded-pill bg-accent" style={{ width: `${contractPct(c)}%` }} />
                  </View>
                  <Txt className="text-caption text-muted">
                    {fmtTonnes(c.booked_tonnes)} of {fmtTonnes(c.total_tonnes)} booked
                  </Txt>
                </View>
              )}
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );
}
