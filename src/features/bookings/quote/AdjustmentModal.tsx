import { memo } from 'react';
import { View, TouchableOpacity, Modal } from 'react-native';
import { Button, Label, Txt, Mono } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';

/**
 * The price adjustment, never removed on one tap: Keep it, or go to today's
 * price (the price lines without it).
 */
function AdjustmentModalImpl({
  visible,
  label,
  amount,
  todaysPrice,
  onKeep,
  onUseToday,
}: {
  visible: boolean;
  label: string;
  amount: number;
  todaysPrice: number;
  onKeep: () => void;
  onUseToday: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onKeep}>
      <TouchableOpacity activeOpacity={1} className="flex-1 justify-center bg-backdrop px-6" onPress={onKeep}>
        <TouchableOpacity activeOpacity={1} className="rounded-panel border border-line bg-elevated p-4" onPress={() => {}}>
          <Label className="mb-2 text-muted">{label}</Label>
          <View className="flex-row items-center justify-between py-1.5">
            <Txt className="text-sub text-muted">Adjustment</Txt>
            <Mono className="text-sub text-fg">{formatCurrency(amount)}</Mono>
          </View>
          <View className="flex-row items-center justify-between py-1.5">
            <Txt className="text-sub text-muted">{"Today's price"}</Txt>
            <Mono className="text-sub text-fg">{formatCurrency(todaysPrice, { maximumFractionDigits: 0 })}</Mono>
          </View>
          <View className="mt-4 flex-row gap-2.5">
            <View className="flex-1">
              <Button label="Keep" variant="secondary" onPress={onKeep} fullWidth />
            </View>
            <View className="flex-1">
              <Button label="Use today's price" onPress={onUseToday} fullWidth />
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

export const AdjustmentModal = memo(AdjustmentModalImpl);
