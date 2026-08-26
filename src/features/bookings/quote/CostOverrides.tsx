import { memo } from 'react';
import { View } from 'react-native';
import { Group, Button, TextField, Mono } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';

/**
 * The three editable cost levers — moved out of CreateQuoteScreen.tsx's
 * render body (Phase 2) verbatim, wrapped in memo. `tollValue` is computed by
 * the caller (tollEdited ? tollOverride : formatPlain(costs.tollCost)) so
 * this component stays a plain controlled-inputs row.
 *
 * Phase 5: once an override is edited it used to be a one-way door — no way
 * back to what the route/company actually calculated. Now a "Use calculated"
 * / "Use default" hint appears under a field once it's been overridden away
 * from that value, and the group as a whole gets a RESET action that clears
 * every override at once (tolls, driver, rate, and the AI price uplift).
 */
function CostOverridesImpl({
  tollValue,
  tollEdited,
  tollOverrideNum,
  tollCalculated,
  onTollChangeText,
  onUseCalculatedToll,
  driverAllowance,
  onDriverChangeText,
  baseRatePerKm,
  companyDefaultRate,
  onRateChangeText,
  onUseCompanyRate,
  overridden,
  onResetAll,
}: {
  tollValue: string;
  tollEdited: boolean;
  tollOverrideNum: number;
  tollCalculated: number;
  onTollChangeText: (v: string) => void;
  onUseCalculatedToll: () => void;
  driverAllowance: string;
  onDriverChangeText: (v: string) => void;
  baseRatePerKm: string;
  /** 0 when the company hasn't configured a default rate. */
  companyDefaultRate: number;
  onRateChangeText: (v: string) => void;
  onUseCompanyRate: () => void;
  /** Whether anything (tolls, driver, rate, or the AI price uplift) has
      actually been changed away from its calculated/default value. */
  overridden: boolean;
  onResetAll: () => void;
}) {
  const tollDiffersFromCalculated = tollEdited && Math.round(tollOverrideNum) !== tollCalculated;
  const rateDiffersFromDefault =
    companyDefaultRate > 0 && baseRatePerKm.trim() !== String(companyDefaultRate);

  return (
    <Group
      label="Adjustments"
      action={overridden ? 'RESET' : undefined}
      onAction={overridden ? onResetAll : undefined}
    >
      <View className="gap-3 p-3">
        <View className="flex-row gap-3">
          <View className="flex-1">
            <TextField
              label="Tolls"
              prefix="R"
              placeholder="0"
              keyboardType="decimal-pad"
              value={tollValue}
              onChangeText={onTollChangeText}
              bottomSheet
            />
            {tollDiffersFromCalculated && (
              <View className="mt-1.5 flex-row items-center justify-between gap-2">
                <Mono className="flex-1 text-micro text-faint" numberOfLines={1}>
                  Calculated: {formatCurrency(tollCalculated)}
                </Mono>
                <Button
                  label="Use calculated"
                  variant="ghost"
                  size="sm"
                  onPress={onUseCalculatedToll}
                />
              </View>
            )}
          </View>
          <View className="flex-1">
            <TextField
              label="Driver"
              prefix="R"
              placeholder="0"
              keyboardType="decimal-pad"
              numeric
              decimals={2}
              value={driverAllowance}
              onChangeText={onDriverChangeText}
              bottomSheet
            />
          </View>
          <View className="flex-1">
            <TextField
              label="Rate / km"
              prefix="R"
              placeholder="e.g. 25"
              keyboardType="decimal-pad"
              value={baseRatePerKm}
              onChangeText={onRateChangeText}
              bottomSheet
            />
            {rateDiffersFromDefault && (
              <View className="mt-1.5 flex-row items-center justify-between gap-2">
                <Mono className="flex-1 text-micro text-faint" numberOfLines={1}>
                  Default: {formatCurrency(companyDefaultRate)}
                </Mono>
                <Button label="Use default" variant="ghost" size="sm" onPress={onUseCompanyRate} />
              </View>
            )}
          </View>
        </View>
      </View>
    </Group>
  );
}

export const CostOverrides = memo(CostOverridesImpl);
