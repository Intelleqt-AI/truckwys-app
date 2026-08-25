import { View, ActivityIndicator } from 'react-native';
import { Button, Label, Txt } from '@/components/ui';
import { MapPin, MapReticle } from './MapPin';
import { status as statusHues } from '@/theme/tokens';

/** A stop target carries which stop it is, so confirming writes back to the right row. */
export type PickTarget = 'pickup' | 'dropoff' | { stop: string };

// MapPin's teardrop tip sits at (12, 29.6) of its 0..34 viewBox (see the
// comment on its Path — walked out from the SVG's own bezier commands), not
// at the bottom of the box (y=34, which is padding for its cast shadow).
// Centering the pin's box on the reticle and lifting it by half its own
// height would leave the tip sitting above the reticle's exact point by the
// gap between the tip and the box bottom — this lift is the box's half-height
// *plus* that gap, so the tip itself, not the box, lands exactly on the point.
const PIN_TIP_Y = 29.6;
const PIN_VIEWBOX_H = 34;
const PIN_SIZE = 40;
const PIN_LIFT = PIN_SIZE * (PIN_VIEWBOX_H / 24) * (PIN_TIP_Y / PIN_VIEWBOX_H - 0.5);

/**
 * The Uber/Pathao pick affordance: a pin locked to the centre of the map while
 * the map itself moves underneath.
 *
 * Centre-locked rather than a draggable marker for two reasons that only show up
 * in the hand — a thumb never covers the target, and the pin cannot be "lost"
 * off-screen. The map is what moves, so the aim point is always exactly where
 * the user is looking.
 *
 * Purely presentational; the caller owns the map centre and the lookup.
 */
export function CrosshairOverlay({
  target,
  address,
  resolving,
  error,
  ready,
  onConfirm,
  onCancel,
  bottomInset,
}: {
  target: PickTarget;
  /** Resolved address for the current centre, once known. */
  address?: string | null;
  resolving?: boolean;
  error?: string | null;
  /** The map has settled on a point at least once. Confirming only ever needs
      this — an address name is a display nicety, never a requirement, so a
      spot with no resolvable address (or one still resolving) isn't blocked. */
  ready?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  bottomInset: number;
}) {
  const isPickup = target === 'pickup';
  const isStop = typeof target === 'object';
  const tint = isPickup ? statusHues.success : isStop ? statusHues.info : statusHues.danger;
  const noun = isPickup ? 'collection' : isStop ? 'stop' : 'drop-off';

  return (
    <>
      {/* Pin and reticle both centred on the map's centre. The pin's tip is
          the point, so it is lifted by its own height; the reticle sits exactly
          on the spot and stays readable while the map is moving. */}
      <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
        <View style={{ transform: [{ translateY: -PIN_LIFT }] }}>
          <MapPin color={tint} size={PIN_SIZE} />
        </View>
        <View className="absolute">
          <MapReticle color={tint} size={20} />
        </View>
      </View>

      {/* Readout + confirm, above whatever the sheet is occupying. */}
      <View className="absolute left-0 right-0 px-4" style={{ bottom: bottomInset + 12 }}>
        <View className="gap-2.5 rounded-xs border border-line bg-elevated p-3.5">
          <Label className="text-muted">
            {isPickup ? 'Collection point' : isStop ? 'Stop point' : 'Drop-off point'}
          </Label>
          {resolving ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" color={tint} />
              <Txt className="text-sub text-faint">Finding the address…</Txt>
            </View>
          ) : error ? (
            // Still confirmable — this is just "no address name found here",
            // not "no pin". Confirming falls back to the coordinates.
            <Txt className="text-sub text-warning">No address here — will use the exact coordinates</Txt>
          ) : (
            <Txt className="text-callout text-fg" numberOfLines={2}>
              {address || 'Move the map to place the pin'}
            </Txt>
          )}
          <View className="flex-row gap-2.5">
            <View className="flex-1">
              <Button label="Cancel" variant="secondary" onPress={onCancel} fullWidth />
            </View>
            <View className="flex-[1.4]">
              <Button
                label={`Confirm ${noun}`}
                icon="check"
                onPress={onConfirm}
                disabled={!ready}
                fullWidth
              />
            </View>
          </View>
        </View>
      </View>
    </>
  );
}
