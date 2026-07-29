import { useAuthStore } from '@/stores/authStore';

// Role-based visibility, ported from the web app (App.tsx RoleRoute, OSLayout
// NAV_ACCESS, Settings adminOnly). This is presentation only — the backend is
// the actual authority on what a role may do.

export const FINANCE_ROLES = ['ADMIN', 'MANAGER', 'OPERATOR', 'DISPATCHER'] as const;
export const INSIGHTS_ROLES = [...FINANCE_ROLES, 'VIEWER'] as const;

// Settings sub-sections the web app restricts to admins.
export const ADMIN_ONLY_SETTINGS = ['company', 'users', 'billing', 'integrations', 'risk'] as const;

// Roles with no access to Settings at all (web: OSLayout canAccessSettings).
const NO_SETTINGS_ROLES = ['VIEWER', 'DRIVER'];

// Which tabs each role sees, mirroring web NAV_ACCESS. Anything not listed here
// gets the VIEWER set, matching the web default for an unknown role.
const ALL_TABS = ['Home', 'Bookings', 'Fleet', 'Finance'];

const TAB_ACCESS: Record<string, string[]> = {
  ADMIN: ALL_TABS,
  MANAGER: ALL_TABS,
  OPERATOR: ALL_TABS,
  DISPATCHER: ALL_TABS,
  VIEWER: ['Home', 'Bookings', 'Fleet'],
  DRIVER: ['Home', 'Bookings'],
};

// The web app compares roles case-sensitively against upper-case in some files
// and lower-case in others. Normalise once here so mobile can't inherit that.
export function useRole(): string {
  const role = useAuthStore((s) => s.user?.role);
  return (role ?? 'VIEWER').toUpperCase();
}

export const canSeeFinanceFeatures = (role: string) =>
  (FINANCE_ROLES as readonly string[]).includes(role);

export const canSeeInsights = (role: string) =>
  (INSIGHTS_ROLES as readonly string[]).includes(role);

export const canAccessSettings = (role: string) => !NO_SETTINGS_ROLES.includes(role);

export const canAccessSettingsSection = (role: string, section: string) =>
  canAccessSettings(role) &&
  (!(ADMIN_ONLY_SETTINGS as readonly string[]).includes(section) || role === 'ADMIN');

const VIEWER_TABS = ['Home', 'Bookings', 'Fleet'];

export const visibleTabs = (role: string): string[] => TAB_ACCESS[role] ?? VIEWER_TABS;
