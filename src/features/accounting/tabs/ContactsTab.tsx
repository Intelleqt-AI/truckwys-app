import { useEffect, useMemo, useState } from 'react';
import { View, Modal, FlatList, TouchableOpacity } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Button,
  FilterChips,
  OverflowMenu,
  SearchField,
  Txt,
  Mono,
  type OverflowAction,
} from '@/components/ui';
import { ListSkeleton } from '@/components/feedback';
import { toast } from '@/lib/toast';
import {
  ACCT_KEYS,
  accountingApi,
  apiMessage,
  invalidateAccounting,
  useContacts,
} from '../api';
import { MATCH_METHOD_LABEL, type StatusTone } from '../copy';
import { useAccountingPermissions } from '../permissions';
import {
  providerConfig,
  type Connection,
  type ContactConfirmBody,
  type ContactKind,
  type ContactMatch,
  type ContactStatus,
  type ContactsResponse,
  type ProviderContact,
} from '../types';
import { AcctCard, ErrorBlock, ToneBadge, plural } from '../components/AcctUi';

type StatusFilter = 'ALL' | ContactStatus;
type KindFilter = 'ALL' | ContactKind;

const STATUS_META: Record<ContactStatus, { tone: StatusTone; label: string }> = {
  SUGGESTED: { tone: 'warning', label: 'To confirm' },
  UNMATCHED: { tone: 'neutral', label: 'No match' },
  CREATE: { tone: 'info', label: 'New contact' },
  MATCHED: { tone: 'success', label: 'Matched' },
  SKIPPED: { tone: 'neutral', label: 'Skipped' },
};
const ORDER: ContactStatus[] = ['SUGGESTED', 'UNMATCHED', 'CREATE', 'SKIPPED', 'MATCHED'];

const KIND_OPTIONS: { label: string; value: KindFilter }[] = [
  { label: 'All types', value: 'ALL' },
  { label: 'Customers', value: 'CUSTOMER' },
  { label: 'Suppliers', value: 'SUPPLIER' },
];

/** Link each TruckWys customer and supplier to its contact in the provider. */
export function ContactsTab({ connection }: { connection: Connection }) {
  const qc = useQueryClient();
  const cfg = providerConfig(connection.provider);
  const { canWrite } = useAccountingPermissions();
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [kind, setKind] = useState<KindFilter>('ALL');
  const [busyRow, setBusyRow] = useState<number | null>(null);
  const [picking, setPicking] = useState<ContactMatch | null>(null);
  const [matching, setMatching] = useState(false);
  const [term, setTerm] = useState('');

  const q = useContacts(status, kind);
  const summary = q.data?.summary ?? {};
  const total = ORDER.reduce((n, s) => n + (summary[s] ?? 0), 0);
  const toDo = (summary.SUGGESTED ?? 0) + (summary.UNMATCHED ?? 0);

  const rows = useMemo(() => {
    const list = [...(q.data?.results ?? [])];
    list.sort(
      (a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.local_name.localeCompare(b.local_name),
    );
    const t = term.trim().toLowerCase();
    return t
      ? list.filter((r) =>
          [r.local_name, r.external_name, r.local_vat, r.local_email].some((v) => (v ?? '').toLowerCase().includes(t)),
        )
      : list;
  }, [q.data, term]);

  const confirm = async (row: ContactMatch, body: ContactConfirmBody, done: string) => {
    setBusyRow(row.id);
    try {
      const updated = await accountingApi.confirmContact(row.id, body);
      qc.setQueryData<ContactsResponse>(ACCT_KEYS.contacts(status, kind), (old) =>
        old ? { ...old, results: old.results.map((r) => (r.id === updated.id ? updated : r)) } : old,
      );
      toast.success(done);
      void qc.invalidateQueries({ queryKey: ACCT_KEYS.contactsAll });
      void qc.invalidateQueries({ queryKey: ACCT_KEYS.connection });
      void qc.invalidateQueries({ queryKey: ACCT_KEYS.providers });
      setPicking(null);
    } catch (e) {
      toast.error(apiMessage(e, `Couldn't update ${row.local_name}. Try again.`));
    } finally {
      setBusyRow(null);
    }
  };

  const runMatching = async () => {
    setMatching(true);
    try {
      const { summary: s } = await accountingApi.runMatching();
      toast.success(`Matching done: ${s.MATCHED ?? 0} matched, ${s.SUGGESTED ?? 0} to confirm, ${s.UNMATCHED ?? 0} not found.`);
      invalidateAccounting(qc);
    } catch (e) {
      toast.error(apiMessage(e, "Couldn't run matching. Try again."));
    } finally {
      setMatching(false);
    }
  };

  const statusOptions: { value: StatusFilter; label: string; count?: number }[] = [
    { value: 'ALL', label: 'All', count: total },
    // Empty statuses stay out of the way (the current one always shows).
    ...ORDER.filter((s) => (summary[s] ?? 0) > 0 || s === status).map((s) => ({
      value: s as StatusFilter,
      label: STATUS_META[s].label,
      count: summary[s] ?? 0,
    })),
  ];

  return (
    <>
      <AcctCard
        title="Match contacts"
        description={
          <View className="gap-1.5">
            {toDo > 0 ? (
              <Txt className="text-sub font-medium text-fg">
                {plural(toDo, 'contact')} need{toDo === 1 ? 's' : ''} a decision.
              </Txt>
            ) : total > 0 ? (
              <Txt className="text-sub font-medium text-fg">Every contact is sorted.</Txt>
            ) : null}
            <Txt className="text-sub text-muted">
              We match on VAT number, registration number or email. Name-only matches need your confirmation.
            </Txt>
          </View>
        }
        actions={
          <Button
            label={matching ? 'Matching…' : 'Run matching again'}
            icon="refresh"
            variant="secondary"
            size="sm"
            loading={matching}
            disabled={!canWrite || matching}
            onPress={() => void runMatching()}
          />
        }
      />

      <View className="mb-3 gap-3">
        <SearchField value={term} onChangeText={setTerm} placeholder="Search name, VAT or email" />
        <FilterChips options={statusOptions} value={status} onChange={setStatus} />
        <FilterChips options={KIND_OPTIONS} value={kind} onChange={setKind} />
      </View>

      {q.isLoading ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <AcctCard>
          <ErrorBlock message={apiMessage(q.error, "Couldn't load contacts.")} onRetry={() => void q.refetch()} />
        </AcctCard>
      ) : rows.length === 0 ? (
        <Txt className="py-8 text-center text-sub text-muted">
          {term.trim()
            ? `No contacts match "${term.trim()}".`
            : status === 'ALL'
              ? 'No customers or suppliers with documents to send yet.'
              : `No contacts are "${STATUS_META[status].label.toLowerCase()}".`}
        </Txt>
      ) : (
        <View className="gap-2.5">
          {rows.map((row) => (
            <ContactRow
              key={row.id}
              row={row}
              providerName={cfg.short}
              canWrite={canWrite}
              busy={busyRow === row.id}
              onConfirm={(body, done) => void confirm(row, body, done)}
              onPick={() => setPicking(row)}
            />
          ))}
        </View>
      )}

      {picking && (
        <PickContactModal
          row={picking}
          providerName={cfg.short}
          busy={busyRow === picking.id}
          onClose={() => setPicking(null)}
          onPick={(c) => void confirm(picking, { external_id: c.external_id }, `${picking.local_name} linked to ${c.name}`)}
        />
      )}
    </>
  );
}

function ContactRow({
  row,
  providerName,
  canWrite,
  busy,
  onConfirm,
  onPick,
}: {
  row: ContactMatch;
  providerName: string;
  canWrite: boolean;
  busy: boolean;
  onConfirm: (body: ContactConfirmBody, done: string) => void;
  onPick: () => void;
}) {
  const meta = STATUS_META[row.status] ?? { tone: 'neutral' as StatusTone, label: row.status };
  // One identifier is enough to recognise them: VAT, else registration, else email.
  const ids = row.local_vat
    ? `VAT ${row.local_vat}`
    : row.local_registration
      ? `Reg ${row.local_registration}`
      : row.local_email;
  const suggestedId = row.external_id ?? row.candidates[0]?.external_id ?? null;
  const suggestedName = row.external_name ?? row.candidates[0]?.name ?? null;

  let match: string;
  if (row.status === 'MATCHED' || row.status === 'SUGGESTED') {
    match = `${providerName} contact: ${suggestedName ?? '—'}${row.method ? `\nMatched on ${MATCH_METHOD_LABEL[row.method] ?? row.method}` : `\nIn ${providerName}`}`;
  } else if (row.status === 'CREATE') {
    match = `Will be created in ${providerName} when the first document is sent.`;
  } else if (row.status === 'SKIPPED') {
    match = 'Not synced. Their documents stay in TruckWys only and show as sync errors.';
  } else {
    match = `No ${providerName} contact found.`;
  }

  const menu: OverflowAction[] = [];
  let primary: React.ReactNode = null;
  if (canWrite) {
    if (row.status === 'SUGGESTED' && suggestedId) {
      primary = (
        <Button
          label={busy ? 'Saving…' : 'Confirm match'}
          size="sm"
          loading={busy}
          onPress={() =>
            onConfirm({ external_id: suggestedId }, `${row.local_name} linked to ${suggestedName ?? 'the suggested contact'}`)
          }
        />
      );
      menu.push({ label: 'Pick another', onPress: onPick });
    } else if (row.status === 'UNMATCHED') {
      primary = (
        <View className="flex-row gap-2">
          <Button label="Pick a contact" size="sm" variant="secondary" disabled={busy} onPress={onPick} />
          <Button
            label="Create new"
            size="sm"
            variant="secondary"
            disabled={busy}
            onPress={() => onConfirm({ action: 'create' }, `${row.local_name} will be created in ${providerName}`)}
          />
        </View>
      );
    } else {
      menu.push({ label: row.status === 'MATCHED' ? 'Change contact' : 'Pick a contact', onPress: onPick });
    }
    if (row.status !== 'CREATE' && row.status !== 'UNMATCHED') {
      menu.push({
        label: `Create new in ${providerName}`,
        disabled: busy,
        onPress: () => onConfirm({ action: 'create' }, `${row.local_name} will be created in ${providerName}`),
      });
    }
    if (row.status !== 'SKIPPED') {
      menu.push({
        label: "Skip, don't sync",
        destructive: true,
        disabled: busy,
        onPress: () => onConfirm({ action: 'skip' }, `${row.local_name} skipped`),
      });
    }
  }

  return (
    <View
      className={`gap-2.5 rounded-card border bg-surface p-3.5 ${
        row.status === 'SUGGESTED' ? 'border-line-strong' : 'border-line'
      }`}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Txt className="text-body font-medium text-fg">{row.local_name}</Txt>
          <Txt className="mt-0.5 text-caption text-muted">
            {row.kind === 'SUPPLIER' ? 'Supplier' : 'Customer'}
            {ids ? ` · ${ids}` : ''}
          </Txt>
        </View>
        <ToneBadge tone={meta.tone} label={meta.label} />
        {menu.length > 0 && <OverflowMenu actions={menu} accessibilityLabel={`Actions for ${row.local_name}`} title={row.local_name} />}
      </View>
      <Txt className="text-sub text-muted">{match}</Txt>
      {primary}
    </View>
  );
}

/** Search the provider's contacts and link one. */
function PickContactModal({
  row,
  providerName,
  busy,
  onClose,
  onPick,
}: {
  row: ContactMatch;
  providerName: string;
  busy: boolean;
  onClose: () => void;
  onPick: (c: ProviderContact) => void;
}) {
  const insets = useSafeAreaInsets();
  const [term, setTerm] = useState(row.local_name);
  const [debounced, setDebounced] = useState(row.local_name);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(t);
  }, [term]);

  const search = useQuery({
    queryKey: ['accounting', 'contact-search', row.kind, debounced],
    queryFn: () => accountingApi.searchContacts(debounced, row.kind),
    enabled: debounced.length >= 2,
    retry: 0,
    staleTime: 60_000,
  });

  const candidates: ProviderContact[] = row.candidates.map((c) => ({
    external_id: c.external_id,
    name: c.name,
    vat: c.vat,
    email: c.email,
  }));
  const results = (search.data?.results ?? []).filter((r) => !candidates.some((c) => c.external_id === r.external_id));

  type Item = { header: string } | { contact: ProviderContact };
  const data: Item[] = [
    ...(candidates.length ? [{ header: 'Possible matches' }, ...candidates.map((contact) => ({ contact }))] : []),
    ...(results.length ? [{ header: `Search results` }, ...results.map((contact) => ({ contact }))] : []),
  ];

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-bg-deep" style={{ paddingTop: insets.top + 8 }}>
        <View className="flex-row items-center justify-between px-screen pb-1">
          <View className="flex-1 pr-3">
            <Txt className="text-heading font-semibold text-fg">Pick a {providerName} contact</Txt>
            <Txt className="mt-0.5 text-caption text-muted" numberOfLines={2}>
              For {row.local_name}
              {row.local_vat ? ` (VAT ${row.local_vat})` : ''}.
            </Txt>
          </View>
          <TouchableOpacity hitSlop={12} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} disabled={busy}>
            <Mono className="text-callout font-medium text-link">Close</Mono>
          </TouchableOpacity>
        </View>
        <View className="px-screen py-3">
          <SearchField value={term} onChangeText={setTerm} placeholder="Name, VAT number or email" />
          {debounced.length < 2 ? (
            <Txt className="mt-2 text-caption text-muted">Type at least two letters.</Txt>
          ) : search.isLoading ? (
            <Txt className="mt-2 text-caption text-muted">Searching {providerName}…</Txt>
          ) : search.isError ? (
            <Txt className="mt-2 text-caption text-danger">
              {apiMessage(search.error, `Couldn't search ${providerName}. Try again.`)}
            </Txt>
          ) : results.length === 0 ? (
            <Txt className="mt-2 text-caption text-muted">{`No ${providerName} contacts match “${debounced}”.`}</Txt>
          ) : null}
        </View>
        <FlatList
          data={data}
          keyExtractor={(it, i) => ('header' in it ? `h-${it.header}` : `c-${it.contact.external_id}-${i}`)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            if ('header' in item) {
              return <Txt className="mb-1 mt-3 text-sub font-medium text-muted">{item.header}</Txt>;
            }
            const c = item.contact;
            const linked = c.external_id === row.external_id;
            return (
              <View className="min-h-[56px] flex-row items-center gap-3 border-b border-line-row py-3">
                <View className="flex-1">
                  <Txt className="text-body text-fg">{c.name}</Txt>
                  {(c.vat || c.email) && (
                    <Txt className="mt-0.5 text-caption text-muted">
                      {[c.vat && `VAT ${c.vat}`, c.email].filter(Boolean).join(' · ')}
                    </Txt>
                  )}
                </View>
                <Button
                  label={linked ? 'Linked' : 'Link'}
                  size="sm"
                  variant={linked ? 'secondary' : 'primary'}
                  disabled={busy || linked}
                  onPress={() => onPick(c)}
                />
              </View>
            );
          }}
        />
      </View>
    </Modal>
  );
}
