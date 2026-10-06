import type { Palette } from '@/theme/tokens';
import type { ProposalOperation, ProposalStatus } from '../types';

// Tone role keys and wording for a proposal's operation and settled state,
// matching the web ProposalCard. Kept out of the component so it stays a pure
// lookup; callers resolve theme-aware colours from `useTheme().colors`.

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export const OPERATION_TONE: Record<ProposalOperation, Tone> = {
  CREATE: 'success',
  UPDATE: 'warning',
  DELETE: 'danger',
  SEND: 'info',
};

export const STATUS_CHIP: Record<ProposalStatus, { text: string; tone: Tone }> = {
  pending: { text: 'Awaiting confirmation', tone: 'info' },
  executed: { text: '✓ Saved', tone: 'success' },
  dismissed: { text: 'Dismissed', tone: 'neutral' },
  expired: { text: 'Expired', tone: 'neutral' },
  failed: { text: '✕ Failed', tone: 'danger' },
};

/** Text colour for a tone (use for words). */
export const toneText = (tone: Tone, colors: Palette): string => colors[tone];

/** Dot/icon/fill colour for a tone. */
export const toneDot = (tone: Tone, colors: Palette): string => colors[`${tone}Dot` as const];
