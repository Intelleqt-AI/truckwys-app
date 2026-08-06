import { useQuery, type QueryClient } from '@tanstack/react-query';
import { fetchData, postData, deleteData } from '@/lib/api/client';
import { asArray, num, str, pick } from '@/lib/api/list';
import type {
  ChatEnvelope,
  ConversationSummary,
  Msg,
  NavAction,
  Proposal,
  ProposalField,
  ProposalOperation,
  ProposalResult,
  ProposalStatus,
  ProposedAction,
} from './types';

// ── Why the chat call needs its own timeout ─────────────────────────────────
// The shared client is 30s (lib/api/client.ts), which is right for everything
// else. A tool-enabled copilot turn is not one model call: agent.py loops
// `for _ in range(6)`, each with a 30s timeout and one retry, so "draft a quote"
// regularly runs past 30s. The app used to abort with "Network error" WHILE the
// server finished and persisted the turn — the reply existed in history and was
// never shown. See adoptAfterTimeout below for the other half of that fix.
const CHAT_TIMEOUT_MS = 120_000;

export const CONVERSATIONS_KEY = ['copilot-conversations'] as const;
export const conversationKey = (id: number | null) => ['copilot-conversation', id] as const;

// ── Parsers ────────────────────────────────────────────────────────────────
const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const parseActions = (v: unknown): NavAction[] =>
  asArray(v)
    .map((a) => {
      const o = asRecord(a);
      return { label: str(pick(o, ['label'])), route: str(pick(o, ['route'])) };
    })
    .filter((a) => !!a.label && !!a.route);

const parseFields = (v: unknown): ProposalField[] =>
  asArray(v).map((f) => {
    const o = asRecord(f);
    const oldValue = pick(o, ['old_value']);
    return {
      label: str(pick(o, ['label'])),
      value: str(pick(o, ['value'])),
      ...(oldValue != null ? { oldValue: str(oldValue) } : {}),
    };
  });

const OPERATIONS: ProposalOperation[] = ['CREATE', 'UPDATE', 'DELETE', 'SEND'];
const STATUSES: ProposalStatus[] = ['pending', 'executed', 'dismissed', 'failed', 'expired'];

const parseResult = (v: unknown): ProposalResult | null => {
  const o = asRecord(v);
  if (!Object.keys(o).length) return null;
  return {
    ...(o.id != null ? { id: o.id as string | number } : {}),
    ...(o.number != null ? { number: str(o.number) } : {}),
    ...(o.route != null ? { route: str(o.route) } : {}),
    ...(o.error != null ? { error: str(o.error) } : {}),
  };
};

export function parseProposal(v: unknown): Proposal | null {
  const o = asRecord(v);
  const id = num(pick(o, ['id']), NaN);
  if (!Number.isFinite(id)) return null;
  const op = str(pick(o, ['operation'])).toUpperCase() as ProposalOperation;
  const status = str(pick(o, ['status']), 'pending').toLowerCase() as ProposalStatus;
  const warning = pick(o, ['warning']);
  const analysis = pick(o, ['analysis_summary']);
  return {
    id,
    table: str(pick(o, ['table'])),
    operation: OPERATIONS.includes(op) ? op : 'CREATE',
    label: str(pick(o, ['label']), 'Proposed change'),
    fields: parseFields(o.fields),
    ...(warning != null ? { warning: str(warning) } : {}),
    ...(analysis != null ? { analysisSummary: str(analysis) } : {}),
    confirmText: str(pick(o, ['confirm_text']), 'Confirm'),
    status: STATUSES.includes(status) ? status : 'pending',
    result: parseResult(o.result),
  };
}

function parseProposedAction(v: unknown): ProposedAction | null {
  const o = asRecord(v);
  const endpoint = str(pick(o, ['endpoint']));
  if (!endpoint) return null;
  const detail = pick(o, ['detail']);
  return {
    type: str(pick(o, ['type'])),
    method: str(pick(o, ['method']), 'POST').toUpperCase(),
    // The server writes absolute API paths ("api/v1/advances/") but our axios
    // baseURL already ends at /api/v1/, so posting it verbatim would double the
    // prefix and 404.
    endpoint: endpoint.replace(/^\/?api\/v1\//, '').replace(/^\//, ''),
    body: asRecord(pick(o, ['body'])),
    label: str(pick(o, ['label']), 'Confirm action'),
    ...(detail != null ? { detail: str(detail) } : {}),
    confirmText: str(pick(o, ['confirm_text']), 'Confirm'),
    successText: str(pick(o, ['success_text']), 'Done.'),
  };
}

/**
 * `ai_available: false` means the reply came from the rules engine, not the LLM.
 * Absent means the server didn't say, which is different from "down" — so this
 * returns null rather than defaulting to a value that would show a warning.
 */
const parseAiAvailable = (o: Record<string, unknown>): boolean | null =>
  typeof o.ai_available === 'boolean' ? o.ai_available : null;

export function parseEnvelope(res: unknown): ChatEnvelope {
  const o = asRecord(res);
  const cid = num(pick(o, ['conversation_id']), NaN);
  return {
    reply: str(pick(o, ['reply', 'message', 'response', 'content']), 'Done.'),
    conversationId: Number.isFinite(cid) ? cid : null,
    aiAvailable: parseAiAvailable(o),
    actions: parseActions(o.actions),
    proposal: parseProposal(o.proposal),
    proposedAction: parseProposedAction(o.proposed_action),
  };
}

// ── Conversations ──────────────────────────────────────────────────────────
export function useConversations() {
  return useQuery({
    queryKey: CONVERSATIONS_KEY,
    queryFn: async (): Promise<ConversationSummary[]> => {
      const res = asRecord(await fetchData('agent/conversations/'));
      return asArray(res.conversations).map((c) => {
        const o = asRecord(c);
        return {
          id: num(pick(o, ['id'])),
          title: str(pick(o, ['title']), 'New conversation'),
          updatedAt: str(pick(o, ['updated_at'])),
          messageCount: num(pick(o, ['message_count'])),
        };
      });
    },
    // A thread with no messages is filtered out server-side, so this list is
    // never polluted by a "new chat" the user abandoned.
    staleTime: 30_000,
  });
}

/**
 * One thread's transcript. Kept in React Query rather than component state on
 * purpose: an action chip navigates away and unmounts the screen, and this is
 * what makes coming back instant instead of blank.
 */
export function useConversation(id: number | null) {
  return useQuery({
    queryKey: conversationKey(id),
    enabled: id != null,
    queryFn: () => fetchConversation(id as number),
    staleTime: 60_000,
  });
}

export async function fetchConversation(id: number): Promise<Msg[]> {
  const res = asRecord(await fetchData(`agent/conversations/${id}/`));
  return asArray(res.messages).map((m, i) => {
    const o = asRecord(m);
    const role = str(pick(o, ['role'])) === 'user' ? 'user' : 'assistant';
    const createdAt = str(pick(o, ['created_at']));
    return {
      // created_at is unique enough in practice; the index is the tiebreak for
      // two messages persisted in the same turn with the same timestamp.
      key: `${id}:${i}:${createdAt || role}`,
      role,
      content: str(pick(o, ['content'])),
      actions: parseActions(o.actions),
      proposal: parseProposal(o.proposal),
    } satisfies Msg;
  });
}

export const createConversation = async (): Promise<number> => {
  const res = asRecord(await postData({ url: 'agent/conversations/', data: {} }));
  const id = num(pick(res, ['id']), NaN);
  if (!Number.isFinite(id)) throw new Error('Could not start a conversation');
  return id;
};

export const deleteConversation = (id: number) =>
  deleteData({ url: `agent/conversations/${id}/` });

// ── Chat ───────────────────────────────────────────────────────────────────
/**
 * Send one message.
 *
 * ALWAYS via `agent/conversations/<id>/chat/`, never `agent/chat/`. That other
 * route runs agent_respond() without enable_tools — no database tools, no
 * proposals — and when no conversation_id is supplied it appends to
 * `filter(user=…).first()`, which with `ordering = ['-updated_at']` is whatever
 * thread was touched most recently, including one open on the web dashboard.
 * Mobile used to hit it on the first message of every session.
 */
export const sendChat = async (conversationId: number, message: string): Promise<ChatEnvelope> => {
  const res = await postData({
    url: `agent/conversations/${conversationId}/chat/`,
    data: { message },
    config: { timeout: CHAT_TIMEOUT_MS },
  });
  return parseEnvelope(res);
};

/** True for the errors where the turn may still have completed server-side. */
export const isTimeoutish = (e: unknown): boolean => {
  const err = e as { status?: number; message?: string; code?: string };
  if (err?.status) return false; // the server answered, so it isn't a timeout
  return /timeout|aborted|network/i.test(err?.message ?? '');
};

/**
 * After a timeout, ask the server what actually landed.
 *
 * The turn is persisted inside the view before the response is built, so a
 * client-side abort loses the reply but not the data. Returns the last assistant
 * message if the exchange did complete, else null.
 */
export async function adoptAfterTimeout(conversationId: number): Promise<Msg | null> {
  try {
    const msgs = await fetchConversation(conversationId);
    const last = msgs[msgs.length - 1];
    return last?.role === 'assistant' ? last : null;
  } catch {
    return null;
  }
}

// ── Proposals ──────────────────────────────────────────────────────────────
export interface ExecuteOutcome {
  status: 'executed' | 'failed';
  /** Assistant message the server wants appended after a successful execute. */
  message?: string;
  action?: NavAction | null;
  result: ProposalResult | null;
}

export async function executeProposal(id: number): Promise<ExecuteOutcome> {
  const res = asRecord(await postData({ url: `agent/proposals/${id}/execute/`, data: {} }));
  const executed = str(pick(res, ['status'])) === 'executed';
  const action = parseActions([res.action])[0] ?? null;
  return {
    status: executed ? 'executed' : 'failed',
    message: str(pick(res, ['message']), 'Done.'),
    action,
    result: parseResult(res.result) ?? (executed ? null : { error: str(pick(res, ['error'])) }),
  };
}

export const dismissProposal = (id: number) =>
  postData({ url: `agent/proposals/${id}/dismiss/`, data: {} });

/**
 * A proposal can only be acted on once, and it may have been acted on elsewhere
 * — another device, or a double tap. The server answers 409 with the real state;
 * showing "Failed" for a proposal that actually saved would be worse than
 * useless, so map the server's word onto the card.
 */
export function statusFromError(e: unknown): ProposalStatus | null {
  const data = asRecord((e as { data?: unknown })?.data);
  const s = str(pick(data, ['proposal_status'])).toLowerCase() as ProposalStatus;
  return STATUSES.includes(s) ? s : null;
}

/** True when the copilot throttle (15/minute) rejected the request. */
export const isRateLimited = (e: unknown): boolean => (e as { status?: number })?.status === 429;

// ── Cache writes ───────────────────────────────────────────────────────────
/**
 * Append a settled turn to a thread's transcript.
 *
 * setQueryData rather than invalidate: the POST envelope carries more than the
 * GET (ai_available, actions, proposal), and a refetch would also race the
 * reveal animation that is running over the reply we already have.
 */
export function appendMessages(qc: QueryClient, conversationId: number, msgs: Msg[]) {
  qc.setQueryData<Msg[]>(conversationKey(conversationId), (prev) => [...(prev ?? []), ...msgs]);
}

/** Patch one message's proposal in place, e.g. pending → executed. */
export function patchProposal(
  qc: QueryClient,
  conversationId: number,
  proposalId: number,
  patch: Partial<Proposal>,
) {
  qc.setQueryData<Msg[]>(conversationKey(conversationId), (prev) =>
    (prev ?? []).map((m) =>
      m.proposal?.id === proposalId ? { ...m, proposal: { ...m.proposal, ...patch } } : m,
    ),
  );
}
