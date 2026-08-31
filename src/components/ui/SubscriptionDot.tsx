import { useState } from 'react';
import { Pressable } from 'react-native';
import { Badge, LiveDot } from './primitives';
import { useSubscription } from '@/hooks/useSubscription';
import { SubscriptionDetailModal } from '@/features/more/SubscriptionDetailModal';

/**
 * Replaces AppHeader's hardcoded "Live" dot with the truth: the pulsing blue
 * Live indicator stays for a healthy account, but a role-visible subscription
 * state (trial, overdue, cancelling, suspended, cancelled) takes over the same
 * slot, tappable for detail. Fixes the header claiming "Live" while the web
 * app's equivalent badge already says OVERDUE/SUSPENDED (OSLayout.tsx).
 */
export function SubscriptionDot() {
  const subscription = useSubscription();
  const [open, setOpen] = useState(false);

  if (!subscription.visible) return <LiveDot label="Live" />;

  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={8}>
        <Badge label={subscription.label} tone={subscription.tone} shape="pill" dot />
      </Pressable>
      <SubscriptionDetailModal visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
