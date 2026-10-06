import { useState } from 'react';
import { TouchableOpacity } from 'react-native';
import { Badge, LiveDot } from './primitives';
import { useSubscription } from '@/hooks/useSubscription';
import { useDemo } from '@/hooks/useDemo';
import { SubscriptionDetailModal } from '@/features/more/SubscriptionDetailModal';
import { DemoDetailModal } from '@/features/more/DemoDetailModal';
import { DEMO_BADGE_LABEL } from '@/lib/demoStatus';

// The badge is ~22 tall; pad the hit area up to TAP_MIN (web rule R7).
const HIT_SLOP = { top: 11, bottom: 11, left: 8, right: 8 };

/**
 * Replaces AppHeader's hardcoded "Live" dot with the truth: the static Live
 * indicator stays for a healthy account, but a role-visible subscription
 * state (trial, overdue, cancelling, suspended, cancelled) takes over the same
 * slot, tappable for detail. Fixes the header claiming "Live" while the web
 * app's equivalent badge already says OVERDUE/SUSPENDED (OSLayout.tsx).
 *
 * Demo takes priority over both: the seeded demo company is deliberately kept
 * `subscription_status: 'active'` so quoting/invoicing work, which means
 * `subscription.visible` is false and this slot would otherwise claim "Live"
 * on a shared public demo account — exactly the bug this component exists to
 * fix for OVERDUE/SUSPENDED.
 */
export function SubscriptionDot() {
  const subscription = useSubscription();
  const demo = useDemo();
  const [open, setOpen] = useState(false);

  if (demo.isDemo) {
    return (
      <>
        <TouchableOpacity
          onPress={() => setOpen(true)}
          hitSlop={HIT_SLOP}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${DEMO_BADGE_LABEL}, demo account details`}
        >
          <Badge label={DEMO_BADGE_LABEL} tone="warning" dot />
        </TouchableOpacity>
        <DemoDetailModal visible={open} onClose={() => setOpen(false)} />
      </>
    );
  }

  if (!subscription.visible) return <LiveDot label="Live" />;

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        hitSlop={HIT_SLOP}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Subscription status, ${subscription.label}`}
      >
        <Badge label={subscription.label} tone={subscription.tone} dot />
      </TouchableOpacity>
      <SubscriptionDetailModal visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
