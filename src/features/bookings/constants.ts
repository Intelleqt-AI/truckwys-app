// Load lifecycle — mirrors the web app's stepper + allowed transitions.
export const LOAD_STEPS = ['PENDING', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'INVOICED'] as const;

// Matches web VALID_TRANSITIONS (truckwyas-frontend Bookings.tsx).
export const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['ASSIGNED', 'LOADING', 'CANCELLED'],
  LOADING: ['ASSIGNED', 'IN_TRANSIT', 'CANCELLED'],
  ASSIGNED: ['LOADING', 'IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['DELIVERED', 'CANCELLED'],
  DELIVERED: ['INVOICED'],
  INVOICED: [],
  CANCELLED: ['PENDING'],
};

// Human labels for status tokens (IN_TRANSIT → "In transit").
export const STATUS_LABEL = (s: string) =>
  s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replace(/_/g, ' ');

// Maps a load's status to its position in LOAD_STEPS, for the status timeline.
// LOADING isn't a visible step (the web stepper omits it too) — it sits between
// ASSIGNED and IN_TRANSIT, so it lights ASSIGNED as current rather than lighting
// nothing at all, which is what a plain `LOAD_STEPS.indexOf(status)` did.
// CANCELLED has no position (-1); the screen renders it as its own terminal row.
export const STEP_INDEX: Record<string, number> = {
  PENDING: 0,
  ASSIGNED: 1,
  LOADING: 1,
  IN_TRANSIT: 2,
  DELIVERED: 3,
  INVOICED: 4,
};
export const stepIndexFor = (s: string) => STEP_INDEX[s] ?? -1;

export const VEHICLE_CLASSES = [
  { value: 'Rigid-8t', label: 'Rigid 8t' },
  { value: 'Superlink-30t', label: 'Superlink' },
  { value: 'Interlink-34t', label: 'Interlink' },
];
