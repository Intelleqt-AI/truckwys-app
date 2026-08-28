import { memo } from 'react';
import { View, Pressable } from 'react-native';
import { Group, TextField, Mono, Icon } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The three editable cost levers — moved out of CreateQuoteScreen.tsx's
 * render body (Phase 2) verbatim, wrapped in memo. `tollValue` is computed by
 * the caller (tollEdited ? tollOverride : formatPlain(costs.tollCost)) so
 * this component stays a plain controlled-inputs row.
 *
 * Phase 5: once an override is edited it used to be a one-way door — no way
 * back to what the route/company actually calculated. Now a RevertHint appears
 * once a field has been overridden away from that value, and the group as a
 * whole gets a RESET action that clears every override at once (tolls, driver,
 * rate, and the AI price uplift).
 *
 * The three fields are laid out 2 + 1 rather than 3 across, and each hint names
 * its own field, because it sits under the row rather than under one column.
 * See the layout comment in the body for why three columns couldn't hold a
 * rand amount.
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
  onRateChangeText,
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
  onRateChangeText: (v: string) => void;
  /** Whether anything (tolls, driver, rate, or the AI price uplift) has
      actually been changed away from its calculated/default value. */
  overridden: boolean;
  onResetAll: () => void;
}) {
  const tollDiffersFromCalculated = tollEdited && Math.round(tollOverrideNum) !== tollCalculated;

  return (
    <Group
      label="Adjustments"
      action={overridden ? 'RESET' : undefined}
      onAction={overridden ? onResetAll : undefined}
    >
      <View className="gap-3 p-3">
        {/* Two across, then one full width — not three across. Three columns left
            each field ~95pt, and TextField spends px-3 twice plus the "R" prefix
            plus gap-2 out of that, so only ~54pt of input remained: about six
            digits at INPUT_TEXT's 15px. Driver is `numeric decimals={2}` and
            regroups to `12 000,00` on blur, which doesn't fit — and a TextInput
            can't ellipsize, it scrolls, so the cents simply left the screen.
            ~140pt columns give ~99pt of input instead. Rate / km takes the full
            width because its label is the one that wrapped. */}
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
        </View>
        {tollDiffersFromCalculated && (
          <RevertHint
            label={`Tolls calculated: ${formatCurrency(tollCalculated)}`}
            onPress={onUseCalculatedToll}
          />
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

/**
 * "Here's what it was — tap to go back", as one line.
 *
 * Replaces a Mono + ghost Button pair. `size="sm"` renders "Use calculated" at
 * ~112pt including its px-2.5, which on its own was wider than the amount beside
 * it needed, so the two fought and the figure collapsed to `C…`. Folding the
 * action into the text makes the amount the widest thing in the row instead of
 * the loser, and matches the tappable strip in QuoteFooterActions.
 */
function RevertHint({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Tap to use it`}
      className="-mt-1 flex-row items-center gap-1"
    >
      <Mono className="shrink text-micro text-faint" numberOfLines={1}>
        {label} · tap to use
      </Mono>
      <Icon name="chevronRight" size={13} color={colors.faint} />
    </Pressable>
  );
}

export const CostOverrides = memo(CostOverridesImpl);
