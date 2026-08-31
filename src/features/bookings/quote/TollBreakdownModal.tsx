import { memo } from 'react';
import { View, Pressable, Modal } from 'react-native';
import { Button, Label, Txt, Mono } from '@/components/ui';
import { num, pick, str } from '@/lib/api/list';
import { formatCurrency } from '@/lib/formatters';
import type { CostBreakdown } from './costs';

/**
 * Toll plaza breakdown — moved out of CreateQuoteScreen.tsx's render body
 * (Phase 2) verbatim, wrapped in memo. Stays mounted at the same tree
 * position as before (a sibling near the end of BottomSheetScrollView,
 * unaffected by the section restructuring since it's a Modal).
 */
function TollBreakdownModalImpl({
  visible,
  onClose,
  costs,
}: {
  visible: boolean;
  onClose: () => void;
  costs: CostBreakdown;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-center bg-black/60 px-6" onPress={onClose}>
        <Pressable
          className="rounded-md border border-line bg-elevated p-4"
          onPress={(e) => e.stopPropagation()}
        >
          <Label className="mb-3 text-muted">Toll plazas on this route</Label>
          {costs.tollBreakdown.length === 0 ? (
            <Txt className="text-callout text-muted">No SANRAL plazas matched on this route.</Txt>
          ) : (
            <View>
              {costs.tollBreakdown.map((b, i) => (
                <View
                  key={i}
                  className="flex-row items-center justify-between border-b border-line-row py-2"
                >
                  <Txt className="flex-1 text-sub text-fg" numberOfLines={1}>
                    {str(pick(b, ['plaza']), 'Plaza')}
                    {pick(b, ['route']) ? ` (${str(pick(b, ['route']))})` : ''}
                  </Txt>
                  <Mono className="text-sub text-muted">
                    {formatCurrency(num(pick(b, ['tariff'])))}
                  </Mono>
                </View>
              ))}
              <View className="mt-2 flex-row items-center justify-between">
                <Txt className="text-callout font-semibold text-fg">One way total</Txt>
                <Mono className="text-callout font-semibold text-fg">
                  {formatCurrency(costs.tollBreakdownOneWay)}
                </Mono>
              </View>
              {costs.legs === 2 && (
                <Mono className="mt-1 text-micro text-faint">
                  × 2 for round trip = {formatCurrency(costs.tollBreakdownOneWay * 2)}
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

export const TollBreakdownModal = memo(TollBreakdownModalImpl);
