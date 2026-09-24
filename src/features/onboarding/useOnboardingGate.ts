import { useEffect, useRef } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '@/stores/authStore';
import { useRole } from '@/lib/access';
import { useDemo } from '@/hooks/useDemo';
import { useCompanyProfile } from '@/features/more/api';
import { pick } from '@/lib/api/list';
import type { AppStackParamList } from '@/navigation/types';
import { companyIdOf, isOnboardingFlagged } from './onboardingStorage';

/**
 * Opens the onboarding wizard once per launch for an admin whose company
 * hasn't finished it — mirrors the web's own redirect-to-/onboarding gate
 * (postLogin.ts), keyed off the same `company.onboarding_completed_at` field.
 *
 * Called from HomeScreen — the tab that's always mounted first after login —
 * rather than from AppNavigator itself: `useNavigation` needs a screen inside
 * the stack, and the Navigator component isn't one yet when IT renders.
 */
export function useOnboardingGate(): void {
  const nav = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const role = useRole();
  const demo = useDemo();
  const user = useAuthStore((s) => s.user);
  const { data: profile, isLoading } = useCompanyProfile();
  // Runs at most once per mount — re-attempting on every render would refire
  // the moment `nav`'s identity or the query re-resolves.
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    if (role !== 'ADMIN' || demo.isDemo) return;
    if (isLoading || !profile) return; // wait for a real answer either way
    attempted.current = true;

    const companyId = companyIdOf(user);
    void (async () => {
      if (await isOnboardingFlagged(companyId)) return;
      if (pick(profile, ['onboarding_completed_at'])) return;
      nav.navigate('Onboarding');
    })();
  }, [role, demo.isDemo, isLoading, profile, user, nav]);
}
