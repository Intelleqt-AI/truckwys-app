import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/lib/toast';
import { DEMO_BADGE_DETAIL, DEMO_FIXED_MESSAGE } from '@/lib/demoStatus';

/**
 * The shared public demo account's state, for gating write actions and for
 * the header badge. Mirrors useSubscription(): read straight off the cached
 * auth user (auth/me/ + the login response both carry `is_demo` and
 * `demo_quote_used` as plain fields), so it's correct even before the first
 * network call and needs no extra request.
 */
export function useDemo() {
  const isDemo = useAuthStore((s) => Boolean(s.user?.is_demo));
  const quoteUsed = useAuthStore((s) => Boolean(s.user?.demo_quote_used));

  return {
    isDemo,
    quoteUsed,
    /** True once this session's one free quote has been used. */
    quotaExceeded: isDemo && quoteUsed,
    /**
     * Guard for a press/save handler: `if (demo.block()) return;`. Toasts the
     * given message (default: "Fixed in demo mode") and returns true when
     * this is a demo account, so every gated call site stays a single line —
     * the control itself stays enabled (there's no hover tooltip on mobile,
     * so a dimmed dead button would just look broken).
     */
    block: (message: string = DEMO_FIXED_MESSAGE): boolean => {
      if (!isDemo) return false;
      toast.error(message);
      return true;
    },
    /** Non-null only for a demo account — for the header badge's detail copy. */
    notice: isDemo ? DEMO_BADGE_DETAIL : null,
  };
}
