import { useCallback } from 'react';
import { View, Pressable, RefreshControl } from 'react-native';
import { format } from 'date-fns';
import {
  Screen,
  AppHeader,
  SectionLabel,
  StatCard,
  Group,
  ListRow,
  Button,
  Avatar,
  Icon,
  Txt,
  Mono,
  Label,
  StatusPill,
  Fab,
} from '@/components/ui';
import { HomeSkeleton, ErrorState } from '@/components/feedback';
import { useOverview } from './api';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { useTheme } from '@/theme/ThemeProvider';
import { formatCurrency, formatCurrencyCompact } from '@/lib/formatters';

export function HomeScreen() {
  const { data, isLoading, isError, refetch, isRefetching } = useOverview();
  const { goTab, openQuote, openLoad, createQuote } = useAppNavigation();
  const { colors } = useTheme();

  const heatColor = useCallback(
    (v: number) =>
      ['rgba(77,158,255,0.12)', 'rgba(77,158,255,0.3)', 'rgba(77,158,255,0.6)', colors.accent][v] ??
      colors.line,
    [colors],
  );

  if (isLoading) return <HomeSkeleton />;
  if (isError || !data)
    return <ErrorState onRetry={refetch} message="Couldn't load your overview." />;

  const { finance: f } = data;
  const recentQuotes = data.quotes.slice(0, 4);
  const recentLoads = data.loads.slice(0, 4);

  return (
    <View className="flex-1">
      <Screen
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />
        }
      >
        <AppHeader eyebrow={format(new Date(), 'EEE · d MMM · yyyy')} title="Overview" live />

        {/* Command strip */}
        <View className="mb-5 flex-row rounded-xs border border-line bg-surface py-3">
          {[
            { label: 'Active loads', value: String(data.activeLoads), onPress: () => goTab('Bookings', { tab: 'orders' }), warn: false },
            { label: 'Fleet ready', value: `${data.activeVehicles}/${data.totalVehicles}`, onPress: () => goTab('Fleet'), warn: false },
            { label: 'Advances', value: String(data.advancesPending), onPress: () => goTab('More'), warn: data.advancesPending > 0 },
          ].map((s, i) => (
            <Pressable
              key={s.label}
              onPress={s.onPress}
              className={`flex-1 items-center ${i ? 'border-l border-line' : ''}`}
            >
              <Label className="mb-1 text-faint" style={{ fontSize: 9 }}>
                {s.label}
              </Label>
              <Mono
                className={s.warn ? 'text-warning' : 'text-fg'}
                style={{ fontSize: 20, fontWeight: '700' }}
              >
                {s.value}
              </Mono>
            </Pressable>
          ))}
        </View>

        {/* Finance metrics */}
        <View className="mb-5 gap-3">
          <StatCard
            label="Total revenue"
            value={formatCurrencyCompact(f.totalRevenue)}
            delta={f.revenueChangePct ? `${f.revenueChangePct > 0 ? '+' : ''}${f.revenueChangePct}%` : undefined}
            deltaTone={f.revenueChangePct >= 0 ? 'up' : 'down'}
          />
          <View className="flex-row gap-3">
            <StatCard
              label="Net margin"
              value={`${f.netMarginPct}%`}
              delta={f.marginChangePts ? `${f.marginChangePts > 0 ? '+' : ''}${f.marginChangePts} pts` : undefined}
              deltaTone={f.marginChangePts >= 0 ? 'up' : 'down'}
            />
            <StatCard
              label="Outstanding"
              value={formatCurrencyCompact(f.outstanding)}
              sub={f.dso ? `DSO ${f.dso}d` : undefined}
            />
          </View>
        </View>

        {/* Utilisation heatmap */}
        <Group label="Fleet utilisation · 28 days">
          <View className="p-4">
            <View className="mb-3.5 flex-row items-end justify-between">
              <View>
                <Mono className="text-fg" style={{ fontSize: 24, fontWeight: '600' }}>
                  {data.totalVehicles ? Math.round((data.activeVehicles / data.totalVehicles) * 100) : 0}%
                </Mono>
                <Txt className="mt-0.5 text-caption text-muted">
                  {data.activeVehicles} of {data.totalVehicles} vehicles active
                </Txt>
              </View>
              <View className="items-end">
                <Label className="text-faint">Active loads</Label>
                <Mono className="text-accent" style={{ fontSize: 18, fontWeight: '600' }}>
                  {data.activeLoads}
                </Mono>
              </View>
            </View>
            {[0, 1].map((row) => (
              <View key={row} className={`flex-row gap-1 ${row === 0 ? 'mb-1' : ''}`}>
                {data.heat.slice(row * 14, row * 14 + 14).map((v, i) => (
                  <View
                    key={i}
                    className="flex-1 rounded-xs"
                    style={{ aspectRatio: 1, backgroundColor: heatColor(v) }}
                  />
                ))}
              </View>
            ))}
          </View>
        </Group>

        {/* Recent quotes */}
        <SectionLabel action="View all" onAction={() => goTab('Bookings', { tab: 'quotes' })}>
          Recent quotes
        </SectionLabel>
        <View className="mb-5 overflow-hidden rounded-xs border border-line bg-surface">
          {recentQuotes.length === 0 ? (
            <Txt className="p-4 text-center text-caption text-faint">No quotes yet</Txt>
          ) : (
            recentQuotes.map((q, i) => (
              <ListRow
                key={q.id}
                leading={<Avatar name={q.customer} size={38} />}
                title={q.customer}
                subtitle={`${q.origin} → ${q.destination}`}
                trailing={
                  <View className="items-end gap-1">
                    <Mono className="text-callout font-semibold text-fg">
                      {formatCurrency(q.amount, { maximumFractionDigits: 0 })}
                    </Mono>
                    <StatusPill status={q.status} />
                  </View>
                }
                onPress={() => openQuote(q.id, q.raw)}
                last={i === recentQuotes.length - 1}
              />
            ))
          )}
        </View>

        {/* Recent bookings */}
        <SectionLabel action="View all" onAction={() => goTab('Bookings', { tab: 'orders' })}>
          Recent bookings
        </SectionLabel>
        <View className="mb-5 overflow-hidden rounded-xs border border-line bg-surface">
          {recentLoads.length === 0 ? (
            <Txt className="p-4 text-center text-caption text-faint">No bookings yet</Txt>
          ) : (
            recentLoads.map((l, i) => (
              <ListRow
                key={l.id}
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
            ))
          )}
        </View>

        {/* Quick actions */}
        <SectionLabel>Quick actions</SectionLabel>
        <View className="flex-row flex-wrap gap-2.5">
          <View className="flex-1" style={{ minWidth: '46%' }}>
            <Button label="New quote" icon="plus" onPress={() => createQuote()} fullWidth />
          </View>
          <View className="flex-1" style={{ minWidth: '46%' }}>
            <Button label="Invoices" icon="receipt" variant="secondary" onPress={() => goTab('Finance', { tab: 'invoices' })} fullWidth />
          </View>
          <View className="flex-1" style={{ minWidth: '46%' }}>
            <Button label="Add expense" icon="dollar" variant="secondary" onPress={() => goTab('Finance', { tab: 'expenses' })} fullWidth />
          </View>
          <View className="flex-1" style={{ minWidth: '46%' }}>
            <Button label="Reports" icon="chart" variant="secondary" onPress={() => goTab('Finance', { tab: 'reports' })} fullWidth />
          </View>
        </View>
      </Screen>
      <Fab onPress={() => createQuote()} />
    </View>
  );
}
