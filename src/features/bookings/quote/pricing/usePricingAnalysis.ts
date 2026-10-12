import { useCallback, useEffect, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { postData } from '@/lib/api/client';
import { adaptAnalysis, buildRequest, type PricingAnalysis, type PricingInputs } from './analysis';

export const PRICING_URL = 'quotes/pricing-analysis/';
const DEBOUNCE_MS = 400;
// 30 s: an international trip (border costs, market) can take a while; a
// timeout is retried, never shown as "offline" for good.
const TIMEOUT_MS = 30000;
const RETRY_DELAYS = [2000, 5000, 10000, 20000, 30000];
// Automatic retries of one failing request (the web retries forever; a phone on
// a bad connection should not keep a request loop running behind the form).
const MAX_AUTO_RETRIES = 6;

export type PricingStatus =
  | 'idle' // inputs not ready: nothing requested
  | 'loading' // first request in flight
  | 'ready' // a result for the current inputs
  | 'refreshing' // a result is shown; a newer request is in flight
  | 'error' // the server failed (5xx, bad body)
  | 'offline' // no response at all
  | 'unavailable'; // endpoint not deployed (404) or refused (403 / 402)

export interface PricingState {
  status: PricingStatus;
  data: PricingAnalysis | null;
  /** The request body the shown data answers (stale while refreshing). */
  dataKey: string | null;
  /** The shown data answers exactly the builder's current values. */
  isCurrent: boolean;
  retry: () => void;
}

/**
 * Debounced (~400 ms), cancel-stale fetch of the pricing analysis for the
 * builder's current values (port of the web's usePricingAnalysis). `inputs`
 * null means "not ready": nothing is sent. The last good result stays on
 * screen while a newer one loads. Never blocks saving or sending.
 */
export function usePricingAnalysis(inputs: PricingInputs | null, enabled: boolean): PricingState {
  const body = inputs && enabled ? buildRequest(inputs) : null;
  const key = body ? JSON.stringify(body) : null;

  const [status, setStatus] = useState<PricingStatus>('idle');
  const [data, setData] = useState<PricingAnalysis | null>(null);
  const [dataKey, setDataKey] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  // The values the builder shows now: an answer for anything else is dropped.
  const latestKeyRef = useRef<string | null>(null);
  const lastNonceRef = useRef(0);
  // Automatic retries for the same inputs (reset on new inputs or an answer).
  const attemptRef = useRef(0);
  // Whether the last failure can pass on its own (see the catch below).
  const retryableRef = useRef(true);
  const attemptKeyRef = useRef<string | null>(null);
  const hasDataRef = useRef(false);
  useEffect(() => {
    hasDataRef.current = !!data;
  }, [data]);

  useEffect(() => {
    latestKeyRef.current = key;
    // Any change cancels the request still on its way at once (not when the
    // next one is sent): its answer is for values no longer on screen.
    abortRef.current?.abort();
    abortRef.current = null;
    if (!key) {
      // The last result is kept (not shown: data is null without a key) so a
      // route recalculation that then fails still has prices to show greyed.
      setStatus('idle');
      return;
    }
    if (attemptKeyRef.current !== key) {
      attemptKeyRef.current = key;
      attemptRef.current = 0;
    }
    const forced = nonce !== lastNonceRef.current;
    lastNonceRef.current = nonce;
    if (key === dataKey && !forced) {
      setStatus('ready');
      return;
    }
    setStatus(hasDataRef.current ? 'refreshing' : 'loading');
    const timer = setTimeout(async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await postData({
          url: PRICING_URL,
          data: JSON.parse(key),
          config: { signal: ctrl.signal, timeout: TIMEOUT_MS },
        });
        // Only an answer for exactly what is on screen now is shown.
        if (ctrl.signal.aborted || key !== latestKeyRef.current) return;
        const adapted = adaptAnalysis(res);
        if (!adapted) {
          // An answer we can't read won't read better on the next try.
          retryableRef.current = false;
          setStatus('error');
          return;
        }
        setData(adapted);
        setDataKey(key);
        setStatus('ready');
        attemptRef.current = 0;
      } catch (e) {
        if (ctrl.signal.aborted || key !== latestKeyRef.current) return;
        const code = (e as { status?: number })?.status;
        // Only a failure that can pass on its own is retried: no answer, a
        // server error, a timeout (408) or the read throttle (429). A request
        // the server refuses (400/401/422) would be refused again every 30 s.
        retryableRef.current = !code || code >= 500 || code === 408 || code === 429;
        if (code === 404 || code === 403 || code === 402) setStatus('unavailable');
        else if (!code) setStatus('offline');
        else setStatus('error');
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // dataKey is read, not a trigger: an answer landing must not re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  // No answer (timeout, a gateway error, the server restarting) or a server
  // error: try again on its own, backing off, while the inputs are the same.
  // The last result stays on screen marked out of date.
  useEffect(() => {
    if ((status !== 'offline' && status !== 'error') || !key) return;
    // A refused request, or the retries are used up: wait for "Try now", the
    // device coming back online, or a change of inputs (a new key).
    if (!retryableRef.current || attemptRef.current >= MAX_AUTO_RETRIES) return;
    const wait = RETRY_DELAYS[Math.min(attemptRef.current, RETRY_DELAYS.length - 1)]!;
    attemptRef.current += 1;
    const t = setTimeout(() => setNonce((n) => n + 1), wait);
    return () => clearTimeout(t);
  }, [status, key]);

  // Back online: try again at once (only on the offline -> online change, so a
  // device that stays connected keeps to the back-off above).
  useEffect(() => {
    if (status !== 'offline') return;
    let was: boolean | null = null;
    return NetInfo.addEventListener((s) => {
      const on = s.isConnected !== false && s.isInternetReachable !== false;
      if (was === false && on) {
        attemptRef.current = 0;
        setNonce((n) => n + 1);
      }
      was = on;
    });
  }, [status]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const retry = useCallback(() => {
    attemptRef.current = 0;
    setNonce((n) => n + 1);
  }, []);
  return { status, data: key ? data : null, dataKey, isCurrent: !!key && dataKey === key, retry };
}
