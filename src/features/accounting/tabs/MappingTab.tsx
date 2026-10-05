import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Button, SelectField, Txt, type Option } from '@/components/ui';
import { ListSkeleton } from '@/components/feedback';
import { formatRelativeTime } from '@/lib/formatters';
import { toast } from '@/lib/toast';
import {
  ACCT_KEYS,
  accountingApi,
  apiFieldErrors,
  apiMessage,
  invalidateAccounting,
  useMapping,
} from '../api';
import { missingMappingLabel } from '../copy';
import { useAccountingFooter } from '../footer';
import { useAccountingPermissions } from '../permissions';
import {
  providerConfig,
  type Connection,
  type MappingSection,
  type MappingUpdate,
  type ProviderAccount,
  type ProviderTaxRate,
  type TrackingMapping,
} from '../types';
import { AcctCard, ErrorBlock, LinkButton } from '../components/AcctUi';

const NONE = '';

/** "A", "A and B", "A, B and C". */
const listJoin = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

type SectionDraft = Partial<Record<string, string | null>>;
interface Draft {
  revenue_types: SectionDraft;
  expense_categories: SectionDraft;
  tax_sales: SectionDraft;
  tax_purchases: SectionDraft;
  receipts_account?: string | null;
  tracking?: TrackingMapping;
}
const EMPTY_DRAFT: Draft = { revenue_types: {}, expense_categories: {}, tax_sales: {}, tax_purchases: {} };

const SECTIONS: MappingSection[] = ['revenue_types', 'expense_categories', 'tax_sales', 'tax_purchases'];
const PREFIX: Record<MappingSection, string> = {
  revenue_types: 'revenue',
  expense_categories: 'expense',
  tax_sales: 'tax_sales',
  tax_purchases: 'tax_purchases',
};

const num = (s: string | null | undefined) => {
  const n = parseFloat(String(s ?? ''));
  return Number.isNaN(n) ? null : n;
};
const pct = (s: string | null | undefined) => {
  const n = num(s);
  return n == null ? '' : `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}%`;
};
// Items ("item:12") and QuickBooks account ids mean nothing to people: name only.
const accountLabel = (a: ProviderAccount, showCodes = true) =>
  !showCodes || a.type === 'ITEM' || !a.code ? a.name : `${a.code} · ${a.name}`;
const taxLabel = (t: ProviderTaxRate) => `${t.name} (${pct(t.rate)})`;

/**
 * Accounts and VAT: where each kind of TruckWys line lands in the provider.
 * Suggestions are shown as a one-tap hint and never saved on their own.
 */
export function MappingTab({ connection }: { connection: Connection }) {
  const qc = useQueryClient();
  const cfg = providerConfig(connection.provider);
  const { canWrite, writeTitle } = useAccountingPermissions();
  const q = useMapping();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [optionalOpen, setOptionalOpen] = useState(false);
  // Sections someone opened (Edit) or closed (Done) by hand; otherwise a section
  // is open only while it needs input.
  const [sectionOpen, setSectionOpen] = useState<Partial<Record<MappingSection, boolean>>>({});
  const [showAll, setShowAll] = useState<Partial<Record<MappingSection, boolean>>>({});
  const m = q.data;

  // ---- effective values (draft over saved)
  const sectionValue = (section: MappingSection, key: string): string | null => {
    const d = draft[section];
    if (key in d) return d[key] ?? null;
    const row = (m?.[section] ?? []).find((r) => r.key === key);
    if (!row) return null;
    return 'account_code' in row ? row.account_code : row.tax_code;
  };
  const receipts = draft.receipts_account !== undefined ? draft.receipts_account : (m?.receipts_account ?? null);
  const tracking: TrackingMapping = draft.tracking ??
    m?.tracking ?? { vehicle_category_id: null, branch_category_id: null, branch_option: '' };

  // ---- what changed, as a PUT body
  const changes = useMemo<MappingUpdate>(() => {
    if (!m) return {};
    const out: MappingUpdate = {};
    for (const section of SECTIONS) {
      const changed: Record<string, string | null> = {};
      for (const [key, val] of Object.entries(draft[section])) {
        const row = (m[section] as { key: string; account_code?: string | null; tax_code?: string | null }[]).find(
          (r) => r.key === key,
        );
        const saved = row ? (row.account_code ?? row.tax_code ?? null) : null;
        if ((val ?? null) !== saved) changed[key] = val ?? null;
      }
      if (Object.keys(changed).length) out[section] = changed;
    }
    if (draft.receipts_account !== undefined && draft.receipts_account !== m.receipts_account) {
      out.receipts_account = draft.receipts_account;
    }
    if (draft.tracking && JSON.stringify(draft.tracking) !== JSON.stringify(m.tracking)) out.tracking = draft.tracking;
    return out;
  }, [draft, m]);
  const changeCount = Object.values(changes).reduce<number>(
    (n, v) => n + (v && typeof v === 'object' && !('vehicle_category_id' in v) ? Object.keys(v).length : 1),
    0,
  );
  const dirty = changeCount > 0;

  const setSection = (section: MappingSection, key: string, value: string | null) => {
    setDraft((d) => ({ ...d, [section]: { ...d[section], [key]: value } }));
    setErrors((e) => {
      const n = { ...e };
      delete n[`${section}.${key}`];
      return n;
    });
  };

  // ---- suggestions not yet in the draft
  const pendingSuggestions = useMemo(() => {
    const list: { section: MappingSection; key: string; value: string }[] = [];
    if (!m) return list;
    for (const section of SECTIONS) {
      for (const [key, value] of Object.entries(m.suggestions?.[section] ?? {})) {
        if (value && sectionValue(section, key) !== value) list.push({ section, key, value });
      }
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m, draft]);

  const applyAllSuggestions = () =>
    setDraft((d) => {
      const next: Draft = {
        ...d,
        revenue_types: { ...d.revenue_types },
        expense_categories: { ...d.expense_categories },
        tax_sales: { ...d.tax_sales },
        tax_purchases: { ...d.tax_purchases },
      };
      for (const s of pendingSuggestions) next[s.section][s.key] = s.value;
      return next;
    });

  const save = async () => {
    if (!dirty) return;
    setSaving(true);
    setErrors({});
    setFormError('');
    try {
      const saved = await accountingApi.saveMapping(changes);
      qc.setQueryData(ACCT_KEYS.mapping, saved);
      setDraft(EMPTY_DRAFT);
      invalidateAccounting(qc);
      toast.success(
        saved.complete ? 'Mapping saved. Everything is mapped.' : `Mapping saved. ${saved.missing.length} still to map.`,
      );
    } catch (e) {
      const fieldErrors = apiFieldErrors(e);
      setErrors(fieldErrors);
      setFormError(
        Object.keys(fieldErrors).length
          ? 'Some choices need another look. See the messages under each field.'
          : apiMessage(e, "Couldn't save the mapping. Try again."),
      );
    } finally {
      setSaving(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      const fresh = await accountingApi.refreshOptions();
      qc.setQueryData(ACCT_KEYS.mapping, fresh);
      toast.success(`Accounts, VAT rates and tracking read again from ${cfg.short}`);
    } catch (e) {
      toast.error(apiMessage(e, `Couldn't read from ${cfg.short}. Try again.`));
    } finally {
      setRefreshing(false);
    }
  };

  // The pinned save bar: what is unsaved, Discard and Save. Memoised on what it
  // shows (a fresh node every render would make the footer slot re-render the tab
  // forever), with Save going through a ref so it never runs a stale draft.
  const saveRef = useRef(save);
  saveRef.current = save;
  const footerNode = useMemo(
    () =>
      canWrite && (dirty || formError) ? (
        <View className="gap-2.5">
          <Txt
            className={`text-caption ${formError ? 'text-danger' : 'text-muted'}`}
            accessibilityRole={formError ? 'alert' : undefined}
          >
            {formError || `${changeCount} unsaved ${changeCount === 1 ? 'change' : 'changes'}`}
          </Txt>
          <View className="flex-row gap-2.5">
            <View className="flex-1">
              <Button
                label="Discard"
                variant="secondary"
                disabled={saving || !dirty}
                onPress={() => {
                  setDraft(EMPTY_DRAFT);
                  setErrors({});
                  setFormError('');
                }}
                fullWidth
              />
            </View>
            <View className="flex-[1.6]">
              <Button
                label={saving ? 'Saving…' : 'Save mapping'}
                loading={saving}
                disabled={!dirty || saving}
                onPress={() => void saveRef.current()}
                fullWidth
              />
            </View>
          </View>
        </View>
      ) : null,
    [canWrite, dirty, formError, changeCount, saving],
  );
  useAccountingFooter(footerNode);

  if (q.isLoading) return <ListSkeleton rows={6} />;
  if (q.isError || !m) {
    return (
      <AcctCard title="Mapping">
        <ErrorBlock message={apiMessage(q.error, "Couldn't load the mapping.")} onRetry={() => void q.refetch()} />
      </AcctCard>
    );
  }

  const allAccounts = m.options.accounts ?? [];
  // QuickBooks: revenue types go to products/services (ITEM); everything else to plain accounts.
  const itemsForRevenue = cfg.revenueTarget === 'item';
  const items = allAccounts.filter((a) => a.type === 'ITEM');
  const accounts = itemsForRevenue ? allAccounts.filter((a) => a.type !== 'ITEM') : allAccounts;
  const revenueOptions = itemsForRevenue ? items : allAccounts;
  const taxRates = m.options.tax_rates ?? [];
  const cats = m.options.tracking_categories ?? [];
  const tl = cfg.tracking;
  const vehicleCats = tl.vehicleCat ? cats.filter((c) => c.id === tl.vehicleCat) : cats;
  const branchCats = tl.branchCatId ? cats.filter((c) => c.id === tl.branchCatId) : cats;
  // Read-only for anyone who can't change the mapping (and while it is saving):
  // the selects have no disabled state, so the rows that hold them are locked.
  const locked = !canWrite || saving;
  const lockProps = locked ? { pointerEvents: 'none' as const, style: { opacity: 0.7 } } : {};
  const branchCat = cats.find((c) => c.id === tracking.branch_category_id);
  // Optional cards fold away unless something is set or has an error there.
  const showOptional =
    optionalOpen ||
    !!receipts ||
    !!tracking.vehicle_category_id ||
    !!tracking.branch_category_id ||
    Object.keys(errors).some((k) => k === 'receipts_account' || k.startsWith('tracking.'));

  // The server's "missing" list says which empty rows block the sync; any other
  // empty row is optional. Both are labelled, so nothing is guesswork.
  const requiredGap = (section: MappingSection, key: string) =>
    !sectionValue(section, key) && (m.missing ?? []).includes(`${PREFIX[section]}:${key}`);
  const isOptional = (section: MappingSection, key: string) => !(m.missing ?? []).includes(`${PREFIX[section]}:${key}`);
  const needsInput = (section: MappingSection) =>
    (m.missing ?? []).some((k) => k.startsWith(`${PREFIX[section]}:`)) ||
    Object.keys(errors).some((k) => k.startsWith(`${section}.`)) ||
    Object.keys(draft[section]).length > 0;
  const isOpen = (section: MappingSection) => sectionOpen[section] ?? needsInput(section);
  const openSection = (section: MappingSection, open: boolean) => setSectionOpen((o) => ({ ...o, [section]: open }));
  /** "6 mapped" or "2 mapped, 2 not used": what a folded section holds. */
  const sectionSummary = (section: MappingSection) => {
    const rows = m[section] as { key: string }[];
    const mapped = rows.filter((r) => !!sectionValue(section, r.key)).length;
    const unused = rows.length - mapped;
    return `All set: ${mapped} mapped${unused ? `, ${unused} not used` : ''}.`;
  };
  /** Inside a section opened for its gaps, only the rows that need input show. */
  const rowNeeds = (section: MappingSection, key: string) =>
    requiredGap(section, key) || !!errors[`${section}.${key}`] || key in draft[section];
  const visibleRows = <R extends { key: string }>(section: MappingSection, rows: R[]): R[] =>
    showAll[section] || sectionOpen[section] || !rows.some((r) => rowNeeds(section, r.key))
      ? rows
      : rows.filter((r) => rowNeeds(section, r.key));
  const rowLabel = (section: MappingSection, key: string) =>
    ((m[section] as { key: string; label: string }[]).find((r) => r.key === key)?.label ?? key).replace(/\s*\(.*\)$/, '');
  const describeAccount = (code: string) => {
    const a = allAccounts.find((x) => x.code === code);
    return a ? accountLabel(a, cfg.showAccountCodes) : code;
  };
  const describeTax = (code: string) => {
    const t = taxRates.find((x) => x.code === code);
    return t ? taxLabel(t) : code;
  };

  // ---- select option lists (preferred group first; the group name is the sub-line)
  const accountOptions = (
    list: ProviderAccount[],
    prefer: (a: ProviderAccount) => boolean,
    preferLabel: string,
    noneLabel: string,
    value: string | null,
  ): Option[] => {
    const withCode = list.filter((a) => a.code);
    const first = withCode.filter(prefer);
    const rest = withCode.filter((a) => !prefer(a));
    const opts: Option[] = [{ label: noneLabel, value: NONE }];
    if (value && !withCode.some((a) => a.code === value)) {
      opts.push({ label: `${value} (no longer in the list)`, value });
    }
    first.forEach((a) => opts.push({ label: accountLabel(a, cfg.showAccountCodes), value: a.code, sub: preferLabel }));
    rest.forEach((a) => opts.push({ label: accountLabel(a, cfg.showAccountCodes), value: a.code, sub: 'Other accounts' }));
    return opts;
  };
  const taxOptions = (
    prefer: (t: ProviderTaxRate) => boolean,
    preferLabel: string,
    noneLabel: string,
    value: string | null,
  ): Option[] => {
    const first = taxRates.filter(prefer);
    const rest = taxRates.filter((t) => !prefer(t));
    const opts: Option[] = [{ label: noneLabel, value: NONE }];
    if (value && !taxRates.some((t) => t.code === value)) opts.push({ label: `${value} (no longer in the list)`, value });
    first.forEach((t) => opts.push({ label: taxLabel(t), value: t.code, sub: preferLabel }));
    rest.forEach((t) => opts.push({ label: taxLabel(t), value: t.code, sub: 'Other rates' }));
    return opts;
  };

  // A row: label, the select, the suggestion or "required" hint, and any server error.
  const suggestion = (section: MappingSection, key: string, describe: (v: string) => string) => {
    const s = m.suggestions?.[section]?.[key];
    if (s && sectionValue(section, key) !== s) {
      return (
        <View className="mt-1.5 flex-row flex-wrap items-center gap-x-3">
          <Txt className={`text-caption ${requiredGap(section, key) ? 'text-warning' : 'text-muted'}`}>
            {requiredGap(section, key) ? 'Required. ' : ''}Suggested: {describe(s)}
          </Txt>
          {canWrite && <LinkButton label="Use it" onPress={() => setSection(section, key, s)} />}
        </View>
      );
    }
    if (requiredGap(section, key)) return <Txt className="mt-1.5 text-caption text-warning">Required.</Txt>;
    return null;
  };

  const folded = (section: MappingSection, title: string) => (
    <AcctCard
      key={section}
      title={title}
      description={sectionSummary(section)}
      actions={<Button label="Edit" variant="secondary" size="sm" onPress={() => openSection(section, true)} />}
    />
  );

  const showAllFooter = (section: MappingSection, rows: { key: string }[]) => {
    const shown = visibleRows(section, rows).length;
    if (shown === rows.length && !showAll[section]) return null;
    return (
      <View className="px-4 pb-3.5">
        <LinkButton
          label={
            showAll[section]
              ? 'Show only what needs input'
              : `Show all ${rows.length} (${rows.length - shown} already mapped)`
          }
          onPress={() => setShowAll((o) => ({ ...o, [section]: !o[section] }))}
        />
      </View>
    );
  };

  const doneAction = (section: MappingSection) =>
    sectionOpen[section] && !needsInput(section) ? (
      <Button label="Done" variant="ghost" size="sm" onPress={() => openSection(section, false)} />
    ) : undefined;

  const accountSectionCard = (
    section: 'revenue_types' | 'expense_categories',
    title: string,
    description: string,
    options: ProviderAccount[],
    prefer: (a: ProviderAccount) => boolean,
    preferLabel: string,
  ) =>
    !isOpen(section) ? (
      folded(section, title)
    ) : (
      <AcctCard key={section} title={title} description={description} actions={doneAction(section)} flush>
        {section === 'revenue_types' && itemsForRevenue && items.length === 0 && (
          <Txt className="px-4 pt-3 text-caption text-muted">
            No products or services came back from {cfg.short}. Add a Service item there, then refresh.
          </Txt>
        )}
        {visibleRows(section, m[section]).map((row, i, arr) => {
          const field = `${section}.${row.key}`;
          const value = sectionValue(section, row.key);
          return (
            <View
              key={row.key}
              className={`px-4 py-3 ${i < arr.length - 1 || showAllFooter(section, m[section]) ? 'border-b border-line-row' : ''}`}
              {...lockProps}
            >
              <SelectField
                label={`${row.label}${!value && !requiredGap(section, row.key) ? ' · optional' : ''}`}
                value={value ?? NONE}
                options={accountOptions(
                  options,
                  prefer,
                  preferLabel,
                  isOptional(section, row.key) ? 'Not used' : 'Not mapped',
                  value,
                )}
                onSelect={(v) => setSection(section, row.key, v === NONE ? null : v)}
                error={errors[field]}
              />
              {suggestion(section, row.key, describeAccount)}
            </View>
          );
        })}
        {showAllFooter(section, m[section])}
      </AcctCard>
    );

  return (
    <>
      <AcctCard
        title={
          m.complete && !dirty
            ? 'Everything required is mapped'
            : m.missing.length > 0
              ? `${m.missing.length} required ${m.missing.length === 1 ? 'line' : 'lines'} still to map`
              : 'Unsaved changes'
        }
        description={
          <View className="gap-1.5">
            <Txt className="text-sub text-muted">Nothing is sent to {cfg.short} until every required line is mapped.</Txt>
            <View className="flex-row flex-wrap items-center gap-x-3">
              {m.options.fetched_at && (
                <Txt className="text-caption text-faint">
                  Account list from {formatRelativeTime(m.options.fetched_at).toLowerCase()}
                </Txt>
              )}
              <LinkButton
                label={refreshing ? 'Reading…' : `Refresh from ${cfg.short}`}
                onPress={() => void refresh()}
                disabled={!canWrite || refreshing}
              />
            </View>
            {m.missing.length > 0 && !(m.complete && !dirty) && (
              <View className="mt-1 gap-0.5">
                {m.missing.map((k) => (
                  <Txt key={k} className="text-caption text-warning">
                    • {missingMappingLabel(k)}
                  </Txt>
                ))}
              </View>
            )}
            {!canWrite && !!writeTitle && (
              <Txt className="text-caption text-faint">{writeTitle}; you can look but not change anything.</Txt>
            )}
          </View>
        }
        actions={
          canWrite && pendingSuggestions.length > 0 ? (
            <Button
              label={`Use suggestion${pendingSuggestions.length === 1 ? '' : 's'} for ${listJoin(pendingSuggestions.map((p) => rowLabel(p.section, p.key)))}`}
              size="sm"
              onPress={applyAllSuggestions}
            />
          ) : undefined
        }
      />
      {canWrite && pendingSuggestions.length > 0 && (
        <Txt className="-mt-2 mb-4 text-caption text-faint">
          Fills in the fields; nothing is saved until you tap Save mapping.
        </Txt>
      )}

      {accountSectionCard(
        'revenue_types',
        itemsForRevenue ? 'Products and services' : 'Income accounts',
        itemsForRevenue
          ? `The ${cfg.short} product for each charge. Its income account decides where the money goes.`
          : 'Which income account each kind of charge on your invoices goes to.',
        revenueOptions,
        (a) => a.class === 'REVENUE',
        itemsForRevenue ? 'Products/services' : 'Income accounts',
      )}

      {accountSectionCard(
        'expense_categories',
        'Expense accounts',
        'Where supplier bills go, by expense category.',
        accounts,
        (a) => a.class === 'EXPENSE',
        'Expense accounts',
      )}

      {(['tax_sales', 'tax_purchases'] as const).map((section) => {
        const title = section === 'tax_sales' ? 'VAT on sales' : 'VAT on purchases';
        if (!isOpen(section)) return folded(section, title);
        const rows = m[section];
        return (
          <AcctCard
            key={section}
            title={title}
            description={
              section === 'tax_sales'
                ? `For invoices and credit notes. Pick a ${cfg.short} rate with the same percentage.`
                : `For supplier bills. Pick a ${cfg.short} rate with the same percentage.`
            }
            actions={doneAction(section)}
            flush
          >
            {visibleRows(section, rows).map((row, i, arr) => {
              const field = `${section}.${row.key}`;
              const value = sectionValue(section, row.key);
              const chosen = taxRates.find((t) => t.code === value);
              const mismatch =
                chosen && num(chosen.rate) != null && num(row.rate) != null && num(chosen.rate) !== num(row.rate);
              return (
                <View
                  key={row.key}
                  className={`px-4 py-3 ${i < arr.length - 1 || showAllFooter(section, rows) ? 'border-b border-line-row' : ''}`}
                  {...lockProps}
                >
                  <SelectField
                    label={`${row.label}${!value && !requiredGap(section, row.key) ? ' · optional' : ''}`}
                    value={value ?? NONE}
                    options={taxOptions(
                      (t) => (section === 'tax_sales' ? t.revenue : t.expenses),
                      section === 'tax_sales' ? 'Sales rates' : 'Purchase rates',
                      isOptional(section, row.key) ? 'Not used' : 'Not mapped',
                      value,
                    )}
                    onSelect={(v) => setSection(section, row.key, v === NONE ? null : v)}
                    error={errors[field]}
                  />
                  {mismatch && !errors[field] && chosen && (
                    <Txt className="mt-1.5 text-caption text-danger">
                      This rate is {pct(chosen.rate)}; {row.label.replace(/\s*\(.*\)$/, '')} needs {pct(row.rate)}.
                    </Txt>
                  )}
                  {suggestion(section, row.key, describeTax)}
                </View>
              );
            })}
            {showAllFooter(section, rows)}
          </AcctCard>
        );
      })}

      {showOptional ? (
        <>
          <AcctCard
            title="Payments bank account · optional"
            description={`Payments already recorded in TruckWys from the start date are sent to this ${cfg.short} bank account when history is sent. Only needed if there are any.`}
            flush
          >
            <View className="px-4 py-3" {...lockProps}>
              <SelectField
                label={`${cfg.short} bank account`}
                value={receipts ?? NONE}
                options={accountOptions(
                  accounts.filter((a) => a.is_bank),
                  () => true,
                  'Bank accounts',
                  "Don't send payments",
                  receipts,
                )}
                onSelect={(v) => {
                  setDraft((d) => ({ ...d, receipts_account: v === NONE ? null : v }));
                  setErrors((e) => {
                    const n = { ...e };
                    delete n.receipts_account;
                    return n;
                  });
                }}
                error={errors.receipts_account}
              />
              {accounts.every((a) => !a.is_bank) && (
                <Txt className="mt-1.5 text-caption text-muted">
                  No bank accounts came back from {cfg.short}. Add one there, then refresh.
                </Txt>
              )}
            </View>
          </AcctCard>

          <AcctCard
            title="Tracking · optional"
            description={
              tl.vehicleCat
                ? `Tag documents in ${cfg.short} with the vehicle (a class per truck) and the branch (a location), so you can report profit per truck in ${cfg.short}.`
                : `Tag invoice and bill lines in ${cfg.short} with the vehicle and branch, so you can report profit per truck in ${cfg.short}.`
            }
            flush
          >
            {cats.length === 0 ? (
              <Txt className="p-4 text-sub text-muted">
                {itemsForRevenue
                  ? `Class and Location tracking are off in ${cfg.short}. To tag vehicles and branches, turn them on in ${cfg.short} (Settings → Account and settings → Advanced → Categories), then refresh. You can skip this.`
                  : `Your ${cfg.short} ${cfg.orgWord} has no tracking categories. You can skip this.`}
              </Txt>
            ) : (
              <View className="gap-4 p-4" {...lockProps}>
                <View>
                  <SelectField
                    label={tl.vehicle}
                    value={tracking.vehicle_category_id ?? NONE}
                    options={[
                      { label: "Don't tag vehicles", value: NONE },
                      ...vehicleCats.map((c) => ({ label: c.name, value: c.id })),
                    ]}
                    onSelect={(v) =>
                      setDraft((d) => ({ ...d, tracking: { ...tracking, vehicle_category_id: v === NONE ? null : v } }))
                    }
                    error={errors['tracking.vehicle_category_id']}
                  />
                  {!!tracking.vehicle_category_id && (
                    <Txt className="mt-1.5 text-caption text-muted">
                      {tl.vehicleCat
                        ? `Each vehicle gets its own ${cfg.short} class, named after its registration.`
                        : "Lines are tagged with the vehicle's registration."}
                    </Txt>
                  )}
                </View>

                {tl.branchCatId ? (
                  <View>
                    <SelectField
                      label={tl.branchCat}
                      value={tracking.branch_option || NONE}
                      options={[
                        {
                          label: branchCats.length ? "Don't tag a location" : `Location tracking is off in ${cfg.short}`,
                          value: NONE,
                        },
                        ...(branchCats[0]?.options ?? []).map((o) => ({ label: o.name, value: o.name })),
                      ]}
                      onSelect={(v) =>
                        setDraft((d) => ({
                          ...d,
                          tracking: {
                            ...tracking,
                            branch_category_id: v !== NONE ? (branchCats[0]?.id ?? null) : null,
                            branch_option: v === NONE ? '' : v,
                          },
                        }))
                      }
                      error={errors['tracking.branch_option'] || errors['tracking.branch_category_id']}
                    />
                    {!!tracking.branch_option && (
                      <Txt className="mt-1.5 text-caption text-muted">Every document is tagged with this location.</Txt>
                    )}
                  </View>
                ) : (
                  <>
                    <SelectField
                      label={tl.branchCat}
                      value={tracking.branch_category_id ?? NONE}
                      options={[
                        { label: "Don't tag a branch", value: NONE },
                        ...branchCats.map((c) => ({ label: c.name, value: c.id })),
                      ]}
                      onSelect={(v) =>
                        setDraft((d) => ({
                          ...d,
                          tracking: { ...tracking, branch_category_id: v === NONE ? null : v, branch_option: '' },
                        }))
                      }
                      error={errors['tracking.branch_category_id']}
                    />
                    <View style={branchCat ? undefined : { opacity: 0.5 }} pointerEvents={branchCat ? 'auto' : 'none'}>
                      <SelectField
                        label={tl.branch}
                        value={tracking.branch_option || NONE}
                        options={[
                          { label: branchCat ? `Choose a ${tl.branch.toLowerCase()}` : 'Choose a branch category first', value: NONE },
                          ...(branchCat?.options ?? []).map((o) => ({ label: o.name, value: o.name })),
                        ]}
                        onSelect={(v) =>
                          setDraft((d) => ({ ...d, tracking: { ...tracking, branch_option: v === NONE ? '' : v } }))
                        }
                        error={errors['tracking.branch_option']}
                      />
                    </View>
                  </>
                )}
              </View>
            )}
          </AcctCard>
        </>
      ) : (
        <AcctCard
          title="Bank account and tracking"
          description={`Optional. Which ${cfg.short} bank account receives payments you recorded in TruckWys, and vehicle or branch tags on each line.`}
          actions={<Button label="Show options" variant="secondary" size="sm" onPress={() => setOptionalOpen(true)} />}
        />
      )}

      {/* While the footer's save bar is showing, leave room under the last card. */}
      <View className="h-2" />
    </>
  );
}
