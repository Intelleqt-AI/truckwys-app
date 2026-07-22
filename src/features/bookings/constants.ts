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

export const VEHICLE_CLASSES = [
  { value: 'Rigid-8t', label: 'Rigid 8t' },
  { value: 'Superlink-30t', label: 'Superlink' },
  { value: 'Interlink-34t', label: 'Interlink' },
];
