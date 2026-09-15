import { memo } from 'react';
import { View, Pressable, Modal } from 'react-native';
import { Button, Label, Txt, Mono } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';

/**
 * Rate/km precedence explainer — same pattern as TollBreakdownModal and
 * FuelBreakdownModal, and the app's equivalent of web's R/km Popover
 * (QuoteBuilder.tsx). Shows the two figures the field's caption (built in
 * CreateQuoteScreen.tsx as `rateSource`) can be naming: the selected type's
 * own rate and the company-wide default — a type's own rate always wins when
 * both are set.
 */
function RateBreakdownModalImpl({
  visible,
  onClose,
  vehicleType,
  vehicleTypeRate,
  companyDefaultRate,
}: {
  visible: boolean;
  onClose: () => void;
  vehicleType: string;
  /** 0 when the selected type (if any) has no rate of its own set. */
  vehicleTypeRate: number;
  /** 0 when the company hasn't set a default rate. */
  companyDefaultRate: number;
}) {
  const rows: [string, string][] = [
    ['Company default', companyDefaultRate > 0 ? `${formatCurrency(companyDefaultRate)}/km` : 'not set'],
    ...(vehicleType
      ? ([[vehicleType, vehicleTypeRate > 0 ? `${formatCurrency(vehicleTypeRate)}/km` : 'not set']] as [
          string,
          string,
        ][])
      : []),
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-center bg-black/60 px-6" onPress={onClose}>
        <Pressable
          className="rounded-md border border-line bg-elevated p-4"
          onPress={(e) => e.stopPropagation()}
        >
          <Label className="mb-3 text-muted">Base rate per km</Label>
          <Txt className="mb-2 text-sub text-muted">
            What this quote charges per kilometre, before fuel, tolls and allowances.
          </Txt>
          <Txt className="mb-3 text-sub text-muted">
            {vehicleType
              ? `${vehicleType}'s own rate is used when it has one set, otherwise your company's default.`
              : "Your company's default rate is used until a vehicle type with its own rate is picked."}
          </Txt>
          <View>
            {rows.map(([k, v]) => (
              <View
                key={k}
                className="flex-row items-center justify-between border-b border-line-row py-2"
              >
                <Txt className="text-sub text-muted">{k}</Txt>
                <Mono className="text-sub text-fg">{v}</Mono>
              </View>
            ))}
          </View>
          <Txt className="mt-3 text-micro text-faint">
            Change them in Settings → Company Details, or Settings → Vehicle Types. Editing the
            box here only affects this quote.
          </Txt>
          <Button label="Close" variant="secondary" onPress={onClose} fullWidth className="mt-4" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export const RateBreakdownModal = memo(RateBreakdownModalImpl);
