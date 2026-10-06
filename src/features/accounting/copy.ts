import type { ConnectionStatus, DocumentSyncStatus, Readiness } from './types';

// Wording for the accounting screens. Port of the web's lib/accounting.ts (copy)
// and components/accounting/connectionStatus.ts, kept in step so the same state
// reads the same on every platform.

/**
 * Readiness reasons that come from settings inside the accounting system
 * (e.g. QuickBooks "Custom transaction numbers"), as opposed to setup steps in
 * TruckWys, which the checklist already shows.
 */
const SETUP_REASON = /^(Choose which organisation|Reconnect |Disconnected|Map every |Confirm |Choose a cut-over date)/;
export const providerBlockers = (r: Readiness | null | undefined): string[] =>
  (r?.blocking_reasons ?? []).filter((x) => !SETUP_REASON.test(x));

/** "FUEL_SURCHARGE" -> "Fuel surcharge". */
export function humanise(s: string | null | undefined): string {
  const t = String(s ?? '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .toLowerCase();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

/** Friendly sentence for the OAuth callback's ?result=&reason=. */
export function callbackMessage(
  result: string | null,
  reason: string | null,
  providerName: string,
  org: 'organisation' | 'company' = 'organisation',
): { tone: 'success' | 'warning' | 'danger'; title: string; body: string } | null {
  if (!result) return null;
  if (result === 'connected') {
    return {
      tone: 'success',
      title: `${providerName} is connected`,
      body: 'Next, map your accounts and VAT, confirm your contacts and choose a start date.',
    };
  }
  if (result === 'choose_org') {
    return {
      tone: 'warning',
      title: `Choose your ${providerName} organisation`,
      body: `Your ${providerName} login has more than one organisation. Pick the one that holds this company's books.`,
    };
  }
  const reasons: Record<string, string> = {
    denied: `The connection was cancelled in ${providerName}. Nothing was changed.`,
    state_invalid:
      'The sign-in link expired or was opened in a different browser. Start the connection again from this page.',
    token_exchange_failed: `${providerName} didn't finish the sign-in. Wait a minute and try again.`,
    no_organisations: `Your ${providerName} login doesn't have access to any ${org}. Ask whoever runs your ${providerName} subscription to give you access, then try again.`,
    currency_not_supported: `This ${providerName} ${org}'s ${org === 'company' ? 'home' : 'base'} currency isn't ZAR. TruckWys only supports rand books for now.`,
    org_already_linked:
      org === 'company'
        ? `That ${providerName} company is already linked to another TruckWys company. Each ${providerName} company can only be linked once.`
        : `That ${providerName} organisation is already linked to another TruckWys company. An organisation can only be linked to one company.`,
    already_connected:
      'This company already has an accounting system connected. Disconnect it first, then connect the new one.',
    not_configured: `${providerName} isn't set up on this server yet.`,
    browser_mismatch: 'Finish connecting in the same browser you started from. Start again from TruckWys.',
    org_mismatch:
      org === 'company'
        ? `You reconnected to a different ${providerName} company. Reconnect and pick the company TruckWys was syncing with.`
        : `You reconnected without the organisation TruckWys was syncing with. Reconnect and tick that organisation.`,
    invalid_org: `That ${providerName} ${org} can't be used. Start again and choose the ${org} that holds this company's books.`,
  };
  return {
    tone: 'danger',
    title: `Couldn't connect ${providerName}`,
    body:
      (reason && reasons[reason]) ||
      `Something went wrong while connecting ${providerName}. Try again, and contact support if it keeps happening.`,
  };
}

const SECTION_LABEL: Record<string, string> = {
  revenue: 'Income',
  expense: 'Expense',
  tax_sales: 'VAT on sales',
  tax_purchases: 'VAT on purchases',
  receipts: 'Receipts bank account',
  tracking: 'Tracking',
};

/** "revenue:FUEL_SURCHARGE" -> "Fuel surcharge (income)". */
export function missingMappingLabel(key: string): string {
  const [section = '', item] = key.split(':');
  const head = SECTION_LABEL[section] ?? humanise(section);
  const lower = /^[A-Z][a-z]/.test(head) ? `${head.charAt(0).toLowerCase()}${head.slice(1)}` : head;
  return item ? `${humanise(item)} (${lower})` : head;
}

export const MATCH_METHOD_LABEL: Record<string, string> = {
  external_id: 'linked before',
  vat: 'same VAT number',
  registration: 'same company registration number',
  email: 'same email address',
  name: 'similar name only',
  created: 'created by TruckWys',
  manual: 'picked by hand',
};

export const OBJECT_TYPE_LABEL: Record<string, string> = {
  INVOICE: 'Invoice',
  CREDIT_NOTE: 'Credit note',
  BILL: 'Supplier bill',
  CONTACT_CUSTOMER: 'Customer',
  CONTACT_SUPPLIER: 'Supplier',
  PAYMENT: 'Payment',
};

// ---------------------------------------------------------------- status words

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/** Chip tone + label for a connection's status (the web's connectionChip). */
export function connectionChip(
  status: ConnectionStatus,
  readiness?: Readiness | null,
  attention = 0,
  providerShort?: string,
): { tone: StatusTone; label: string } {
  if (status === 'ACTIVE' && readiness && !readiness.sync_enabled) {
    const ownStepsDone =
      readiness.mapping_complete && readiness.contacts_to_confirm === 0 && readiness.backfill_state === 'DONE';
    if (ownStepsDone && providerBlockers(readiness).length) {
      return { tone: 'warning', label: providerShort ? `Change needed in ${providerShort}` : 'Setting to change' };
    }
    return readiness.backfill_state === 'RUNNING'
      ? { tone: 'info', label: 'Sending history' }
      : { tone: 'warning', label: 'Setup needed' };
  }
  if (status === 'ACTIVE' && attention > 0) {
    return { tone: 'warning', label: `${attention} ${attention === 1 ? 'needs' : 'need'} attention` };
  }
  switch (status) {
    case 'ACTIVE':
      return { tone: 'success', label: 'Connected' };
    case 'NEEDS_REAUTH':
      return { tone: 'danger', label: 'Sign-in expired' };
    case 'PENDING_ORG':
      return { tone: 'warning', label: 'Organisation not chosen' };
    default:
      return { tone: 'neutral', label: 'Disconnected' };
  }
}

/** Chip tone + label for an invoice's / credit note's sync to the accounting system. */
export function documentSyncChip(status: DocumentSyncStatus | string): { tone: StatusTone; label: string } {
  switch (status) {
    case 'SYNCED':
      return { tone: 'success', label: 'In sync' };
    case 'PENDING':
      return { tone: 'info', label: 'Waiting to send' };
    case 'ERROR':
      return { tone: 'warning', label: 'Not up to date' };
    case 'DEAD':
      return { tone: 'danger', label: 'Failed' };
    case 'BLOCKED':
      return { tone: 'warning', label: 'Blocked' };
    case 'VOIDED':
      return { tone: 'neutral', label: 'Voided' };
    default:
      return { tone: 'neutral', label: String(status || '—') };
  }
}
