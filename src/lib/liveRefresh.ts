/**
 * Coalesced, back-off-aware refresh for anything a live event wakes up. Port of
 * the web app's lib/liveRefresh.ts (web 0ebb24e, "stop the live-update request
 * storm"), with the app's foreground/background standing in for tab visibility.
 *
 * A live push must never map 1:1 onto HTTP requests: an import or batch can push
 * dozens of events a second, and a refetch per event burns through the API read
 * throttle (429s on every other screen). Every listener goes through one of
 * these instead:
 *
 *  - trailing debounce with a max wait: a burst becomes ONE refresh;
 *  - single flight: never two refreshes of the same thing at once, and a
 *    request that lands mid-flight becomes one follow-up, not one per event;
 *  - a minimum gap between refreshes;
 *  - exponential backoff after a failure (longer still on 429), with a small
 *    retry cap, so an erroring API is not hammered;
 *  - nothing runs while the app is in the background: the refresh is held and
 *    runs once when it is foregrounded again.
 *
 * Plain TS with an injectable clock/visibility so it is unit-tested in node
 * (src/lib/__tests__/liveRefresh.test.mjs). No React Native imports here.
 */

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface Visibility {
  isHidden(): boolean;
  /** Subscribe to "became visible"; returns an unsubscribe. */
  onVisible(cb: () => void): () => void;
}

/** Default when the caller has no notion of background (tests, web-like use). */
export const alwaysVisible: Visibility = {
  isHidden: () => false,
  onVisible: () => () => {},
};

export interface CoalescedRefreshOptions {
  /** Quiet period after the last request before running (default 750ms). */
  debounceMs?: number;
  /** A steady stream of requests still runs at least this often (default 5s). */
  maxWaitMs?: number;
  /** Minimum gap between the start of two runs (default 2s). */
  minIntervalMs?: number;
  /** First backoff after a failure; doubles per consecutive failure (default 2s). */
  backoffBaseMs?: number;
  /** Backoff ceiling (default 60s). */
  backoffMaxMs?: number;
  /** Floor for the backoff after an HTTP 429 (default 30s). */
  throttledBackoffMs?: number;
  /** Automatic retries after consecutive failures before waiting for a new request (default 3). */
  maxRetries?: number;
  clock?: Clock;
  visibility?: Visibility;
}

export interface CoalescedRefresh {
  /** Ask for a refresh. Cheap to call any number of times. */
  request(opts?: { immediate?: boolean }): void;
  dispose(): void;
}

export function createCoalescedRefresh(
  run: () => unknown,
  options: CoalescedRefreshOptions = {},
): CoalescedRefresh {
  const {
    debounceMs = 750,
    maxWaitMs = 5000,
    minIntervalMs = 2000,
    backoffBaseMs = 2000,
    backoffMaxMs = 60000,
    throttledBackoffMs = 30000,
    maxRetries = 3,
    clock = realClock,
    visibility = alwaysVisible,
  } = options;

  let pending = false;
  let immediate = false;
  let firstRequestAt = 0;
  let timer: unknown = null;
  let inFlight = false;
  let failures = 0;
  let nextAllowedAt = 0;
  let disposed = false;
  let unsubscribeVisible: (() => void) | null = null;

  const clearTimer = () => {
    if (timer != null) {
      clock.clearTimeout(timer);
      timer = null;
    }
  };

  const waitForVisible = () => {
    if (unsubscribeVisible) return;
    unsubscribeVisible = visibility.onVisible(() => {
      unsubscribeVisible?.();
      unsubscribeVisible = null;
      schedule();
    });
  };

  const schedule = () => {
    if (disposed || !pending || inFlight) return;
    if (visibility.isHidden()) {
      clearTimer();
      waitForVisible();
      return;
    }
    const now = clock.now();
    const debounced = immediate ? now : Math.min(now + debounceMs, firstRequestAt + maxWaitMs);
    const fireAt = Math.max(debounced, nextAllowedAt);
    clearTimer();
    timer = clock.setTimeout(fire, Math.max(0, fireAt - now));
  };

  const fire = async () => {
    timer = null;
    if (disposed || !pending || inFlight) return;
    if (visibility.isHidden()) {
      waitForVisible();
      return;
    }
    pending = false;
    immediate = false;
    inFlight = true;
    try {
      await run();
      failures = 0;
      nextAllowedAt = clock.now() + minIntervalMs;
    } catch (err) {
      failures += 1;
      let wait = Math.min(backoffMaxMs, backoffBaseMs * 2 ** (failures - 1));
      if ((err as { status?: number } | null)?.status === 429) wait = Math.max(wait, throttledBackoffMs);
      nextAllowedAt = clock.now() + wait;
      // Retry a few times with backoff; after that wait for the next real request.
      if (failures <= maxRetries && !pending) {
        pending = true;
        firstRequestAt = clock.now();
      }
    } finally {
      inFlight = false;
    }
    schedule();
  };

  return {
    request(opts) {
      if (disposed) return;
      if (!pending) firstRequestAt = clock.now();
      pending = true;
      if (opts?.immediate) immediate = true;
      schedule();
    },
    dispose() {
      disposed = true;
      clearTimer();
      unsubscribeVisible?.();
      unsubscribeVisible = null;
    },
  };
}
