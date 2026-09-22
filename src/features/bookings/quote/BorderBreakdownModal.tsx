import { memo } from 'react';
import { View, Pressable, Modal } from 'react-native';
import { Button, Label, Txt, Mono } from '@/components/ui';
import { num, pick, str } from '@/lib/api/list';
import { formatCurrency } from '@/lib/formatters';
import type { CostBreakdown } from './costs';

/**
 * Cross-border charge breakdown, mirroring TollBreakdownModal's structure.
 *
 * Prefers costs.crossBorderBreakdown — the named charges the backend sends
 * ("SA C-BRTA Class 2 permit (R9,041/yr over 24 crossings)", each border
 * crossing, each country's weighbridge and tolls) — over the three bucket
 * totals, which is what lets an operator check a quote against a real
 * invoice line by line. Falls back to the buckets for a route response
 * cached before the backend started sending the itemised list.
 */
function BorderBreakdownModalImpl({
  visible,
  onClose,
  costs,
}: {
  visible: boolean;
  onClose: () => void;
  costs: CostBreakdown;
}) {
  const items = costs.crossBorderBreakdown.filter((i) => num(pick(i, ['amount'])) > 0);
  const rows = items.length
    ? items.map((i) => ({ label: str(pick(i, ['description']), 'Charge'), v: num(pick(i, ['amount'])) }))
    : [
        { label: 'Border fees', v: costs.borderFees },
        { label: 'Weighbridge fees', v: costs.weighbridgeFees },
        { label: 'Non-SA tolls', v: costs.nonSaTolls },
      ].filter((row) => row.v > 0);
  const oneWayTotal = costs.borderFees + costs.weighbridgeFees + costs.nonSaTolls;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-center bg-black/60 px-6" onPress={onClose}>
        <Pressable
          className="rounded-md border border-line bg-elevated p-4"
          onPress={(e) => e.stopPropagation()}
        >
          <Label className="mb-3 text-muted">Cross-border charges</Label>
          {rows.length === 0 ? (
            <Txt className="text-callout text-muted">No cross-border charges on this route.</Txt>
          ) : (
            <View>
              {rows.map((row, i) => (
                <View
                  key={i}
                  className="flex-row items-center justify-between border-b border-line-row py-2"
                >
                  <Txt className="flex-1 pr-3 text-sub text-fg" numberOfLines={2}>
                    {row.label}
                  </Txt>
                  <Mono className="text-sub text-muted">{formatCurrency(row.v)}</Mono>
                </View>
              ))}
              <View className="mt-2 flex-row items-center justify-between">
                <Txt className="text-callout font-semibold text-fg">One way total</Txt>
                <Mono className="text-callout font-semibold text-fg">
                  {formatCurrency(Math.round(oneWayTotal))}
                </Mono>
              </View>
              {costs.legs === 2 && (
                <Mono className="mt-1 text-micro text-faint">
                  × 2 for round trip = {formatCurrency(Math.round(oneWayTotal * 2))}
                </Mono>
              )}
            </View>
          )}
          <Button label="Close" variant="secondary" onPress={onClose} fullWidth className="mt-4" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export const BorderBreakdownModal = memo(BorderBreakdownModalImpl);
