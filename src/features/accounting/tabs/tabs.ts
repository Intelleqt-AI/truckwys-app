export type AccountingTab = 'setup' | 'mapping' | 'contacts' | 'cutover' | 'sync' | 'reconciliation';

export const ACCOUNTING_TABS: { id: AccountingTab; label: string }[] = [
  { id: 'setup', label: 'Setup' },
  { id: 'mapping', label: 'Mapping' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'cutover', label: 'Start date' },
  { id: 'sync', label: 'Sync' },
  { id: 'reconciliation', label: 'Reconciliation' },
];

export const isAccountingTab = (v: string | null | undefined): v is AccountingTab =>
  !!v && ACCOUNTING_TABS.some((t) => t.id === v);
