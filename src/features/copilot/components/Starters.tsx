import { View, Pressable } from 'react-native';
import { Txt, Label, Icon } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuthStore } from '@/stores/authStore';
import { useRole } from '@/lib/access';

// The empty state: an intro plus the suggestion cards.
//
// Ported verbatim from the web page (src/pages/Copilot.tsx:41-62), including the
// detail that three labels send DIFFERENT text than they show — "Fast-pay
// capacity" sends "How much can I advance?" — because the label reads better and
// the prompt answers better.

interface Starter {
  title: string;
  prompt: string;
  hint: string;
}

const STARTERS: Starter[] = [
  { title: "What's overdue?", prompt: "What's overdue?", hint: 'Chase the right accounts first' },
  {
    title: 'Fast-pay capacity',
    prompt: 'How much can I advance?',
    hint: 'Eligible invoices & net payout',
  },
  { title: 'Quotes pipeline', prompt: "How's my pipeline?", hint: 'Win/loss & open quotes' },
  { title: 'Fleet status', prompt: 'Fleet status', hint: 'Active, idle & maintenance' },
];

// Roles that can write get two more: the agent drafts the record and the user
// confirms it on a card before anything saves.
const WRITE_STARTERS: Starter[] = [
  {
    title: 'Add a customer',
    prompt: 'Add a new customer',
    hint: 'Draft a record — you confirm before it saves',
  },
  {
    title: 'Draft a quote',
    prompt: 'Create a new quote',
    hint: 'Propose a quote for your confirmation',
  },
];

const GENERIC_INTRO =
  "I'm your TruckWys copilot. Ask me about your cash position, overdue invoices, quotes pipeline, fleet status or fast-pay capacity — I answer from your live data.";

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
        <Icon name="sparkle" size={30} color={colors.accent} />
      </View>
      <Txt className="mb-2.5 text-center text-heading font-semibold text-fg">
        How can I help you run the business today?
      </Txt>
      <Txt className="mb-6 text-center text-sub text-muted">
        {firstName ? `Hi ${firstName} — ${GENERIC_INTRO}` : GENERIC_INTRO}
      </Txt>

      <Label className="mb-2.5 text-faint">Try asking</Label>
      <View className="gap-2.5">
        {starters.map((s) => (
          <Pressable
            key={s.title}
            onPress={() => onPick(s.prompt)}
            accessibilityRole="button"
            accessibilityLabel={s.title}
            className="rounded-xs border border-line bg-surface px-3.5 py-3 active:border-accent active:opacity-80"
          >
            <View className="flex-row items-center justify-between gap-2">
              <Txt className="flex-1 text-callout font-medium text-fg">{s.title}</Txt>
              <Icon name="arrowRight" size={15} color={colors.faint} />
            </View>
            <Txt className="mt-0.5 text-caption text-faint">{s.hint}</Txt>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
