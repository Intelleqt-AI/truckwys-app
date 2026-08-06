import { status as statusHues } from '@/theme/tokens';
import type { ProposalOperation, ProposalStatus } from '../types';

// Colour and wording for a proposal's operation and settled state, matching the
// web ProposalCard. Kept out of the component so it stays a pure lookup.

export type Tone = keyof typeof statusHues;

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

export const toneHue = (tone: Tone): string => statusHues[tone];
