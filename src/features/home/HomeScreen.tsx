import { useCallback, useMemo, useState } from 'react';
import { View, TouchableOpacity, Platform } from 'react-native';
import Animated from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  Screen,
  AppHeader,
  SectionLabel,
  StatCard,
  ListRow,
  Button,
  Avatar,
  Icon,
  IconButton,
  Mono,
  Txt,
  StatusPill,
  Banner,
  Fab,
} from '@/components/ui';
import {
  HeroSkeleton,
  BentoSkeleton,
  ListSkeleton,
  SectionError,
  Skeleton,
} from '@/components/feedback';
import {
  STALE_MS,
  useAutoRefreshHome,
  useHomeFleet,
  useHomeFreshness,
  useHomeLoads,
  useHomeMoney,
  useHomeQuotes,
  useHomeSignals,
  useRefreshHome,
} from './api';
import { useUnreadCount } from '@/features/more/api';
import { CommandBar, type CommandCell } from './CommandBar';
import { HeroRevenue } from './HeroRevenue';
import { NeedsYouCard } from './NeedsYouCard';
import { QuoteFunnelCard } from './QuoteFunnelCard';
import { StaleDataNotice } from './StaleDataNotice';
import { UtilisationCard } from './UtilisationCard';
import { HeaderClock } from './HeaderClock';
import { buildNeeds, type NeedsRow, type NeedsTarget } from './signals';
import { SECTION_REVEAL, ROW_REVEAL } from './motion';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { canSeeInsights, useRole, visibleTabs } from '@/lib/access';
import { CAPITAL_LAUNCHED } from '@/lib/features';
import { quoteStage } from '@/lib/quoteStage';
import { useTheme } from '@/theme/ThemeProvider';
import { formatCurrency, formatDate, formatNumber, formatPercent } from '@/lib/formatters';
import { useManualRefresh } from '@/hooks/useManualRefresh';
import { useGracePeriod, useSubscription } from '@/hooks/useSubscription';
import { SubscriptionDetailModal } from '@/features/more/SubscriptionDetailModal';
import { useAuthStore } from '@/stores/authStore';
import { mediaUrl } from '@/lib/api/client';
import { useOnboardingGate } from '@/features/onboarding/useOnboardingGate';

const wholeRand = (n: number) => formatCurrency(n, { maximumFractionDigits: 0 });

// Mirrors the phrasing already used on the Billing settings screen
// (SettingsScreen.tsx's BillingSection), so grace-period copy reads
// near-identically whether it's seen here or drilled into from Settings.
function subscriptionBannerMessage(
  subscription: Pick<
    ReturnType<typeof useSubscription>,
    'status' | 'cancelling' | 'blocked' | 'notice' | 'detail'
  >,
  daysRemaining: number | undefined,
  expiresAt: string | undefined,
): string {
  if (subscription.blocked) return subscription.notice ?? subscription.detail;
  if (subscription.cancelling) {
    return 'Cancelling: access continues until the end of the current billing period.';
  }
  if (subscription.status === 'grace_period') {
    if (daysRemaining !== undefined) {
      return `Payment is overdue: ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} of grace remaining${
        expiresAt ? ` (until ${formatDate(expiresAt)})` : ''
      }.`;
    }
    return 'Payment is overdue. Your administrator can settle it on the Truckwys dashboard.';
  }
  // trialing, or any other role-visible-but-not-blocking state.
  return subscription.detail;
}

export function HomeScreen() {
  // Opens the first-run onboarding wizard, at most once, for an admin whose
  // company hasn't finished it — Home is always the first tab mounted after
  // login, so this is the earliest point with a navigation context to open it
  // from. See useOnboardingGate for the actual gating.
  useOnboardingGate();

  // Independent sources (see home/api.ts): each section renders as soon as its
  // own data lands and fails on its own, with its own Retry. Money, loads, quotes
  // and vehicles are the full ledgers, so every figure is a whole-list figure.
  const money = useHomeMoney();
  const loads = useHomeLoads();
  const quotes = useHomeQuotes();
  const fleet = useHomeFleet();
  const signals = useHomeSignals();
  const fresh = useHomeFreshness();
  useAutoRefreshHome(fresh.updatedAt);

  // One refetch per query Home shows; pull-to-refresh and the stale-data notice's
  // "Refresh now" both use it.
  const refreshHome = useRefreshHome();
  const { refreshing, onRefresh } = useManualRefresh(refreshHome);
  const [noticeRefreshing, setNoticeRefreshing] = useState(false);
  const refreshFromNotice = useCallback(async () => {
    setNoticeRefreshing(true);
    try {
      await refreshHome();
    } finally {
      setNoticeRefreshing(false);
    }
  }, [refreshHome]);

  const { nav, goTab, openQuote, openLoad, openInvoice, createQuote, openMore, openNotifications } =
    useAppNavigation();
  const { data: unread } = useUnreadCount();
  const user = useAuthStore((s) => s.user);
  const { colors } = useTheme();
  const role = useRole();
  const tabs = visibleTabs(role);
  const hasFleet = tabs.includes('Fleet');
  const hasFinance = tabs.includes('Finance');
  const subscription = useSubscription();
  const { daysRemaining, expiresAt } = useGracePeriod(subscription.status, subscription.visible);
  const [subscriptionModalOpen, setSubscriptionModalOpen] = useState(false);

  // ── Command bar cells ─────────────────────────────────────────────────────
  const activeLoadsCell: CommandCell = loads.summary
    ? {
        state: 'ready',
        value: formatNumber(loads.summary.active),
        note: loads.summary.notClosed > 0 ? `+${formatNumber(loads.summary.notClosed)} not closed` : undefined,
        warn: true,
        onPress: () => goTab('Bookings', { tab: 'orders' }),
      }
    : loads.error
      ? { state: 'error', onRetry: loads.retry }
      : { state: 'loading' };
  const fleetReadyCell: CommandCell = fleet.summary
    ? {
        state: 'ready',
        value: `${fleet.summary.active}/${fleet.summary.total}`,
        // Fleet ready still reads fine for a driver; it just isn't tappable when
        // the Fleet tab is hidden for their role.
        onPress: hasFleet ? () => goTab('Fleet') : undefined,
      }
    : fleet.error
      ? { state: 'error', onRetry: fleet.retry }
      : { state: 'loading' };

  // ── Money tiles ───────────────────────────────────────────────────────────
  const m = money.money;
  const receivedPartial = money.partial.length > 0;
  const owedDelta =
    m && m.owed > 0.005
      ? m.pastDue >= m.owed - 0.005
        ? 'All past due'
        : m.pastDue > 0
          ? `${wholeRand(m.pastDue)} past due`
          : undefined
      : undefined;
  const owedSub = m ? (m.owed <= 0.005 ? 'Nothing outstanding' : owedDelta ? undefined : 'None past due') : undefined;
  const afterPending = m ? m.revenueExcl - m.costs - m.pending : 0;
  const marginChange =
    m && m.margin != null && m.marginPrior != null ? Math.round((m.margin - m.marginPrior) * 10) / 10 : null;
  const marginNote =
    m == null
      ? undefined
      : m.margin == null
        ? 'No revenue received yet'
        : m.pending > 0.005
          ? `${wholeRand(afterPending)} if the ${wholeRand(m.pending)} pending is approved`
          : marginChange == null
            ? 'Excl. VAT, cash basis'
            : undefined;

  // ── Needs you ─────────────────────────────────────────────────────────────
  const signalList = signals.data;
  const needsRows = useMemo(
    () =>
      signalList
        ? buildNeeds({ signals: signalList, loads: loads.loads, vehicles: fleet.vehicles })
        : [],
    [signalList, loads.loads, fleet.vehicles],
  );
  const needsLoading =
    (!signals.data && !signals.isError) ||
    (!loads.loads && !loads.error) ||
    (!fleet.vehicles && !fleet.error);
  const needsNotes = [
    ...(loads.error && !loads.loads
      ? [{ text: "Loads couldn't load, so loads left open aren't shown.", onRetry: loads.retry }]
      : []),
    ...(fleet.error && !fleet.vehicles
      ? [{ text: "Vehicles couldn't load, so idle trucks aren't shown.", onRetry: fleet.retry }]
      : []),
  ];
  const canOpenTarget = (t: NeedsTarget) => {
    if (t.kind === 'invoice') return hasFinance;
    if (t.kind === 'tab') return tabs.includes(t.tab);
    return t.name === 'Capital' ? CAPITAL_LAUNCHED && hasFinance : canSeeInsights(role);
  };
  const openTarget = (row: NeedsRow) => {
    const t = row.target;
    if (!t) return;
    if (t.kind === 'invoice') openInvoice(t.id);
    else if (t.kind === 'tab') goTab(t.tab as 'Bookings', t.params as never);
    else nav.navigate(t.name);
  };

  return (
    <View className="flex-1">
      <Screen onRefresh={onRefresh} refreshing={refreshing}>
        <AppHeader
          title="Home"
          live
          right={
            <View className="flex-row items-center gap-1">
              <View>
                <IconButton
                  name="bell"
                  size={23}
                  color={colors.fg}
                  accessibilityLabel="Notifications"
                  onPress={openNotifications}
                />
                {!!unread && unread > 0 && (
                  <View
                    className="absolute right-0.5 top-0 min-w-[16px] items-center justify-center rounded-pill px-1"
                    style={{ height: 16, backgroundColor: colors.dangerDot }}
                  >
                    <Mono className="text-nano font-semibold" style={{ color: colors.btnDangerFg }}>
                      {unread > 9 ? '9+' : unread}
                    </Mono>
                  </View>
                )}
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Profile, settings & more"
                hitSlop={8}
                activeOpacity={0.7}
                onPress={openMore}
                className="h-11 w-11 items-center justify-center"
              >
                <Avatar
                  name={user?.name ?? user?.email}
                  uri={mediaUrl(user?.avatar as string | undefined)}
                  size={32}
                  bordered
                />
              </TouchableOpacity>
            </View>
          }
        />

        {/* Date on one line, ticking HH:mm:ss SAST on the next, under the
            title rather than above it as an eyebrow — date+seconds+timezone
            together don't fit one line, and the screen's own name should be
            the first thing read, not a timestamp. Always South Africa's
            time, like web's live clock — never the device's own timezone. */}
        <View className="-mt-2 mb-5">
          <HeaderClock />
        </View>

        {subscription.visible && (
          <View className="mb-5">
            <Banner
              tone={subscription.tone === 'danger' ? 'danger' : 'warning'}
              message={subscriptionBannerMessage(subscription, daysRemaining, expiresAt)}
              onPress={() => setSubscriptionModalOpen(true)}
            />
          </View>
        )}

        {/* Silent while the figures are current. Tracks the OLDEST figure on
            screen, and "Refresh now" refetches everything Home shows. An
            automatic refresh in progress isn't news; only a manual one is shown. */}
        {(noticeRefreshing || !fresh.fetching) && (
          <View className="mb-5">
            <StaleDataNotice
              updatedAt={fresh.updatedAt}
              refreshFailed={fresh.refreshFailed}
              refreshing={noticeRefreshing}
              onRetry={refreshFromNotice}
              staleAfterMs={STALE_MS + 60_000}
            />
          </View>
        )}

        {/* Command bar — active loads and fleet ready */}
        <Animated.View entering={SECTION_REVEAL[0]}>
          <CommandBar activeLoads={activeLoadsCell} fleetReady={fleetReadyCell} />
        </Animated.View>

        {/* Hero — revenue received, last 12 months, + the revenue-vs-costs line */}
        <Animated.View entering={SECTION_REVEAL[1]}>
          {m ? (
            <View className="mb-5">
              <HeroRevenue
                money={m}
                onPress={hasFinance ? () => goTab('Finance', { tab: 'reports' }) : undefined}
              />
            </View>
          ) : money.error ? (
            <SectionError
              message="Couldn't load revenue, owed and margin. Invoices, payments or expenses didn't load."
              onRetry={money.retry}
            />
          ) : (
            <HeroSkeleton />
          )}
        </Animated.View>

        {/* Bento pair — owed to you / net margin */}
        <Animated.View entering={SECTION_REVEAL[2]}>
          {m ? (
            <View className="mb-5">
              <View className="flex-row gap-3">
                <StatCard
                  compact
                  label="Owed to you, incl. VAT"
                  value={wholeRand(m.owed)}
                  delta={owedDelta}
                  deltaTone="down"
                  sub={owedSub}
                />
                <StatCard
                  compact
                  label="Net margin, last 12 months"
                  value={m.margin == null ? 'n/a' : formatPercent(m.margin)}
                  delta={
                    marginNote == null && marginChange != null
                      ? `${marginChange > 0 ? '+' : ''}${formatNumber(marginChange, { maximumFractionDigits: 1 })} pts vs prior 12 months`
                      : undefined
                  }
                  deltaTone={(marginChange ?? 0) >= 0 ? 'up' : 'down'}
                  sub={marginNote}
                />
              </View>
              <Txt className="mt-2 text-micro text-faint">
                Owed is the open balance on sent invoices. Margin is revenue received less approved
                expenses, excl. VAT, cash basis.
                {receivedPartial ? ` Figures use the ${money.partial.join(', ')} that loaded.` : ''}
              </Txt>
            </View>
          ) : money.error ? null : (
            <BentoSkeleton />
          )}
        </Animated.View>

        {/* Needs you — overdue invoices, loads left open, idle trucks, other signals */}
        <Animated.View entering={SECTION_REVEAL[3]}>
          {signals.isError && !signals.data ? (
            <SectionError message="Couldn't load what needs you." onRetry={() => void signals.refetch()} />
          ) : needsLoading ? (
            <View className="mb-5">
              <Skeleton height={120} radius={12} />
            </View>
          ) : (
            <NeedsYouCard
              rows={needsRows}
              canOpen={(row) => !!row.target && canOpenTarget(row.target)}
              onOpen={openTarget}
              onAskCopilot={canSeeInsights(role) ? () => nav.navigate('Copilot') : undefined}
              notes={needsNotes}
            />
          )}
        </Animated.View>

        {/* Loads booked, last 28 days */}
        <Animated.View entering={SECTION_REVEAL[4]}>
          {loads.summary && fleet.summary ? (
            <UtilisationCard
              booked28={loads.summary.booked28}
              activeLoads={loads.summary.active}
              notClosed={loads.summary.notClosed}
              heat={loads.summary.heat}
              availableVehicles={fleet.summary.available}
              totalVehicles={fleet.summary.total}
            />
          ) : (loads.error && !loads.summary) || (fleet.error && !fleet.summary) ? (
            <SectionError
              message="Couldn't load loads and vehicles."
              onRetry={() => {
                loads.retry();
                fleet.retry();
              }}
            />
          ) : (
            <View className="mb-5">
              <Skeleton height={160} radius={12} />
            </View>
          )}
        </Animated.View>

        {/* Quote pipeline — how far quotes get */}
        <Animated.View entering={SECTION_REVEAL[5]}>
          {quotes.funnel ? (
            <QuoteFunnelCard
              funnel={quotes.funnel}
              total={quotes.total}
              onViewAll={() => goTab('Bookings', { tab: 'quotes' })}
              onNewQuote={() => createQuote()}
            />
          ) : quotes.error ? (
            <SectionError message="Couldn't load the quote pipeline." onRetry={quotes.retry} />
          ) : (
            <View className="mb-5">
              <Skeleton height={200} radius={12} />
            </View>
          )}
        </Animated.View>

        {/* Recent quotes */}
        <Animated.View entering={SECTION_REVEAL[6]}>
          <SectionLabel action="View all" onAction={() => goTab('Bookings', { tab: 'quotes' })}>
            Recent quotes
          </SectionLabel>
          {!quotes.data && quotes.error ? (
            <SectionError message="Couldn't load recent quotes." onRetry={quotes.retry} />
          ) : !quotes.data ? (
            <View className="mb-5">
              <ListSkeleton rows={3} />
            </View>
          ) : (
            <View className="mb-5 overflow-hidden rounded-card border border-line bg-surface">
              {quotes.recent.length === 0 ? (
                <Txt className="p-4 text-center text-caption text-faint">No quotes yet</Txt>
              ) : (
                quotes.recent.map((q, i) => (
                  <Animated.View key={q.id} entering={ROW_REVEAL[i % ROW_REVEAL.length]}>
                    <ListRow
                      leading={<Avatar name={q.customer} size={38} />}
                      title={q.customer}
                      subtitle={[q.origin, ...q.stopLabels, q.destination].join(' → ')}
                      trailing={
                        <View className="items-end gap-1">
                          <Mono className="text-callout font-semibold text-fg">
                            {formatCurrency(q.amount, { maximumFractionDigits: 0 })}
                          </Mono>
                          <View>
                            {/* The stage, not the raw status: a lapsed Draft or Sent quote
                                reads Expired, a converted one Booked. */}
                            <StatusPill status={quoteStage(q.raw) ?? q.status} />
                          </View>
                        </View>
                      }
                      onPress={() => openQuote(q.id, q.raw)}
                      last={i === quotes.recent.length - 1}
                    />
                  </Animated.View>
                ))
              )}
            </View>
          )}
        </Animated.View>

        {/* Recent bookings */}
        <Animated.View entering={SECTION_REVEAL[7]}>
          <SectionLabel action="View all" onAction={() => goTab('Bookings', { tab: 'orders' })}>
            Recent bookings
          </SectionLabel>
          {!loads.data && loads.error ? (
            <SectionError message="Couldn't load recent bookings." onRetry={loads.retry} />
          ) : !loads.data ? (
            <View className="mb-5">
              <ListSkeleton rows={3} />
            </View>
          ) : (
            <View className="mb-5 overflow-hidden rounded-card border border-line bg-surface">
              {loads.recent.length === 0 ? (
                <Txt className="p-4 text-center text-caption text-faint">No bookings yet</Txt>
              ) : (
                loads.recent.map((l, i) => (
                  <Animated.View key={l.id} entering={ROW_REVEAL[i % ROW_REVEAL.length]}>
                    <ListRow
                      leading={<Icon name="truck" size={22} color={colors.muted} />}
                      title={l.loadNumber}
                      subtitle={l.customer}
                      trailing={
                        <View className="items-end gap-1">
                          <Mono className="text-caption text-muted">
                            {l.pickupState} → {l.deliveryState}
                          </Mono>
                          <StatusPill status={l.status} />
                        </View>
                      }
                      onPress={() => openLoad(l.id, l.raw)}
                      last={i === loads.recent.length - 1}
                    />
                  </Animated.View>
                ))
              )}
            </View>
          )}
        </Animated.View>

        {/* Quick actions — the web's order: Add expense, Create invoice, then New
            quote as the primary. Finance shortcuts only exist when the role
            actually has that tab: navigating to a screen the navigator never
            registered is a no-op. */}
        <Animated.View entering={SECTION_REVEAL[8]}>
          <SectionLabel>Quick actions</SectionLabel>
          <View className="gap-2.5">
            {hasFinance && (
              <View className="flex-row gap-2.5">
                <View className="flex-1">
                  <Button
                    label="Add expense"
                    icon="dollar"
                    variant="secondary"
                    onPress={() => nav.navigate('AddExpense')}
                    fullWidth
                  />
                </View>
                <View className="flex-1">
                  <Button
                    label="Create invoice"
                    icon="receipt"
                    variant="secondary"
                    onPress={() => nav.navigate('CreateInvoice')}
                    fullWidth
                  />
                </View>
              </View>
            )}
            <Button label="New quote" icon="plus" onPress={() => createQuote()} fullWidth />
          </View>
        </Animated.View>
      </Screen>
      {/* Long-press for the voice/AI entry point — undiscoverable alone, so
          it's a second path onto the same screen, not the only one. */}
      <Fab
        onPress={() => createQuote()}
        onLongPress={() => {
          if (Platform.OS !== 'web') void Haptics.selectionAsync();
          createQuote(true);
        }}
      />
      <SubscriptionDetailModal
        visible={subscriptionModalOpen}
        onClose={() => setSubscriptionModalOpen(false)}
      />
    </View>
  );
}
