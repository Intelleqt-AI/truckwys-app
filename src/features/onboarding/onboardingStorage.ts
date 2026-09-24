import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthUser } from '@/types/auth';

// A per-device flag alongside the server's company.onboarding_completed_at
// field — mirrors the web's own localStorage 'onboarding_done' flag (see
// Onboarding.tsx on the web), so a slow or failed PATCH still doesn't reopen
// the wizard on THIS device the next time HomeScreen mounts.

export function companyIdOf(user: AuthUser | null | undefined): string | number | undefined {
  const company = user?.company;
  if (company == null) return undefined;
  return typeof company === 'object' ? company.id : company;
}

const flagKey = (companyId: string | number) => `onboarding_done:${companyId}`;

export async function isOnboardingFlagged(companyId: string | number | undefined): Promise<boolean> {
  if (companyId == null) return false;
  try {
    return (await AsyncStorage.getItem(flagKey(companyId))) === 'true';
  } catch {
    return false;
  }
}

export async function markOnboardingDone(companyId: string | number | undefined): Promise<void> {
  if (companyId == null) return;
  try {
    await AsyncStorage.setItem(flagKey(companyId), 'true');
  } catch {
    // Best-effort — the server field is still the source of truth next launch.
  }
}
