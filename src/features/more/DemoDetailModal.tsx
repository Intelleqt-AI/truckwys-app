import { TouchableOpacity, Modal } from 'react-native';
// Imported from their source files, not the '@/components/ui' barrel — same
// reason as SubscriptionDetailModal: the barrel re-exports SubscriptionDot,
// which (indirectly) renders this modal, so going through the barrel here
// would close a circular import.
import { Badge, Button } from '@/components/ui/primitives';
import { Txt } from '@/components/ui/Text';
import { DEMO_BADGE_LABEL, DEMO_BADGE_DETAIL } from '@/lib/demoStatus';

/**
 * Mobile equivalent of web's header DEMO pill hover title (OSLayout.tsx) —
 * there's no hover on a phone, so the header badge opens this instead.
 */
export function DemoDetailModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
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
          <Badge label={DEMO_BADGE_LABEL} tone="warning" />
          <Txt className="text-sub text-muted">{DEMO_BADGE_DETAIL}</Txt>
          <Button label="Close" variant="ghost" fullWidth onPress={onClose} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
