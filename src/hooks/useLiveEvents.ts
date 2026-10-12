import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { appVisibility, connectLiveEvents, type LiveEvent } from '@/lib/liveEvents';
import { createCoalescedRefresh } from '@/lib/liveRefresh';
import { ALL_DATA_TOPICS, invalidateForServerEvents, invalidateForTopics } from '@/lib/queryInvalidation';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/lib/toast';

// Mounted once for a signed-in session. Turns each pushed company event into a
// cache invalidation (so every open screen shows the change within a second)
// plus a toast — the same split the web app uses.

const EVENT_TITLES: Record<string, string> = {
  'booking.created': 'New booking',
  'booking.assigned': 'Booking assigned',
  'booking.in_transit': 'Booking in transit',
  'booking.delivered': 'Booking delivered',
  'booking.cancelled': 'Booking cancelled',
  'quote.created': 'New quote',
  'quote.sent': 'Quote sent',
  'quote.accepted': 'Quote accepted',
  'quote.declined': 'Quote declined',
  'quote.completed': 'Quote completed',
  'quote.expired': 'Quote expired',
  'quote.fuel_alert': 'Fuel price alert',
  'quote.expiring': 'Quote expiring soon',
  'quote.no_answer': 'No answer yet',
  'invoice.auto_created': 'Invoice raised',
  'invoice.paid': 'Invoice paid',
  'invoice.overdue': 'Invoice overdue',
  'invoice.status': 'Invoice updated',
  'payment.received': 'Payment received',
  'maintenance.due': 'Maintenance due',
  'driver.status_changed': 'Driver update',
  'advance.approved': 'Advance approved',
  'advance.disbursed': 'Funds disbursed',
  'customer.created': 'New customer',
  'subscription.suspended': 'Subscription suspended',
  'subscription.reactivated': 'Subscription reactivated',
  'subscription.cancelled': 'Subscription cancelled',
};

// Events whose title and body the backend words precisely; the toast uses them as is.
const SERVER_WORDED_EVENTS = new Set([
  'invoice.auto_created',
  // Quote follow-ups: "Diesel price up", "Quote expiring soon", "No answer yet"
  // with the backend's own sentence as the body.
  'quote.fuel_alert',
  'quote.expiring',
  'quote.no_answer',
]);

// A burst waits 250 ms for its last event, a steady stream still flushes every
// 2 s, and two flushes never start less than 2 s apart (the web's own numbers).
const DATA_CHANGED_DEBOUNCE_MS = 250;
const DATA_CHANGED_MAX_WAIT_MS = 2000;
const DATA_CHANGED_MIN_INTERVAL_MS = 2000;

export function useLiveEvents() {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);
  const userId = useAuthStore((s) => s.user?.id);

  // Re-read the user whenever the app comes back to the foreground. The socket
  // covers changes while the app is open, but a suspension that happened while
  // it was backgrounded would otherwise leave quoting enabled against a
  // subscription the server has already gated — the client would let the user
  // fill in a whole quote and then take a 403 on save. Mirrors the web app's
  // resync on tab focus.
  useEffect(() => {
    if (!token) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void useAuthStore.getState().refreshUser();
    });
    return () => sub.remove();
  }, [token]);

  useEffect(() => {
    if (!token) return;

    // Live pushes never map 1:1 onto requests (web 0ebb24e). data.changed pushes
    // arrive in bursts (a payment fires invoice + payment, a delivery fires load
    // + invoice + trip; an import fires dozens), and each invalidation refetches
    // every open screen's queries. So topics and named events are collected and
    // invalidated together: a burst is one pass, and passes are spaced out.
    const pendingTopics = new Set<string>();
    const pendingNamed = new Set<string>();
    const refresh = createCoalescedRefresh(
      () => {
        const topics = [...pendingTopics];
        const named = [...pendingNamed];
        pendingTopics.clear();
        pendingNamed.clear();
        if (topics.length) invalidateForTopics(qc, topics);
        if (named.length) invalidateForServerEvents(qc, named);
      },
      {
        debounceMs: DATA_CHANGED_DEBOUNCE_MS,
        maxWaitMs: DATA_CHANGED_MAX_WAIT_MS,
        minIntervalMs: DATA_CHANGED_MIN_INTERVAL_MS,
        visibility: appVisibility,
      },
    );

    const handle = connectLiveEvents(
      token,
      (e: LiveEvent) => {
        if (e.event === 'data.changed') {
          // Always refresh, including for our own change: the server's version
          // of the record is the one to show. Never toasts.
          for (const t of e.data?.topics ?? []) pendingTopics.add(t);
          refresh.request();
          return;
        }
        handleNamedEvent(e);
      },
      () => {
        // The socket is back after a gap: pushes sent while it was down are
        // gone for good. Already throttled to once a minute by the socket.
        for (const t of ALL_DATA_TOPICS) pendingTopics.add(t);
        refresh.request();
      },
    );

    function handleNamedEvent(e: LiveEvent) {
      // Always refresh, even for our own actions — the actor's device still
      // needs the server's version of the record.
      pendingNamed.add(e.event);
      refresh.request();

      // subscription_status rides on the auth user, not on a query, so cache
      // invalidation alone can't refresh it — and it gates quoting and
      // invoicing. Re-read it so a recharge or a suspension takes effect
      // without the user relaunching.
      if (e.event.startsWith('subscription.')) {
        void useAuthStore.getState().refreshUser();
      }

      // The stream is company-wide and includes the person who caused the
      // event, so suppress the "you did X" toast for your own action. The
      // backend already skips the actor's bell row for the same reason.
      const actor = e.data?.actor_id;
      const isOwnAction = actor != null && String(actor) === String(userId ?? '');
      if (!e.message || isOwnAction) return;

      // The server's own wording is exact for these: an auto-created invoice is
      // now either emailed on delivery or left as a draft to review, so a fixed
      // "Invoice raised" label would sometimes be wrong.
      const label = SERVER_WORDED_EVENTS.has(e.event) ? '' : (EVENT_TITLES[e.event] ?? 'Update');
      const body = e.data?.message && e.data.message !== e.message ? e.data.message : '';
      const detail = [e.message, body].filter(Boolean).join(': ');
      const text = !label || label === e.message ? detail || label : `${label}: ${e.message}`;
      const kind = (e.data?.type ?? '').toLowerCase();
      if (kind === 'success') toast.success(text);
      else if (kind === 'alert') toast.error(text);
      else toast.info(text);
    }

    return () => {
      refresh.dispose();
      handle.close();
    };
  }, [qc, token, userId]);
}
