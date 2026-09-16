import { memo } from 'react';
import { View, Pressable, Modal } from 'react-native';
import { Button, Label, Txt, Mono } from '@/components/ui';
import { formatCurrency, formatNumber } from '@/lib/formatters';
import type { CostBreakdown } from './costs';

/**
 * Fuel figure explainer — same pattern as TollBreakdownModal, and the app's
 * equivalent of web's fuel-line Popover (QuoteBuilder.tsx). Names which truck
 * the L/100km basis actually came from: the selected type, one inferred from
 * the load (quote/costs.ts inferFuelBasis), or neither.
 */
function FuelBreakdownModalImpl({
  visible,
  onClose,
  costs,
  vehicleType,
  weightTons,
  suggestedTypeName,
}: {
  visible: boolean;
  onClose: () => void;
  costs: CostBreakdown;
  vehicleType: string;
  /** null when the weight field is empty or unparseable. */
  weightTons: number | null;
  /** Name of the top truck suggestion, when one is offered (quote/suggestions.ts)
      — lets the no-type footnote point at an actual truck instead of an
      abstract instruction. Null when none is offered. */
  suggestedTypeName?: string | null;
}) {
  const hasVehicleType = !!vehicleType;
  // Percentage-per-tonne, not the raw fraction (`fuelSensitivity` is 0.02 for
  // 2%) — Math.round(...*10000)/100 rather than a plain *100 to avoid
  // floating-point artifacts like 1.9999999999999998.
  const sensitivityPct = Math.round(costs.fuelSensitivity * 10000) / 100;
  // Whether a weight adjustment actually ran — mirrors web's
  // fuelRefCapacityTons > 0, NOT costs.fuelBasisName. A vehicle type can be
  // selected (or inferred) and still have no usable rated capacity, in which
  // case computeCosts falls back to the flat consumptionRef with no weight
  // scaling at all — showing the five-row table (with a "Weight effect" row)
  // in that case would describe an adjustment that never happened.
  const hasCapacity = costs.fuelBasisCapacityTons > 0;
  // Last row bold — the payoff of the four above it, same as the modal's own
  // "Fuel cost" total below (mirrors web's Popover).
  const rows: [string, string, boolean?][] = hasCapacity
    ? [
        ['Truck used', `${costs.fuelBasisName} (${costs.fuelBasisCapacityTons}t)`],
        [
          'Its rated burn',
          `${costs.fuelBasisConsumption.toFixed(1)} L/100km at ${costs.fuelBasisCapacityTons}t`,
        ],
        ['This load', `${weightTons ?? 0}t`],
        ['Weight effect', `${sensitivityPct}% per tonne`],
        ['Burn for this load', `${costs.consumption.toFixed(1)} L/100km`, true],
      ]
    : [];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-center bg-black/60 px-6" onPress={onClose}>
        <Pressable
          className="rounded-md border border-line bg-elevated p-4"
          onPress={(e) => e.stopPropagation()}
        >
          <Label className="mb-3 text-muted">How this fuel figure is worked out</Label>

          {hasCapacity ? (
            <>
              <Txt className="mb-3 text-sub text-muted">
                {hasVehicleType
                  ? `Your ${vehicleType}'s own consumption, adjusted for this load.`
                  : `No truck is picked, so this uses ${costs.fuelBasisName} — the most economical type in your fleet that can carry ${weightTons ?? 0}t.`}
              </Txt>
              <View>
                {rows.map(([k, v, bold]) => (
                  <View
                    key={k}
                    className="flex-row items-center justify-between border-b border-line-row py-2"
                  >
                    <Txt className={bold ? 'text-sub font-semibold text-fg' : 'text-sub text-muted'}>
                      {k}
                    </Txt>
                    <Mono className={bold ? 'text-sub font-semibold text-fg' : 'text-sub text-fg'}>
                      {v}
                    </Mono>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <Txt className="mb-1 text-sub text-muted">
              Nothing in your fleet has a rated capacity to work from, so this uses a standard{' '}
              {costs.consumption.toFixed(1)} L/100km with no adjustment for weight. Set a capacity
              on your vehicle types to price this properly.
            </Txt>
          )}

          <View className="mt-3 border-t border-line-row pt-3">
            {(
              [
                [
                  'Distance',
                  `${formatNumber(Math.round(costs.chargeDistance))} km${costs.legs > 1 ? ' (round trip)' : ''}`,
                ],
                ['Diesel used', `${formatNumber(costs.fuelUsage)} L`],
                ['Diesel price', `${formatCurrency(costs.fuelPrice)}/L`],
              ] as [string, string][]
            ).map(([k, v]) => (
              <View key={k} className="flex-row items-center justify-between py-1">
                <Txt className="text-sub text-muted">{k}</Txt>
                <Mono className="text-sub text-fg">{v}</Mono>
              </View>
            ))}
            <View className="mt-2 flex-row items-center justify-between">
              <Txt className="text-callout font-semibold text-fg">Fuel cost</Txt>
              <Mono className="text-callout font-semibold text-fg">
                {formatCurrency(costs.fuelCost)}
              </Mono>
            </View>
          </View>

          {!hasVehicleType && hasCapacity && (
            <Txt className="mt-3 text-micro text-faint">
              {"This is a fleet-wide estimate, picked so the figure doesn't jump around as you change the weight."}
              {suggestedTypeName
                ? ` Choose ${suggestedTypeName} above to price on the truck you'd actually send.`
                : ' Pick a vehicle type to price on that truck exactly.'}
            </Txt>
          )}

          <Button label="Close" variant="secondary" onPress={onClose} fullWidth className="mt-4" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export const FuelBreakdownModal = memo(FuelBreakdownModalImpl);
