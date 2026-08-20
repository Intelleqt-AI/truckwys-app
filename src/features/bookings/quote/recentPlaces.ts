import AsyncStorage from '@react-native-async-storage/async-storage';

import type { QuoteLoc } from './locationStore';

// Places this device has used before, newest first.
//
// Follows the feature-local persistence pattern already in
// `features/finance/fastpay.ts` — raw AsyncStorage, a `tw_` key, read-modify-write,
// and every error swallowed. Losing a recent costs the user one extra search;
// letting the write throw would cost them the location they just confirmed.
//
// Device-local by nature: it won't follow the user to another handset. Server
// history could seed it (the quotes list carries pickup/delivery coordinates)
// if a fresh device starting empty turns out to be annoying.

const KEY = 'tw_recent_places';
const CAP = 8;

export async function loadRecentPlaces(): Promise<QuoteLoc[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(list)) return [];
    // Written by an older build, or hand-edited: keep only usable rows rather
    // than rendering a row that can't be tapped into a location.
    return list
      .filter(
        (p): p is QuoteLoc =>
          !!p && typeof p.label === 'string' && !!p.label && typeof p.lat === 'number' && typeof p.lon === 'number',
      )
      .slice(0, CAP);
  } catch {
    return [];
  }
}

/** Record a confirmed location — from a suggestion, a map pin, or coordinates. */
export async function saveRecentPlace(loc: QuoteLoc): Promise<QuoteLoc[]> {
  if (!loc?.label || loc.lat == null || loc.lon == null) return loadRecentPlaces();
  const existing = await loadRecentPlaces();
  // Deduped by label, and the fresh copy wins: re-confirming a place should move
  // it to the top and refresh its coordinates, not add a second row.
  const next = [loc, ...existing.filter((p) => p.label !== loc.label)].slice(0, CAP);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Non-fatal: the list is a convenience, never the source of truth.
  }
  return next;
}
