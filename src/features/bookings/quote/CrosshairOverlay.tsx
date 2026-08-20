import { View, ActivityIndicator } from 'react-native';
import { Button, Icon, Label, Mono, Txt } from '@/components/ui';
import { MapPin, MapReticle } from './MapPin';
import { status as statusHues } from '@/theme/tokens';

export type PickTarget = 'pickup' | 'dropoff';

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
  onConfirm,
  onCancel,
  bottomInset,
}: {
  target: PickTarget;
  /** Resolved address for the current centre, once known. */
  address?: string | null;
  resolving?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  bottomInset: number;
}) {
  const isPickup = target === 'pickup';
  const tint = isPickup ? statusHues.success : statusHues.danger;

  return (
    <>
      {/* Chip naming the end being set. pointerEvents none — the whole map
          surface has to stay draggable, including under the chrome. */}
      <View className="absolute left-0 right-0 top-0 items-center pt-3" pointerEvents="none">
        <View
          className="flex-row items-center gap-2 rounded-pill border border-line bg-bg-deep/90 px-3.5 py-2"
          style={{ borderColor: tint }}
        >
          <Icon name="pin" size={14} color={tint} />
          <Mono className="text-micro tracking-wide uppercase" style={{ color: tint }}>
            {isPickup ? 'Set collection' : 'Set drop-off'}
          </Mono>
        </View>
      </View>

      {/* Pin and reticle both centred on the map's centre. The pin's tip is
          the point, so it is lifted by its own height; the reticle sits exactly
          on the spot and stays readable while the map is moving. */}
      <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
        <View style={{ transform: [{ translateY: -28 }] }}>
          <MapPin color={tint} size={40} />
        </View>
        <View className="absolute">
          <MapReticle color={tint} size={20} />
        </View>
      </View>

      {/* Readout + confirm, above whatever the sheet is occupying. */}
      <View className="absolute left-0 right-0 px-4" style={{ bottom: bottomInset + 12 }}>
        <View className="gap-2.5 rounded-xs border border-line bg-elevated p-3.5">
          <Label className="text-muted">{isPickup ? 'Collection point' : 'Drop-off point'}</Label>
          {resolving ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" color={tint} />
              <Txt className="text-sub text-faint">Finding the address…</Txt>
            </View>
          ) : error ? (
            <Txt className="text-sub text-danger">{error}</Txt>
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
                label={isPickup ? 'Confirm collection' : 'Confirm drop-off'}
                icon="check"
                onPress={onConfirm}
                disabled={!address || !!resolving}
                fullWidth
              />
            </View>
          </View>
        </View>
      </View>
    </>
  );
}
