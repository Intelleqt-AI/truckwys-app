import { View, TouchableOpacity, Modal } from 'react-native';
// Imported from their source files, not the '@/components/ui' barrel: that
// barrel re-exports SubscriptionDot, which imports this modal — going
// through the barrel here would close a circular import.
import { Badge, Button } from '@/components/ui/primitives';
import { Txt } from '@/components/ui/Text';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { useRole } from '@/lib/access';
import { useGracePeriod, useSubscription } from '@/hooks/useSubscription';
import { formatDate } from '@/lib/formatters';

/**
 * Mobile equivalent of the web top-bar status badge's hover popover
 * (OSLayout.tsx) — there's no hover on a phone, so the header pill opens this
 * instead. Read-only: the "View billing" button opens the app's own Settings →
 * Billing screen, never an external purchase flow (App Store 3.1.1).
 */
export function SubscriptionDetailModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const subscription = useSubscription();
  const { daysRemaining, expiresAt } = useGracePeriod(subscription.status, subscription.visible);
  const role = useRole();
  const { nav } = useAppNavigation();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        activeOpacity={1}
        className="flex-1 justify-center bg-backdrop px-6"
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        {/* Swallows taps on the card so only the backdrop dismisses. */}
        <TouchableOpacity
          activeOpacity={1}
          accessible={false}
          className="gap-3 rounded-panel border border-line bg-elevated p-4"
          onPress={() => {}}
        >
          <Badge label={subscription.label} tone={subscription.tone} dot />
          <Txt className="text-sub text-muted">{subscription.detail}</Txt>
          {subscription.status === 'grace_period' && daysRemaining !== undefined && (
            <Txt className="text-sub text-fg">
              {daysRemaining} day{daysRemaining === 1 ? '' : 's'} left before suspension
              {expiresAt ? ` (${formatDate(expiresAt)})` : ''}.
            </Txt>
          )}
          <View className="mt-1 gap-2">
            {role === 'ADMIN' && (
              <Button
                label="View billing"
                variant="secondary"
                fullWidth
                onPress={() => {
                  onClose();
                  nav.navigate('Settings', { section: 'billing' });
                }}
              />
            )}
            <Button label="Close" variant="ghost" fullWidth onPress={onClose} />
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
