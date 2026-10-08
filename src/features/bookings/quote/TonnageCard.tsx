import { memo } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { DateField, Mono, SegmentedControl, TextField, Txt } from '@/components/ui';
import type { Tonnage } from './rules';
import { basisReason, fmtRatePerTonne, fmtTonnes, loadsText, truckText } from './tonnage';
import type { TonnageChoice, TonnageMarket } from './useTonnageAnalysis';
import { fmtRand } from './rules';

const pct = (n: number | null | undefined) =>
  n == null ? '' : `${n < 0 && Math.round(Math.abs(n)) !== 0 ? '−' : ''}${Math.round(Math.abs(n))}%`;

/**
 * Per tonne (the Price section of the quote builder): one load or a contract,
 * the minimum per load, every truck that can carry it with its cost per tonne
 * and margin at the rate, the truck it is priced on and why, and the rate.
 * Same content and rules as the web builder's TonnagePanel.
 */
function TonnageCardImpl({
  tonnage,
  contract,
  onContract,
  totalTonnes,
  onTotalTonnes,
  minTonnes,
  onMinTonnes,
  periodStart,
  periodEnd,
  onPeriod,
  rate,
  onRate,
  onChooseTruck,
  market,
  choices,
}: {
  tonnage: Tonnage | null;
  contract: boolean;
  onContract: (v: boolean) => void;
  totalTonnes: string;
  onTotalTonnes: (v: string) => void;
  minTonnes: string;
  onMinTonnes: (v: string) => void;
  periodStart: string;
  periodEnd: string;
  onPeriod: (start: string, end: string) => void;
  /** The rate as typed (empty = the target rate). */
  rate: string;
  onRate: (v: string) => void;
  /** null = back to the safest truck. */
  onChooseTruck: (id: number | null) => void;
  market: TonnageMarket | null;
  choices: TonnageChoice[];
}) {
  const t = tonnage;
  const reason = basisReason(t);
  const minHint = t?.min_tonnes_source === 'basis_load' && t.min_tonnes_per_load ? fmtTonnes(t.min_tonnes_per_load) : 'Planned load';
  return (
    <View className="gap-3">
      <SegmentedControl
        options={[
          { label: 'One load', value: 'one' },
          { label: 'Contract', value: 'contract' },
        ]}
        value={contract ? 'contract' : 'one'}
        onChange={(v) => onContract(v === 'contract')}
      />
      <View className="flex-row gap-3">
        {contract && (
          <View className="flex-1">
            <TextField
              label="Total tonnes"
              placeholder="e.g. 600"
              keyboardType="decimal-pad"
              value={totalTonnes}
              onChangeText={onTotalTonnes}
              bottomSheet
            />
          </View>
        )}
        <View className="flex-1">
          <TextField
            label="Minimum a load (t)"
            placeholder={minHint}
            keyboardType="decimal-pad"
            value={minTonnes}
            onChangeText={onMinTonnes}
            bottomSheet
          />
        </View>
      </View>
      {contract && (
        <View className="flex-row gap-3">
          <View className="flex-1">
            <DateField label="From" value={periodStart} onChange={(v) => onPeriod(v, periodEnd)} />
          </View>
          <View className="flex-1">
            <DateField label="To" value={periodEnd} onChange={(v) => onPeriod(periodStart, v)} />
          </View>
        </View>
      )}

      {t && t.trucks.length > 0 && (
        <View className="gap-2">
          {t.trucks.map((tr) => (
            <TouchableOpacity
              key={String(tr.vehicle_type_id ?? tr.name)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected: tr.is_basis }}
              accessibilityLabel={`${truckText(tr)}, ${fmtRatePerTonne(tr.cost_per_tonne, true)}`}
              onPress={() => onChooseTruck(tr.is_basis && t.basis_reason === 'chosen' ? null : tr.vehicle_type_id)}
              className={`min-h-[56px] justify-center rounded-control border px-3 py-2 ${tr.is_basis ? 'border-fg' : 'border-line'}`}
            >
              <View className="flex-row items-center justify-between gap-3">
                <Txt className="flex-1 text-callout font-semibold" numberOfLines={1}>
                  {truckText(tr)}
                </Txt>
                <Mono className="text-callout font-semibold text-fg">
                  {tr.cost_per_tonne != null ? fmtRatePerTonne(tr.cost_per_tonne, true) : '—'}
                </Mono>
              </View>
              <View className="flex-row items-center justify-between gap-3">
                <Txt className="text-caption text-faint">
                  {loadsText(tr.loads_needed)}
                  {tr.partial_last_load ? `, last ${fmtTonnes(tr.last_load_t)}` : ''}
                </Txt>
                <Mono className={`text-caption ${(tr.at_rate?.margin ?? 0) < 0 ? 'text-danger' : 'text-muted'}`}>
                  {tr.at_rate ? pct(tr.at_rate.margin_pct) : ''}
                </Mono>
              </View>
            </TouchableOpacity>
          ))}
          {reason && <Txt className="text-caption text-muted">{reason}</Txt>}
        </View>
      )}

      <TextField
        label="Rate per tonne"
        prefix="R"
        placeholder={t?.default_rate_per_tonne != null ? fmtRand(t.default_rate_per_tonne).replace('R ', '') : '—'}
        keyboardType="decimal-pad"
        numeric
        value={rate}
        onChangeText={onRate}
        bottomSheet
      />
      {t && (
        <View className="flex-row flex-wrap gap-x-4 gap-y-1">
          <Txt className="text-caption text-muted">Cost {t.cost_per_tonne != null ? fmtRatePerTonne(t.cost_per_tonne, true) : '—'}</Txt>
          <Txt className="text-caption text-muted">Target {fmtRatePerTonne(t.default_rate_per_tonne)}</Txt>
          {t.minimum_charge_per_load != null && (
            <Txt className="text-caption text-muted">Min {fmtRand(t.minimum_charge_per_load)} a load</Txt>
          )}
          {t.estimated_revenue != null && (
            <Txt className="text-caption text-muted">
              Est. {fmtRand(t.estimated_revenue)} · {loadsText(t.loads_planned)} · {fmtTonnes(t.billable_tonnes)}
            </Txt>
          )}
        </View>
      )}
      {market?.available && (
        <Txt className="text-caption text-faint">
          Market {fmtRatePerTonne(market.p25)} to {fmtRatePerTonne(market.p75)}, median {fmtRatePerTonne(market.median)}
        </Txt>
      )}
      {choices.length > 0 && (
        <View className="flex-row gap-2">
          {choices.map((c) => (
            <TouchableOpacity
              key={c.key}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${c.label} ${fmtRatePerTonne(c.rate_per_tonne)}`}
              onPress={() => onRate(String(c.rate_per_tonne))}
              className={`min-h-[56px] flex-1 justify-center rounded-control border px-2.5 ${
                t?.rate_per_tonne === c.rate_per_tonne ? 'border-fg' : 'border-line'
              }`}
            >
              <Txt className="text-caption text-faint">{c.label}</Txt>
              <Mono className="text-callout font-semibold text-fg">{fmtRatePerTonne(c.rate_per_tonne)}</Mono>
              <Txt className="text-caption text-muted">{pct(c.margin_pct)}</Txt>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

export const TonnageCard = memo(TonnageCardImpl);
