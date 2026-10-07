import { memo } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Group, TextField, Mono, Icon } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The editable price levers: tolls, driver nights and rate per km. A field
 * typed away from its worked-out figure shows a one-tap way back; Reset clears
 * every change at once.
 *
 * Two across, then one full width: three columns left ~54pt of input, which
 * can't hold `12 000,00`.
 */
function CostOverridesImpl({
  tollValue,
  tollEdited,
  tollOverrideNum,
  tollCalculated,
  tollKnown,
  onTollChangeText,
  onUseCalculatedToll,
  driverValue,
  driverEdited,
  driverSuggested,
  onDriverChangeText,
  onUseSuggestedDriver,
  baseRatePerKm,
  onRateChangeText,
  overridden,
  onResetAll,
}: {
  tollValue: string;
  tollEdited: boolean;
  tollOverrideNum: number;
  tollCalculated: number;
  /** The route gave a toll figure (else nothing to go back to). */
  tollKnown: boolean;
  onTollChangeText: (v: string) => void;
  onUseCalculatedToll: () => void;
  driverValue: string;
  driverEdited: boolean;
  driverSuggested: number | null;
  onDriverChangeText: (v: string) => void;
  onUseSuggestedDriver: () => void;
  baseRatePerKm: string;
  onRateChangeText: (v: string) => void;
  overridden: boolean;
  onResetAll: () => void;
}) {
  const tollBack = tollEdited && tollKnown && Math.abs(tollOverrideNum - tollCalculated) >= 0.005;
  const driverBack = driverEdited && driverSuggested !== null;
  return (
    <Group label="Adjust" action={overridden ? 'Reset' : undefined} onAction={overridden ? onResetAll : undefined}>
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
          </View>
          <View className="flex-1">
            <TextField
              label="Driver nights"
              prefix="R"
              placeholder="0"
              keyboardType="decimal-pad"
              numeric
              decimals={2}
              value={driverValue}
              onChangeText={onDriverChangeText}
              bottomSheet
            />
          </View>
        </View>
        {(tollBack || driverBack) && (
          <View className="-mt-1 flex-row flex-wrap gap-x-4">
            {tollBack && <Back label={`Route ${formatCurrency(tollCalculated, { maximumFractionDigits: 0 })}`} onPress={onUseCalculatedToll} />}
            {driverBack && (
              <Back
                label={`Suggested ${formatCurrency(driverSuggested ?? 0, { maximumFractionDigits: 0 })}`}
                onPress={onUseSuggestedDriver}
              />
            )}
          </View>
        )}
        <TextField
          label="Rate / km"
          prefix="R"
          placeholder="e.g. 25"
          keyboardType="decimal-pad"
          value={baseRatePerKm}
          onChangeText={onRateChangeText}
          bottomSheet
        />
      </View>
    </Group>
  );
}

/** "Route R 850 ↺": the worked-out figure, one tap to go back to it. */
function Back({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      activeOpacity={0.6}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Use ${label}`}
      hitSlop={{ top: 10, bottom: 10 }}
      className="min-h-[32px] flex-row items-center gap-1"
    >
      <Icon name="refresh" size={12} color={colors.link} />
      <Mono className="text-caption text-link" numberOfLines={1}>
        {label}
      </Mono>
    </TouchableOpacity>
  );
}

export const CostOverrides = memo(CostOverridesImpl);
