// What a reopened quote restores from its costing_inputs (the person's own
// choices). Pure, no imports: runs under `node --test`.

export interface ReopenedInputs {
  /** The typed border figure (comma decimal), or '' to use the fresh route's. */
  borderOverride: string;
  /** The typed clearing agent's fee, or ''. */
  agentFee: string;
  abnormalLoad: boolean;
}

const plain = (n: number) => String(n).replace('.', ',');

export function reopenedInputs(ci: unknown): ReopenedInputs {
  const c = (ci && typeof ci === 'object' ? ci : {}) as Record<string, unknown>;
  const border = typeof c.border_cost === 'number' ? c.border_cost : null;
  return {
    // Only a figure the person typed (border_cost_is_override); a route's
    // figure is worked out afresh on reopen.
    borderOverride: c.border_cost_is_override === true && border !== null && border >= 0 ? plain(border) : '',
    agentFee: typeof c.clearing_agent_fee === 'number' ? plain(c.clearing_agent_fee) : '',
    abnormalLoad: c.abnormal_load === true,
  };
}
