import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Choice, ItemKey, Review } from './types';

// Results are kept per trip because a check costs money (the company has a
// daily allowance of them). Web keeps them in sessionStorage; on a phone the
// equivalent is AsyncStorage with the same 12 hour life and 12 entry cap.

export interface Entry {
  review: Review;
  /** The trip this was checked for: a different trip is a different check. */
  laneSig: string;
  /** Inputs only the win chance depends on (client, date, weight). */
  winSig: string;
  at: number;
  /** Unused now: the quote's own figures decide which side is chosen. Only
      older stored entries still carry it. */
  choices?: Record<ItemKey, Choice>;
}

const CACHE_KEY = 'tw-price-check-v1';
const CACHE_MAX = 12;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export async function loadCache(): Promise<Record<string, Entry>> {
  try {
    const raw = JSON.parse((await AsyncStorage.getItem(CACHE_KEY)) || '{}') as Record<string, Entry>;
    const now = Date.now();
    return Object.fromEntries(
      Object.entries(raw).filter(([, e]) => e && now - e.at < CACHE_TTL_MS && e.review?.combinations),
    );
  } catch {
    return {};
  }
}

export function saveCache(cache: Record<string, Entry>): void {
  const kept = Object.entries(cache)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, CACHE_MAX);
  // Fire and forget: losing the write only means the check is repeated.
  AsyncStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(kept))).catch(() => {});
}

// Whether this backend has the endpoint at all. A GET is free (no model call):
// 405 means it exists, 404 means the backend isn't deployed yet. Remembered for
// this app launch only, so a backend deployed later is picked up on the next
// launch rather than being stuck on "not available".
let availMemo: 'yes' | 'no' | null = null;
export const readAvail = (): 'yes' | 'no' | null => availMemo;
export const writeAvail = (v: 'yes' | 'no'): void => {
  availMemo = v;
};
