import { Alert } from 'react-native';
import { toast } from './toast';

interface BulkDeleteOutcome {
  deleted: number;
  blocked: { id: string | number; name: string; reason: string }[];
}

const MAX_SHOWN = 5;

/**
 * Turns a bulk-delete API result into feedback. A partial result — some rows
 * deleted, some kept because they're linked to quotes, invoices, loads or
 * trips — is the normal case here, not an edge one (see
 * core/views_bulk_delete.py), so it gets a readable Alert with the reasons
 * instead of the error toast's single red, truncated, 3.5s line. A clean
 * full delete stays silent (haptic only), same as every other write in the
 * app — see lib/toast.tsx.
 */
export function reportBulkDelete(
  res: BulkDeleteOutcome,
  nouns: { singular: string; plural: string },
) {
  const { deleted, blocked } = res;
  const label = (n: number) => (n === 1 ? nouns.singular : nouns.plural);

  if (deleted > 0 && blocked.length === 0) {
    toast.success();
    return;
  }

  if (blocked.length > 0) {
    const title = deleted > 0 ? `Deleted ${deleted} · Kept ${blocked.length}` : `Kept ${blocked.length} ${label(blocked.length)}`;
    const lines = blocked.slice(0, MAX_SHOWN).map((b) => `• ${b.name} — ${b.reason}`);
    if (blocked.length > MAX_SHOWN) lines.push(`…and ${blocked.length - MAX_SHOWN} more`);
    Alert.alert(title, lines.join('\n'));
    return;
  }

  toast.error('Nothing was deleted');
}
