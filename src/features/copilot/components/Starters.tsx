import { View, TouchableOpacity } from 'react-native';
import { Txt, Label, Icon } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuthStore } from '@/stores/authStore';
import { useRole } from '@/lib/access';
import { CAPITAL_LAUNCHED } from '@/lib/features';

// The empty state: an intro plus the suggestion cards.
//
// Ported from the web page (src/pages/Copilot.tsx), including the detail that
// some labels use DIFFERENT text than they show ("Fast-pay capacity" uses "How
// much can I advance?") because the label reads better and the prompt answers
// better. A suggestion only FILLS the ask box (onPick); the person can edit it
// and press send.

interface Starter {
  title: string;
  prompt: string;
  hint: string;
}

const FAST_PAY_STARTER: Starter = {
  title: 'Fast-pay capacity',
  prompt: 'How much can I advance?',
  hint: 'Eligible invoices and net payout',
};

const STARTERS: Starter[] = [
  { title: "What's overdue?", prompt: "What's overdue?", hint: 'Chase the right accounts first' },
  // Fast Pay is not live yet, so it is not suggested (lib/features.ts).
  ...(CAPITAL_LAUNCHED ? [FAST_PAY_STARTER] : []),
  { title: 'Quotes pipeline', prompt: "How's my pipeline?", hint: 'Won, lost and open quotes' },
  { title: 'Fleet status', prompt: 'Fleet status', hint: 'Active, idle and in maintenance' },
];

// Roles that can write get two more: the agent drafts the record and the user
// confirms it on a card before anything saves.
const WRITE_STARTERS: Starter[] = [
  {
    title: 'Add a customer',
    prompt: 'Add a new customer',
    hint: 'Drafts the record for you to check',
  },
  {
    title: 'Draft a quote',
    prompt: 'Create a new quote',
    hint: 'Drafts a quote for you to check',
  },
];

const GENERIC_INTRO = `I'm your TruckWys copilot. Ask me about your cash position, overdue invoices, quotes pipeline, fleet status${
  CAPITAL_LAUNCHED ? ' or fast-pay capacity' : ''
}. I answer from your live data.`;

export function Starters({ onPick }: { onPick: (prompt: string) => void }) {
  const { colors } = useTheme();
  const role = useRole();
  const name = useAuthStore((s) => s.user?.name);
  const firstName = (name ?? '').trim().split(' ')[0];

  // VIEWER and DRIVER can't write. (DRIVER can't reach this screen at all —
  // MoreScreen gates it on canSeeInsights — but keep the check aligned with web.)
  const canWrite = !['VIEWER', 'DRIVER'].includes(role);
  const starters = canWrite ? [...STARTERS, ...WRITE_STARTERS] : STARTERS;

  return (
    <View className="pt-6">
      <View className="mb-5 items-center">
        <Icon name="sparkle" size={30} color={colors.muted} />
      </View>
      <Txt className="mb-2.5 text-center text-heading font-semibold text-fg">
        How can I help you run the business today?
      </Txt>
      <Txt className="mb-6 text-center text-sub text-muted">
        {firstName ? `Hi ${firstName}. ${GENERIC_INTRO}` : GENERIC_INTRO}
      </Txt>

      <Label className="mb-2.5 text-faint">Try asking</Label>
      <View className="gap-2.5">
        {starters.map((s) => (
          <TouchableOpacity
            key={s.title}
            onPress={() => onPick(s.prompt)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={s.title}
            accessibilityHint={`Puts "${s.prompt}" in the ask box`}
            className="rounded-control border border-line bg-surface px-3.5 py-3"
          >
            <View className="flex-row items-center justify-between gap-2">
              <Txt className="flex-1 text-callout font-medium text-fg">{s.title}</Txt>
              <Icon name="arrowRight" size={15} color={colors.faint} />
            </View>
            <Txt className="mt-0.5 text-caption text-faint">{s.hint}</Txt>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
