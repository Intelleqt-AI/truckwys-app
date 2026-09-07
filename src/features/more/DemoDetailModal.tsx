import { Pressable, Modal } from 'react-native';
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
      <Pressable className="flex-1 justify-center bg-black/60 px-6" onPress={onClose}>
        <Pressable
          className="gap-3 rounded-md border border-line bg-elevated p-4"
          onPress={(e) => e.stopPropagation()}
        >
          <Badge label={DEMO_BADGE_LABEL} tone="warning" shape="pill" />
          <Txt className="text-sub text-muted">{DEMO_BADGE_DETAIL}</Txt>
          <Button label="Close" variant="ghost" fullWidth onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
