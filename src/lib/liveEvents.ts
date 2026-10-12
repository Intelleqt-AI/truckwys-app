import { AppState } from 'react-native';
import { apiOrigin } from '@/lib/api/client';
import type { Visibility } from '@/lib/liveRefresh';
import { createLiveSocket, type SocketLike } from '@/lib/liveSocket';

// Real-time company event stream — the mobile port of the web app's
// LiveEvents component. Without it the phone only ever converged on fresh data
// via pull-to-refresh: a change made by a teammate, or on the web dashboard,
// never arrived on its own.
//
// Server contract (core/ws/): connect to /ws/events/?token=<DRF token> — the
// token goes in the query string because WebSockets can't carry custom headers
// — then every company event arrives as
//   {type:'event', event, message, data:{title,message,link,type,actor_id,category,event_id}}
// The consumer also answers {type:'ping'} with {type:'pong'}, and closes with
// 4401 (bad token) or 4403 (no company).
//
// On connect the server sends {type:'connected', company_id}. Separately, every
// save/delete of a screen's data (invoice, payment, expense, quote, load, trip,
// vehicle, driver, customer, advance) pushes
//   {type:'event', event:'data.changed', message:'', data:{topics:[...], ids:{topic:[id,...]}}}
// to the whole company, including the person who made the change. Those carry no
// toast text; they exist only so open screens can refetch.

export interface LiveEvent {
  type: 'event';
  event: string;
  message?: string;
  data?: {
    title?: string;
    message?: string;
    link?: string;
    type?: string;
    actor_id?: number | string | null;
    category?: string | null;
    event_id?: string;
    /** data.changed only: which kinds of record changed (sorted). */
    topics?: string[];
    /** data.changed only: at most 20 ids per topic. */
    ids?: Record<string, Array<number | string>>;
  };
}

const PING_INTERVAL_MS = 25_000;
// Auth failures aren't retryable: the token is dead or the user has no company,
// so reconnecting in a loop just hammers the server until sign-in changes.
const FATAL_CLOSE_CODES = [4401, 4403];

function wsUrl(token: string): string {
  const base = apiOrigin.replace(/^http/, 'ws');
  return `${base}/ws/events/?token=${encodeURIComponent(token)}`;
}

/**
 * "Hidden" = the app is in the background: no reconnecting there (the OS has
 * usually suspended the socket anyway), one reconnect when it is foregrounded.
 * 'inactive' (iOS control centre, app switcher peek) is not hidden.
 */
export const appVisibility: Visibility = {
  isHidden: () => AppState.currentState === 'background',
  onVisible: (cb) => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') cb();
    });
    return () => sub.remove();
  },
};

export interface LiveEventsHandle {
  close: () => void;
}

/**
 * Open the event stream and call `onEvent` for each event frame.
 * `onReconnect` fires when the socket is open again after a gap: changes
 * pushed while it was down were missed, so the caller should refetch
 * everything once. It is throttled (at most once a minute however often the
 * socket flaps), because every call is a refetch of every open screen.
 * Reconnects with capped, jittered backoff that only resets once a socket has
 * stayed up for a while (lib/liveSocket.ts). Never throws.
 */
export function connectLiveEvents(
  token: string,
  onEvent: (e: LiveEvent) => void,
  onReconnect?: () => void,
): LiveEventsHandle {
  // The same event can arrive twice (a reconnect can replay, and a push may
  // cover the same change) — event_id is a per-event uuid, so it dedupes.
  const seen = new Set<string>();

  const socket = createLiveSocket({
    url: () => (token ? wsUrl(token) : null),
    createSocket: (url) => new WebSocket(url) as unknown as SocketLike,
    pingMs: PING_INTERVAL_MS,
    visibility: appVisibility,
    isFatalClose: (ev) => {
      const code = (ev as { code?: number } | undefined)?.code;
      return !!code && FATAL_CLOSE_CODES.includes(code);
    },
    onReconnect: () => {
      try {
        onReconnect?.();
      } catch {
        /* a consumer error must not break the stream */
      }
    },
    onMessage: (data) => {
      let msg: LiveEvent | { type?: string };
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      // 'connected' (server joined us to the company group) and 'pong' carry nothing to act on.
      if (!msg || msg.type !== 'event') return;
      const evt = msg as LiveEvent;
      const eventId = evt.data?.event_id;
      if (eventId) {
        if (seen.has(eventId)) return;
        seen.add(eventId);
        // Bound the set so a long session can't grow it without limit.
        if (seen.size > 500) seen.clear();
      }
      onEvent(evt);
    },
  });
  socket.start();

  return { close: () => socket.stop() };
}
