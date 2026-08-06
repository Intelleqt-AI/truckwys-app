// Shapes the Copilot endpoints actually return, normalised to camelCase once at
// the API boundary so no screen has to re-guess a field name.
//
// The server envelope is loosely typed (DRF dicts assembled in
// core/services/agent.py), so everything here is parsed defensively through the
// pick/str/num helpers rather than cast.

/** A row in the history sheet. `GET agent/conversations/`. */
export interface ConversationSummary {
  id: number;
  title: string;
  updatedAt: string;
  messageCount: number;
}

/** One line of a proposal's field table. `old_value` present only on UPDATE. */
export interface ProposalField {
  label: string;
  value: string;
  oldValue?: string;
}

export type ProposalStatus = 'pending' | 'executed' | 'dismissed' | 'failed' | 'expired';

export type ProposalOperation = 'CREATE' | 'UPDATE' | 'DELETE' | 'SEND';

/** What the server did, once executed. `error` is set on a failure. */
export interface ProposalResult {
  id?: string | number;
  number?: string;
  route?: string;
  error?: string;
}

/**
 * A confirm-first write the agent has drafted. The id is the WHOLE contract —
 * the client never supplies an endpoint or a payload, it just says execute or
 * dismiss, and the server re-checks the caller's role before doing anything.
 */
export interface Proposal {
  id: number;
  table: string;
  operation: ProposalOperation;
  label: string;
  fields: ProposalField[];
  warning?: string;
  analysisSummary?: string;
  confirmText: string;
  status: ProposalStatus;
  result: ProposalResult | null;
}

/** A navigation chip. `route` is a WEB path; resolve via lib/notificationLink. */
export interface NavAction {
  label: string;
  route: string;
}

/**
 * The older, rule-detected confirm card — distinct from Proposal in that the
 * CLIENT performs the write against a server-supplied endpoint. Only two intents
 * exist (core/services/agent.py:544): request_advance and send_reminder.
 */
export interface ProposedAction {
  type: string;
  method: string;
  endpoint: string;
  body: Record<string, unknown>;
  label: string;
  detail?: string;
  confirmText?: string;
  successText?: string;
}

export type ProposedActionState = 'pending' | 'done' | 'error';

export interface Msg {
  /** Stable across re-renders and across a history rehydrate. Never an index. */
  key: string;
  role: 'user' | 'assistant';
  content: string;
  actions: NavAction[];
  proposal: Proposal | null;
  proposedAction?: ProposedAction | null;
  proposedActionState?: ProposedActionState;
  /** Reply came from the rules engine because the LLM was unavailable. */
  degraded?: boolean;
  /** A local-only row for a failed request, with a retry affordance. */
  failed?: boolean;
  /** The user text to re-send when `failed`. */
  retryText?: string;
}

/** Normalised `POST agent/conversations/<id>/chat/` response. */
export interface ChatEnvelope {
  reply: string;
  conversationId: number | null;
  /** null when the server didn't say (treated as "unknown", not "down"). */
  aiAvailable: boolean | null;
  actions: NavAction[];
  proposal: Proposal | null;
  proposedAction: ProposedAction | null;
}
