// Live updates must have bounded request counts: a burst of live events, a
// failing API, a websocket that can't connect, and one that keeps flapping.
// Same cases as the web's scripts/test-live-refresh.mjs (web 0ebb24e).
//   node --experimental-strip-types --test src/lib/__tests__/liveRefresh.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCoalescedRefresh } from '../liveRefresh.ts';
import { createLiveSocket } from '../liveSocket.ts';

// ---- fake clock + visibility -------------------------------------------
function makeEnv() {
  let now = 0;
  let seq = 0;
  const timers = new Map();
  let hidden = false;
  const visibleSubs = new Set();
  const clock = {
    now: () => now,
    setTimeout: (fn, ms) => {
      const id = ++seq;
      timers.set(id, { at: now + Math.max(0, ms), fn, id });
      return id;
    },
    clearTimeout: (id) => {
      timers.delete(id);
    },
  };
  const visibility = {
    isHidden: () => hidden,
    onVisible: (cb) => {
      visibleSubs.add(cb);
      return () => visibleSubs.delete(cb);
    },
  };
  const tick = () => new Promise((r) => setImmediate(r));
  async function advanceTo(target) {
    for (;;) {
      await tick();
      let next = null;
      for (const t of timers.values()) {
        if (t.at <= target && (!next || t.at < next.at || (t.at === next.at && t.id < next.id))) next = t;
      }
      if (!next) break;
      timers.delete(next.id);
      now = next.at;
      next.fn();
    }
    now = target;
    await tick();
  }
  return {
    clock,
    visibility,
    advance: (ms) => advanceTo(now + ms),
    setHidden: (h) => {
      hidden = h;
      if (!h) for (const cb of [...visibleSubs]) cb();
    },
  };
}

const MIN = 60_000;

test('a burst of live events is a handful of refreshes, not one each', async () => {
  const env = makeEnv();
  let runs = 0;
  const r = createCoalescedRefresh(() => {
    runs++;
  }, { clock: env.clock, visibility: env.visibility });
  for (let i = 0; i < 200; i++) {
    r.request();
    await env.advance(50); // 200 events in 10 s
  }
  await env.advance(10_000);
  assert.ok(runs <= 4, `burst: ${runs} runs`);
  assert.ok(runs >= 1, 'burst still refreshes');
  const afterBurst = runs;
  await env.advance(2 * MIN);
  assert.equal(runs, afterBurst, 'idle: no runs');
  r.dispose();
});

test('a refresh in flight absorbs every event that lands meanwhile', async () => {
  const env = makeEnv();
  let runs = 0;
  let concurrent = 0;
  let maxConcurrent = 0;
  const r = createCoalescedRefresh(
    async () => {
      runs++;
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((res) => env.clock.setTimeout(res, 4000)); // slow API
      concurrent--;
    },
    { clock: env.clock, visibility: env.visibility },
  );
  r.request({ immediate: true });
  await env.advance(10);
  for (let i = 0; i < 50; i++) {
    r.request();
    await env.advance(50);
  }
  await env.advance(30_000);
  assert.equal(maxConcurrent, 1, 'single flight');
  assert.equal(runs, 2, 'one follow-up for everything that arrived mid-flight');
  r.dispose();
});

for (const status of [429, 500]) {
  test(`a failing API (${status}) backs off under a constant event stream`, async () => {
    const env = makeEnv();
    let runs = 0;
    const r = createCoalescedRefresh(
      () => {
        runs++;
        throw Object.assign(new Error('fail'), { status });
      },
      { clock: env.clock, visibility: env.visibility },
    );
    for (let t = 0; t < 10 * MIN; t += 200) {
      r.request(); // an event every 200 ms for 10 minutes = 3,000 events
      await env.advance(200);
    }
    const bound = status === 429 ? 22 : 16;
    assert.ok(runs <= bound, `${status}: ${runs} runs in 10 min`);
    r.dispose();
  });
}

test('retries after a failure are capped without new events', async () => {
  const env = makeEnv();
  let runs = 0;
  const r = createCoalescedRefresh(
    () => {
      runs++;
      throw Object.assign(new Error('x'), { status: 503 });
    },
    { clock: env.clock, visibility: env.visibility },
  );
  r.request({ immediate: true });
  await env.advance(30 * MIN);
  assert.equal(runs, 4, '1 run + 3 backed-off retries, then it waits for the next event');
  r.dispose();
});

test('backgrounded: nothing runs; one refresh when foregrounded again', async () => {
  const env = makeEnv();
  let runs = 0;
  const r = createCoalescedRefresh(() => {
    runs++;
  }, { clock: env.clock, visibility: env.visibility });
  env.setHidden(true);
  for (let i = 0; i < 100; i++) {
    r.request();
    await env.advance(1000);
  }
  assert.equal(runs, 0, 'no refresh while hidden');
  env.setHidden(false);
  await env.advance(5000);
  assert.equal(runs, 1, 'exactly one catch-up refresh when shown');
  r.dispose();
});

// ---- websocket fakes ------------------------------------------------------
function socketHarness(env, behaviour) {
  const stats = { created: 0, catchUps: 0, pings: 0 };
  const createSocket = () => {
    stats.created++;
    const s = {
      readyState: 0,
      onopen: null,
      onclose: null,
      onerror: null,
      onmessage: null,
      send: (d) => {
        if (JSON.parse(d).type === 'ping') stats.pings++;
      },
      close: () => {
        if (s.readyState === 3) return;
        s.readyState = 3;
        env.clock.setTimeout(() => s.onclose?.(), 0);
      },
    };
    behaviour(s);
    return s;
  };
  return { stats, createSocket };
}
const refused = (env) => (s) =>
  env.clock.setTimeout(() => {
    s.readyState = 3;
    s.onerror?.();
  }, 5);
const flapping = (env) => (s) =>
  env.clock.setTimeout(() => {
    s.readyState = 1;
    s.onopen?.();
    env.clock.setTimeout(() => s.close(), 200); // accepted, then dropped
  }, 5);

test("a websocket that can't connect backs off to one try per ~30 s", async () => {
  const env = makeEnv();
  const { stats, createSocket } = socketHarness(env, refused(env));
  const sock = createLiveSocket({
    url: () => 'ws://x/ws/events/',
    createSocket,
    onMessage() {},
    onReconnect: () => stats.catchUps++,
    random: () => 0,
    clock: env.clock,
    visibility: env.visibility,
  });
  sock.start();
  await env.advance(10 * MIN);
  assert.ok(stats.created <= 45, `refused ws: ${stats.created} attempts in 10 min`);
  assert.equal(stats.catchUps, 0);
  sock.stop();
  const after = stats.created;
  await env.advance(10 * MIN);
  assert.equal(stats.created, after, 'stop() ends the loop');
});

test('a socket that opens then drops: backoff keeps growing, catch-up throttled', async () => {
  const env = makeEnv();
  const { stats, createSocket } = socketHarness(env, flapping(env));
  const sock = createLiveSocket({
    url: () => 'ws://x/ws/events/',
    createSocket,
    onMessage() {},
    onReconnect: () => stats.catchUps++,
    random: () => 0,
    clock: env.clock,
    visibility: env.visibility,
  });
  sock.start();
  await env.advance(10 * MIN);
  // Before: the backoff reset on every open -> a reconnect about every 1.2 s
  // (~500 in 10 min), each refetching every live query on screen.
  assert.ok(stats.created <= 45, `flapping ws: ${stats.created} reconnects`);
  assert.ok(stats.catchUps <= 11, `flapping ws: ${stats.catchUps} catch-up refreshes`);
  sock.stop();
});

test('a socket that stayed up earns a fresh, fast reconnect', async () => {
  const env = makeEnv();
  const sockets = [];
  const { stats, createSocket } = socketHarness(env, (s) => {
    sockets.push(s);
    env.clock.setTimeout(() => {
      s.readyState = 1;
      s.onopen?.();
    }, 5);
  });
  const sock = createLiveSocket({
    url: () => 'ws://x',
    createSocket,
    onMessage() {},
    onReconnect: () => stats.catchUps++,
    random: () => 1,
    clock: env.clock,
    visibility: env.visibility,
  });
  sock.start();
  await env.advance(MIN);
  assert.ok(stats.pings >= 2, 'keep-alive pings while open');
  sockets.at(-1).close();
  await env.advance(1500);
  assert.equal(stats.created, 2, 'reconnected within ~1 s after a long-lived socket dropped');
  assert.equal(stats.catchUps, 1, 'one catch-up after the gap');
  sock.stop();
});

test('no reconnecting while the app is backgrounded', async () => {
  const env = makeEnv();
  const { stats, createSocket } = socketHarness(env, refused(env));
  const sock = createLiveSocket({
    url: () => 'ws://x',
    createSocket,
    onMessage() {},
    random: () => 1,
    clock: env.clock,
    visibility: env.visibility,
  });
  env.setHidden(true);
  sock.start(); // the first attempt still happens
  await env.advance(10 * MIN);
  assert.equal(stats.created, 1, 'hidden: no reconnect attempts');
  env.setHidden(false);
  await env.advance(1500);
  assert.equal(stats.created, 2, 'reconnects when shown');
  sock.stop();
});

test('a fatal close (bad token / no company) is never retried', async () => {
  const env = makeEnv();
  const { stats, createSocket } = socketHarness(env, (s) =>
    env.clock.setTimeout(() => {
      s.readyState = 3;
      s.onclose?.({ code: 4401 });
    }, 5),
  );
  const sock = createLiveSocket({
    url: () => 'ws://x',
    createSocket,
    onMessage() {},
    isFatalClose: (ev) => [4401, 4403].includes(ev?.code),
    random: () => 1,
    clock: env.clock,
    visibility: env.visibility,
  });
  sock.start();
  await env.advance(10 * MIN);
  assert.equal(stats.created, 1, 'one attempt, no retry loop');
  sock.stop();
});
