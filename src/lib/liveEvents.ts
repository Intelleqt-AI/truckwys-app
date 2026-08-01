import { apiOrigin } from '@/lib/api/client';

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
  };
}

const RECONNECT_CAP_MS = 30_000;
const PING_INTERVAL_MS = 25_000;
// Auth failures aren't retryable: the token is dead or the user has no company,
// so reconnecting in a loop just hammers the server until sign-in changes.
const FATAL_CLOSE_CODES = [4401, 4403];

function wsUrl(token: string): string {
  const base = apiOrigin.replace(/^http/, 'ws');
  return `${base}/ws/events/?token=${encodeURIComponent(token)}`;
}

export interface LiveEventsHandle {
  close: () => void;
}

/**
 * Open the event stream and call `onEvent` for each event frame.
 * Reconnects with capped exponential backoff. Never throws.
 */
export function connectLiveEvents(token: string, onEvent: (e: LiveEvent) => void): LiveEventsHandle {
  let socket: WebSocket | null = null;
  let stopped = false;
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  // The same event can arrive twice (a reconnect can replay, and a push may
  // cover the same change) — event_id is a per-event uuid, so it dedupes.
  const seen = new Set<string>();

  const clearTimers = () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (pingTimer) clearInterval(pingTimer);
    reconnectTimer = null;
    pingTimer = null;
  };

  const connect = () => {
    if (stopped || !token) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl(token));
    } catch {
      return;
    }
    socket = ws;

    ws.onopen = () => {
      attempt = 0;
      // Keeps intermediaries from dropping an idle connection.
      pingTimer = setInterval(() => {
        try {
          ws.send(JSON.stringify({ type: 'ping' }));
        } catch {
          /* the close handler will deal with it */
        }
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (e: WebSocketMessageEvent) => {
      let msg: LiveEvent | { type?: string };
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (!msg || msg.type !== 'event') return; // 'connected' / 'pong'
      const evt = msg as LiveEvent;
      const eventId = evt.data?.event_id;
      if (eventId) {
        if (seen.has(eventId)) return;
        seen.add(eventId);
        // Bound the set so a long session can't grow it without limit.
        if (seen.size > 500) seen.clear();
      }
      onEvent(evt);
    };

    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* noop */
      }
    };

    ws.onclose = (e: WebSocketCloseEvent) => {
      socket = null;
      clearTimers();
      if (stopped) return;
      if (e?.code && FATAL_CLOSE_CODES.includes(e.code)) return;
      const delay = Math.min(RECONNECT_CAP_MS, 1000 * 2 ** attempt);
      attempt += 1;
      reconnectTimer = setTimeout(connect, delay);
    };
  };

  connect();

  return {
    close: () => {
      stopped = true;
      clearTimers();
      try {
        socket?.close();
      } catch {
        /* noop */
      }
      socket = null;
    },
  };
}
