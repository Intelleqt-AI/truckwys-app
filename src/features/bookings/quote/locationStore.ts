import { create } from 'zustand';

// The two ends of a quote, held outside the screens that edit them.
//
// Two screens own these now — the picker (where a quote starts) and the quote
// builder (where the map and pin mode live) — and the picker is *pushed*, so it
// has to hand values back. Nothing in this app returns a value from a pushed
// screen: there is no setParams, no callback param, no popTo anywhere. The
// established answer is a small feature store, and `features/copilot/store.ts`
// exists for exactly this reason. So: one source of truth both screens read and
// write, and no hand-back at all.
//
// Locations only. Everything else about a quote stays in the builder's form
// state, and server data stays in React Query, as everywhere else.

export interface QuoteLoc {
  label: string;
  lat: number;
  lon: number;
  /** ISO-3166-1 alpha-2, when the geocoder gave one. Drives the cross-border check. */
  cc?: string;
}

interface LocationState {
  pickup: QuoteLoc | null;
  delivery: QuoteLoc | null;
  setPickup: (loc: QuoteLoc | null) => void;
  setDelivery: (loc: QuoteLoc | null) => void;
  /** Reverse the trip. Used by the swap control between the two picker fields. */
  swap: () => void;
  /**
   * Clear both. Must run when a *new* quote starts, or the next one silently
   * inherits the last one's route — the failure mode of holding this outside the
   * screen in the first place.
   */
  reset: () => void;
}

export const useLocationStore = create<LocationState>((set) => ({
  pickup: null,
  delivery: null,
  setPickup: (pickup) => set({ pickup }),
  setDelivery: (delivery) => set({ delivery }),
  swap: () => set((s) => ({ pickup: s.delivery, delivery: s.pickup })),
  reset: () => set({ pickup: null, delivery: null }),
}));
