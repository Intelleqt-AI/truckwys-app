/**
 * The reconnect loop behind lib/liveEvents.ts, kept free of React Native so it
 * is unit-tested in node (src/lib/__tests__/liveRefresh.test.mjs). Port of the
 * web app's lib/liveSocket.ts (web 0ebb24e).
 *
 * What it guards against (each of these was a request storm in production):
 *  - A socket that opens and then drops straight away (proxy, channel layer or
 *    server hiccup) used to reset the backoff on open, so it reconnected every
 *    ~1s forever, and every reopen refetched every live query on screen. The
 *    backoff now only resets once a socket has stayed up STABLE_MS.
 *  - The "catch up after a gap" refresh (onReconnect) runs at most once per
 *    catchUpMinMs, however often the socket flaps.
 *  - No reconnecting while the app is in the background; it reconnects when
 *    foregrounded.
 *  - Jittered backoff so many devices don't reconnect in lock-step.
 *  - A ping every pingMs keeps idle proxies from cutting the socket.
 */
import type { Clock, Visibility } from './liveRefresh';

// Local defaults (not imported from liveRefresh) so this file stays runnable
// under node's type stripping, which can't resolve extensionless imports.
const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};
const alwaysVisible: Visibility = { isHidden: () => false, onVisible: () => () => {} };

export interface SocketLike {
  onopen: ((ev?: unknown) => void) | null;
  onclose: ((ev?: unknown) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  readyState: number;
  send(data: string): void;
  close(): void;
}

export interface LiveSocketOptions {
  url: () => string | null;
  createSocket: (url: string) => SocketLike;
  onMessage: (data: unknown) => void;
  /** The socket is open again after a gap: refresh whatever may have been missed. Throttled. */
  onReconnect?: () => void;
  onClose?: () => void;
  /** A close that retrying can't fix (bad token, no company): stop for good. */
  isFatalClose?: (ev: unknown) => boolean;
  baseDelayMs?: number;
  maxDelayMs?: number;
  stableMs?: number;
  catchUpMinMs?: number;
  pingMs?: number;
  random?: () => number;
  clock?: Clock;
  visibility?: Visibility;
}

export interface LiveSocket {
  start(): void;
  stop(): void;
}

const OPEN = 1;

export function createLiveSocket(opts: LiveSocketOptions): LiveSocket {
  const {
    url,
    createSocket,
    onMessage,
    onReconnect,
    onClose,
    isFatalClose,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    stableMs = 15000,
    catchUpMinMs = 60000,
    pingMs = 25000,
    random = Math.random,
    clock = realClock,
    visibility = alwaysVisible,
  } = opts;

  let ws: SocketLike | null = null;
  let stopped = true;
  let attempt = 0;
  let hadGap = false;
  let openedAt = 0;
  let lastCatchUpAt = -Infinity;
  let retryTimer: unknown = null;
  let pingTimer: unknown = null;
  let catchUpTimer: unknown = null;
  let unsubscribeVisible: (() => void) | null = null;

  const clear = (h: unknown) => {
    if (h != null) clock.clearTimeout(h);
  };

  const catchUp = () => {
    if (!onReconnect) return;
    const now = clock.now();
    const wait = lastCatchUpAt + catchUpMinMs - now;
    if (wait <= 0) {
      lastCatchUpAt = now;
      onReconnect();
      return;
    }
    // Flapping: one deferred catch-up, never one per reopen.
    if (catchUpTimer == null) {
      catchUpTimer = clock.setTimeout(() => {
        catchUpTimer = null;
        if (!stopped && ws && ws.readyState === OPEN) {
          lastCatchUpAt = clock.now();
          onReconnect();
        } else hadGap = true; // still down: catch up on the next open
      }, wait);
    }
  };

  const schedulePing = () => {
    clear(pingTimer);
    pingTimer = clock.setTimeout(() => {
      pingTimer = null;
      if (ws && ws.readyState === OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'ping' }));
        } catch {
          /* the close handler will deal with it */
        }
        schedulePing();
      }
    }, pingMs);
  };

  const scheduleReconnect = () => {
    if (stopped || retryTimer != null) return;
    if (visibility.isHidden()) {
      if (!unsubscribeVisible) {
        unsubscribeVisible = visibility.onVisible(() => {
          unsubscribeVisible?.();
          unsubscribeVisible = null;
          scheduleReconnect();
        });
      }
      return;
    }
    const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
    const delay = ceiling * (0.5 + 0.5 * random());
    attempt += 1;
    retryTimer = clock.setTimeout(() => {
      retryTimer = null;
      connect();
    }, delay);
  };

  const connect = () => {
    if (stopped || ws) return;
    const u = url();
    if (!u) return; // signed out: nothing to connect to
    let sock: SocketLike;
    try {
      sock = createSocket(u);
    } catch {
      scheduleReconnect();
      return;
    }
    ws = sock;
    let opened = false;
    let closed = false;

    sock.onopen = () => {
      if (sock !== ws) return;
      opened = true;
      openedAt = clock.now();
      schedulePing();
      if (hadGap) {
        hadGap = false;
        catchUp();
      }
    };
    sock.onmessage = (e) => {
      if (sock === ws) onMessage(e.data);
    };
    sock.onclose = (ev) => {
      if (closed) return;
      closed = true;
      if (sock !== ws) return;
      ws = null;
      clear(pingTimer);
      pingTimer = null;
      onClose?.();
      if (stopped) return;
      if (isFatalClose?.(ev)) {
        stopped = true;
        return;
      }
      hadGap = true;
      // Only a socket that stayed up for a while earns a fresh backoff.
      if (opened && clock.now() - openedAt >= stableMs) attempt = 0;
      scheduleReconnect();
    };
    sock.onerror = () => {
      try {
        sock.close();
      } catch {
        /* noop */
      }
      sock.onclose?.();
    };
  };

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      connect();
    },
    stop() {
      stopped = true;
      clear(retryTimer);
      retryTimer = null;
      clear(pingTimer);
      pingTimer = null;
      clear(catchUpTimer);
      catchUpTimer = null;
      unsubscribeVisible?.();
      unsubscribeVisible = null;
      const s = ws;
      ws = null;
      if (s) {
        try {
          s.close();
        } catch {
          /* noop */
        }
      }
    },
  };
}
