import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { connectLiveEvents, type LiveEvent } from '@/lib/liveEvents';
import { invalidateForServerEvent } from '@/lib/queryInvalidation';
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
};

export function useLiveEvents() {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);
  const userId = useAuthStore((s) => s.user?.id);

  useEffect(() => {
    if (!token) return;

    const handle = connectLiveEvents(token, (e: LiveEvent) => {
      // Always refresh, even for our own actions — the actor's device still
      // needs the server's version of the record.
      invalidateForServerEvent(qc, e.event);

      // The stream is company-wide and includes the person who caused the
      // event, so suppress the "you did X" toast for your own action. The
      // backend already skips the actor's bell row for the same reason.
      const actor = e.data?.actor_id;
      const isOwnAction = actor != null && String(actor) === String(userId ?? '');
      if (!e.message || isOwnAction) return;

      const label = EVENT_TITLES[e.event] ?? 'Update';
      const text = label === e.message ? label : `${label} — ${e.message}`;
      const kind = (e.data?.type ?? '').toLowerCase();
      if (kind === 'success') toast.success(text);
      else if (kind === 'alert') toast.error(text);
      else toast.info(text);
    });

    return () => handle.close();
  }, [qc, token, userId]);
}
