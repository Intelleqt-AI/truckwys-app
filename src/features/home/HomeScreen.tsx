import { useState } from 'react';
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
import { HomeSkeleton, ErrorState } from '@/components/feedback';
import { useOverview } from './api';
import { useUnreadCount } from '@/features/more/api';
import { CommandBar } from './CommandBar';
import { HeroRevenue } from './HeroRevenue';
import { UtilisationCard } from './UtilisationCard';
import { HeaderClock } from './HeaderClock';
import { SECTION_REVEAL, ROW_REVEAL } from './motion';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { useRole, visibleTabs } from '@/lib/access';
import { useTheme } from '@/theme/ThemeProvider';
import {
  formatCurrency,
  formatCurrencyCompact,
  formatDate,
  formatNumber,
  formatPercent,
} from '@/lib/formatters';
import { useManualRefresh } from '@/hooks/useManualRefresh';
import { useGracePeriod, useSubscription } from '@/hooks/useSubscription';
import { SubscriptionDetailModal } from '@/features/more/SubscriptionDetailModal';
import { useAuthStore } from '@/stores/authStore';
import { mediaUrl } from '@/lib/api/client';

// Mirrors the phrasing already used on the Billing settings screen
// (SettingsScreen.tsx's BillingSection), so grace-period copy reads
// identically whether it's seen here or drilled into from Settings.
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
    return 'Cancelling — access continues until the end of the current billing period.';
  }
  if (subscription.status === 'grace_period') {
    if (daysRemaining !== undefined) {
      return `Payment is overdue — ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} of grace remaining${
        expiresAt ? ` (until ${formatDate(expiresAt)})` : ''
      }.`;
    }
    return 'Payment is overdue. Your administrator can settle it on the Truckwys dashboard.';
  }
  // trialing, or any other role-visible-but-not-blocking state.
  return subscription.detail;
}

export function HomeScreen() {
  const { data, isLoading, isError, refetch } = useOverview();
  const { refreshing, onRefresh } = useManualRefresh(refetch);
  const { goTab, openQuote, openLoad, createQuote, openMore, openNotifications } =
    useAppNavigation();
  const { data: unread } = useUnreadCount();
  const user = useAuthStore((s) => s.user);
  const { colors } = useTheme();
  const tabs = visibleTabs(useRole());
  const hasFleet = tabs.includes('Fleet');
  const hasFinance = tabs.includes('Finance');
  const subscription = useSubscription();
  const { daysRemaining, expiresAt } = useGracePeriod(subscription.status, subscription.visible);
  const [subscriptionModalOpen, setSubscriptionModalOpen] = useState(false);

  if (isLoading) return <HomeSkeleton />;
  if (isError || !data)
    return <ErrorState onRetry={refetch} message="Couldn't load your overview." />;

  const { finance: f } = data;
  const recentQuotes = data.quotes.slice(0, 4);
  const recentLoads = data.loads.slice(0, 4);

  return (
    <View className="flex-1">
      <Screen onRefresh={onRefresh} refreshing={refreshing}>
        <AppHeader
          title="Overview"
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
                    style={{ height: 16, backgroundColor: '#FF4949' }}
                  >
                    <Mono style={{ fontSize: 9, color: '#fff', fontWeight: '700' }}>
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
        <View className="mb-5">
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

        {/* Command bar — live clock + the three operational stats */}
        <Animated.View entering={SECTION_REVEAL[0]}>
          <CommandBar data={data} hasFleet={hasFleet} goTab={goTab} openMore={openMore} />
        </Animated.View>

        {/* Hero — total revenue + the revenue-vs-fuel sparkline */}
        <Animated.View entering={SECTION_REVEAL[1]} className="mb-5">
          <HeroRevenue
            finance={f}
            onPress={hasFinance ? () => goTab('Finance', { tab: 'reports' }) : undefined}
          />
        </Animated.View>

        {/* Bento pair — net margin / outstanding */}
        <Animated.View entering={SECTION_REVEAL[2]} className="mb-5 flex-row gap-3">
          <StatCard
            label="Net margin"
            value={formatPercent(f.netMarginPct)}
            delta={
              f.marginChangePts
                ? `${f.marginChangePts > 0 ? '+' : ''}${formatNumber(f.marginChangePts, { maximumFractionDigits: 1 })} pts`
                : undefined
            }
            deltaTone={f.marginChangePts >= 0 ? 'up' : 'down'}
          />
          <StatCard
            label="Outstanding"
            value={formatCurrencyCompact(f.outstanding)}
            // Whole days, like web's `Math.round(financeData.dso)` — the API
            // sends this unrounded too, so without rounding it read "DSO 89.9d"
            // instead of a clean day count.
            sub={f.dso ? `DSO ${formatNumber(Math.round(f.dso))}d` : undefined}
          />
        </Animated.View>

        {/* Fleet utilisation heatmap */}
        <Animated.View entering={SECTION_REVEAL[3]}>
          <UtilisationCard
            activeVehicles={data.activeVehicles}
            totalVehicles={data.totalVehicles}
            activeLoads={data.activeLoads}
            heat={data.heat}
          />
        </Animated.View>

        {/* Recent quotes */}
        <Animated.View entering={SECTION_REVEAL[4]}>
          <SectionLabel action="View all" onAction={() => goTab('Bookings', { tab: 'quotes' })}>
            Recent quotes
          </SectionLabel>
          <View className="mb-5 overflow-hidden rounded-xs border border-line bg-surface">
            {recentQuotes.length === 0 ? (
              <Txt className="p-4 text-center text-caption text-faint">No quotes yet</Txt>
            ) : (
              recentQuotes.map((q, i) => (
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
                          <StatusPill status={q.status} />
                        </View>
                      </View>
                    }
                    onPress={() => openQuote(q.id, q.raw)}
                    last={i === recentQuotes.length - 1}
                  />
                </Animated.View>
              ))
            )}
          </View>
        </Animated.View>

        {/* Recent bookings */}
        <Animated.View entering={SECTION_REVEAL[5]}>
          <SectionLabel action="View all" onAction={() => goTab('Bookings', { tab: 'orders' })}>
            Recent bookings
          </SectionLabel>
          <View className="mb-5 overflow-hidden rounded-xs border border-line bg-surface">
            {recentLoads.length === 0 ? (
              <Txt className="p-4 text-center text-caption text-faint">No bookings yet</Txt>
            ) : (
              recentLoads.map((l, i) => (
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
                    last={i === recentLoads.length - 1}
                  />
                </Animated.View>
              ))
            )}
          </View>
        </Animated.View>

        {/* Quick actions */}
        <Animated.View entering={SECTION_REVEAL[6]}>
          <SectionLabel>Quick actions</SectionLabel>
          <View className="flex-row flex-wrap gap-2.5">
            <View className="flex-1" style={{ minWidth: '46%' }}>
              <Button label="New quote" icon="plus" onPress={() => createQuote()} fullWidth />
            </View>
            {/* Finance shortcuts only exist when the role actually has that tab —
                navigating to a screen the navigator never registered is a no-op. */}
            {hasFinance && (
              <>
                <View className="flex-1" style={{ minWidth: '46%' }}>
                  <Button
                    label="Invoices"
                    icon="receipt"
                    variant="secondary"
                    onPress={() => goTab('Finance', { tab: 'invoices' })}
                    fullWidth
                  />
                </View>
                <View className="flex-1" style={{ minWidth: '46%' }}>
                  <Button
                    label="Add expense"
                    icon="dollar"
                    variant="secondary"
                    onPress={() => goTab('Finance', { tab: 'expenses' })}
                    fullWidth
                  />
                </View>
                <View className="flex-1" style={{ minWidth: '46%' }}>
                  <Button
                    label="Reports"
                    icon="chart"
                    variant="secondary"
                    onPress={() => goTab('Finance', { tab: 'reports' })}
                    fullWidth
                  />
                </View>
              </>
            )}
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
