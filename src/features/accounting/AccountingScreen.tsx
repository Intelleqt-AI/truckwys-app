import { useCallback, useState, type ReactNode } from 'react';
import { View, TouchableOpacity } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { Banner, Card, FilterChips, SheetScreen, Txt, Icon } from '@/components/ui';
import { ListSkeleton } from '@/components/feedback';
import { useTheme } from '@/theme/ThemeProvider';
import { toast } from '@/lib/toast';
import type { AppStackParamList } from '@/navigation/types';
import { ACCT_KEYS, apiMessage, apiStatus, useAccountingConnection, useReconciliation } from './api';
import { useAccountingPermissions } from './permissions';
import { AccountingFooterContext } from './footer';
import { providerConfig } from './types';
import { ConnectionHeader, OrgPicker } from './components/ConnectionHeader';
import { ComingSoonNote, ProviderCards } from './components/ProviderCards';
import { AcctCard, ErrorBlock, StepRow } from './components/AcctUi';
import { BackfillTab } from './tabs/BackfillTab';
import { ContactsTab } from './tabs/ContactsTab';
import { MappingTab } from './tabs/MappingTab';
import { ReconciliationTab } from './tabs/ReconciliationTab';
import { SetupTab } from './tabs/SetupTab';
import { SyncTab } from './tabs/SyncTab';
import { ACCOUNTING_TABS, isAccountingTab, type AccountingTab } from './tabs/tabs';
import type { CallbackBanner } from './connect';

type Props = NativeStackScreenProps<AppStackParamList, 'Accounting'>;

const HOW_IT_WORKS: [string, string][] = [
  ['Sign in', 'Allow TruckWys access to your books.'],
  ['Map accounts and VAT', 'Pick where each kind of charge and supplier bill goes in your books, and the VAT rate for each.'],
  ['Confirm contacts', 'Most customers and suppliers are matched for you on VAT or registration number.'],
  ['Choose a start date', 'We send documents from that date. Anything earlier should already be in your books.'],
];

/**
 * Accounting (Xero, QuickBooks Online): connect, map accounts and VAT, confirm
 * contacts, choose a start date, and watch sync and reconciliation. Provider
 * neutral; the OAuth sign-in runs in the system browser (see ./connect).
 * Reads are open to any company user; changes are for admins (never the demo).
 */
export function AccountingScreen({ route, navigation }: Props) {
  const qc = useQueryClient();
  const { colors } = useTheme();
  const { canWrite, isAdmin, isDemo } = useAccountingPermissions();
  const conn = useAccountingConnection();
  const connection = conn.data ?? null;
  const live = connection && connection.status !== 'DISABLED' ? connection : null;
  const cfg = live ? providerConfig(live.provider) : null;

  const [tab, setTab] = useState<AccountingTab>(isAccountingTab(route.params?.tab) ? route.params!.tab! : 'setup');
  const [banner, setBanner] = useState<CallbackBanner | null>(null);
  const [footer, setFooter] = useState<ReactNode>(null);
  // Stable, so a tab's footer effect doesn't re-run on every render of this screen.
  const setFooterNode = useCallback((n: ReactNode) => setFooter(n), []);

  const r = live?.readiness;
  // Differences badge the Reconciliation tab, like counts on the others.
  const recon = useReconciliation(!!live && live.status === 'ACTIVE' && !!live.readiness?.sync_enabled);

  const tabBadge = (t: AccountingTab): number | undefined => {
    if (!live || !r || live.status !== 'ACTIVE') return undefined;
    if (t === 'contacts' && r.contacts_to_confirm > 0) return r.contacts_to_confirm;
    if (t === 'mapping' && !r.mapping_complete && r.missing_mappings.length) return r.missing_mappings.length;
    if (t === 'reconciliation' && r.sync_enabled && (recon.data?.run?.difference_count ?? 0) > 0) {
      return recon.data!.run!.difference_count;
    }
    if (t === 'sync' && r.sync_enabled && live.counts.errors + live.counts.dead > 0) {
      return live.counts.errors + live.counts.dead;
    }
    return undefined;
  };

  const openTab = (t: AccountingTab) => {
    // Refresh the connection so counts and readiness are current on arrival.
    void qc.invalidateQueries({ queryKey: ACCT_KEYS.connection });
    setTab(t);
  };

  const bannerIcon = banner?.tone === 'success' ? 'checkCircle' : banner?.tone === 'warning' ? 'info' : 'alert';

  let body: ReactNode;
  if (conn.isLoading) {
    body = <ListSkeleton rows={5} />;
  } else if (conn.isError) {
    body = (
      <ErrorBlock
        message={
          apiStatus(conn.error) === 403
            ? apiMessage(conn.error, "You don't have access to the accounting settings.")
            : apiMessage(conn.error, "Couldn't load your accounting connection.")
        }
        onRetry={() => void conn.refetch()}
      />
    );
  } else if (!live) {
    body = (
      <View>
        <Txt className="text-heading font-semibold text-fg">Connect your accounting system</Txt>
        <Txt className="mb-4 mt-1 text-sub text-muted">
          Send invoices and bills to your books. Payments recorded there come back automatically.
        </Txt>
        <ProviderCards hideManage onBanner={setBanner} />
        <View className="mb-5 mt-3">
          <ComingSoonNote />
        </View>
        <AcctCard title="How setup works" description="About 10 minutes. Needs a company admin. After that, sync runs on its own." flush>
          {HOW_IT_WORKS.map(([title, desc], i) => (
            <StepRow key={title} look="todo" n={i + 1} title={title} desc={desc} last={i === HOW_IT_WORKS.length - 1} />
          ))}
        </AcctCard>
      </View>
    );
  } else if (live.status === 'PENDING_ORG') {
    body = <OrgPicker connection={live} />;
  } else {
    const locked = (t: AccountingTab) => live.status === 'NEEDS_REAUTH' && t !== 'setup';
    body = (
      <View>
        <ConnectionHeader connection={live} onOpenTab={openTab} onBanner={setBanner} />
        <View className="mb-4">
          <FilterChips
            options={ACCOUNTING_TABS.map((t) => ({ label: t.label, value: t.id, count: tabBadge(t.id) }))}
            value={tab}
            onChange={(t) => {
              if (locked(t)) {
                toast.error(`Available after you reconnect ${cfg!.short}`);
                return;
              }
              openTab(t);
            }}
          />
        </View>
        {tab === 'setup' && <SetupTab connection={live} onOpen={openTab} />}
        {tab === 'mapping' && <MappingTab connection={live} />}
        {tab === 'contacts' && <ContactsTab connection={live} />}
        {tab === 'cutover' && <BackfillTab connection={live} onOpen={openTab} />}
        {tab === 'sync' && <SyncTab connection={live} onOpen={openTab} />}
        {tab === 'reconciliation' && <ReconciliationTab connection={live} onOpen={openTab} />}
      </View>
    );
  }

  return (
    <AccountingFooterContext.Provider value={setFooterNode}>
      <SheetScreen
        title="Accounting"
        onBack={() => navigation.goBack()}
        footer={footer ?? undefined}
      >
        {banner && (
          <Card className="mb-4 flex-row items-start gap-2.5 p-3.5">
            <Icon
              name={bannerIcon}
              size={18}
              color={banner.tone === 'success' ? colors.successDot : banner.tone === 'warning' ? colors.warningDot : colors.dangerDot}
            />
            <View className="flex-1">
              <Txt className="text-body font-semibold text-fg">{banner.title}</Txt>
              <Txt className="mt-0.5 text-sub text-muted">{banner.body}</Txt>
            </View>
            <TouchableOpacity
              onPress={() => setBanner(null)}
              hitSlop={12}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
            >
              <Icon name="x" size={16} color={colors.faint} />
            </TouchableOpacity>
          </Card>
        )}

        {!canWrite && live && (
          <View className="mb-4">
            <Banner
              tone="warning"
              message={
                isAdmin && isDemo
                  ? 'View only. Changes are switched off in the demo.'
                  : 'View only. Only a company admin can connect, map or change the accounting integration. You can see everything here.'
              }
            />
          </View>
        )}

        {body}
      </SheetScreen>
    </AccountingFooterContext.Provider>
  );
}
