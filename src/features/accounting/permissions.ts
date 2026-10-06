import { useRole } from '@/lib/access';
import { useDemo } from '@/hooks/useDemo';

/** Who may change the accounting connection: company admins, never the demo. Everyone else can look. */
export function useAccountingPermissions() {
  const role = useRole();
  const { isDemo } = useDemo();
  const isAdmin = role === 'ADMIN';
  const canWrite = isAdmin && !isDemo;
  const writeTitle = isDemo
    ? 'Not available in the demo'
    : !isAdmin
      ? 'Only a company admin can change this'
      : undefined;
  return { isAdmin, isDemo, canWrite, writeTitle };
}
