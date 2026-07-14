// Load lifecycle — mirrors the web app's stepper + allowed transitions.
export const LOAD_STEPS = ['PENDING', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'INVOICED'] as const;

export const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['LOADING', 'IN_TRANSIT', 'CANCELLED'],
  LOADING: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['DELIVERED'],
  DELIVERED: ['INVOICED'],
  INVOICED: [],
  CANCELLED: [],
};

export const VEHICLE_CLASSES = [
  { value: 'Rigid-8t', label: 'Rigid 8t' },
  { value: 'Superlink-30t', label: 'Superlink' },
  { value: 'Interlink-34t', label: 'Interlink' },
];
