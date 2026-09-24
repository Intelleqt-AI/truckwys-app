import { useLayoutEffect, useCallback, useMemo, useEffect, useState } from 'react';
import { View, RefreshControl, TouchableOpacity } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AmbientGlow,
  SearchField,
  StatCard,
  Avatar,
  ListRow,
  IconButton,
  Mono,
  EmptyState,
  Button,
  SelectionActions,
  SelectionDot,
} from '@/components/ui';
import { ListSkeleton, ErrorState } from '@/components/feedback';
import { num, str, pick } from '@/lib/api/list';
import { useCustomers, bulkDeleteCustomers } from './api';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { useTheme } from '@/theme/ThemeProvider';
import { useDemo } from '@/hooks/useDemo';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import { reportBulkDelete } from '@/lib/bulkDelete';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import type { AppStackParamList } from '@/navigation/types';
import { useManualRefresh } from '@/hooks/useManualRefresh';

type Props = NativeStackScreenProps<AppStackParamList, 'Customers'>;

const NOUNS = { singular: 'customer', plural: 'customers' };

export function CustomersScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useCustomers();
  const { refreshing, onRefresh } = useManualRefresh(refetch);
  const { openCustomer, openImport } = useAppNavigation();
  const demo = useDemo();
  const [q, setQ] = useState('');
  const { selectMode, selected, enter, exit, toggle, toggleAll, prune } = useBulkSelection();

  // Customers are fixed seeded data in the demo company — creation happens
  // server-side too (400 "fixed demo data"), but stopping here avoids the
  // round trip and lets the toast fire on the tap itself.
  const handleAdd = useCallback(() => {
    if (demo.block()) return;
    navigation.navigate('AddCustomer');
  }, [demo, navigation]);

  const handleImport = useCallback(() => {
    if (demo.block()) return;
    openImport('customers');
  }, [demo, openImport]);

  const hasData = (data?.length ?? 0) > 0;

  const filtered = useMemo(
    () => (data ?? []).filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase())),
    [data, q],
  );

  useEffect(() => {
    prune(filtered.map((c) => c.id));
  }, [filtered, prune]);

  const runBulkDelete = useCallback(async () => {
    if (demo.block()) return;
    try {
      const res = await bulkDeleteCustomers([...selected]);
      reportBulkDelete(res, NOUNS);
      invalidateFor(qc, 'customer');
      exit();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete');
    }
  }, [demo, selected, qc, exit]);

  // Only ever installed while selecting (see setOptions below) — a custom
  // headerLeft returning undefined would still override the native back
  // button with nothing, so the toggle happens by swapping the option key
  // itself, not what this renders.
  const renderHeaderLeft = useCallback(
    () => <IconButton name="x" accessibilityLabel="Cancel selection" onPress={exit} />,
    [exit],
  );

  const renderHeaderRight = useCallback(
    () =>
      selectMode ? (
        <SelectionActions
          count={selected.size}
          total={filtered.length}
          noun="customer"
          nounPlural="customers"
          onSelectAll={() => toggleAll(filtered.map((c) => c.id))}
          onConfirmDelete={runBulkDelete}
        />
      ) : (
        <View className="flex-row items-center gap-1">
          {hasData && (
            <TouchableOpacity hitSlop={8} activeOpacity={0.7} className="px-2" onPress={() => enter()}>
              <Mono className="text-micro uppercase tracking-wide text-accent">Select</Mono>
            </TouchableOpacity>
          )}
          <IconButton name="import" accessibilityLabel="Import customers" onPress={handleImport} />
          <IconButton name="plus" accessibilityLabel="Add customer" onPress={handleAdd} />
        </View>
      ),
    [selectMode, selected.size, filtered, toggleAll, runBulkDelete, hasData, handleImport, handleAdd, enter],
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      title: selectMode ? `${selected.size} selected` : 'Customers',
      headerLargeTitle: false,
      headerTransparent: false,
      headerStyle: { backgroundColor: colors.bgDeep },
      headerLeft: selectMode ? renderHeaderLeft : undefined,
      headerRight: renderHeaderRight,
    });
  }, [navigation, colors.bgDeep, renderHeaderLeft, renderHeaderRight, selectMode, selected.size]);

  const total = data?.length ?? 0;
  const withCredit = data ? data.filter((c) => num(pick(c.raw, ['credit_limit'])) > 0).length : 0;
  const cities = data ? new Set(data.map((c) => str(pick(c.raw, ['city']))).filter(Boolean)).size : 0;
  const net30 = data ? data.filter((c) => (str(pick(c.raw, ['payment_terms_default'])) || 'NET30') === 'NET30').length : 0;

  return (
    <View className="flex-1 bg-bg-deep">
      <AmbientGlow />
      <View className="px-screen pt-3">
        {data && (
          <View className="mb-3 gap-3">
            <View className="flex-row gap-3">
              <StatCard label="Total customers" value={String(total)} />
              <StatCard label="With credit limit" value={String(withCredit)} />
            </View>
            <View className="flex-row gap-3">
              <StatCard label="Cities covered" value={String(cities)} />
              <StatCard label="NET30 clients" value={String(net30)} />
            </View>
          </View>
        )}
        <View className="pb-3">
          <SearchField value={q} onChangeText={setQ} placeholder="Search customers…" />
        </View>
      </View>

      {isLoading ? (
        <View className="p-screen"><ListSkeleton /></View>
      ) : isError || !data ? (
        <ErrorState onRetry={refetch} message="Couldn't load customers." />
      ) : (
        <FlashList
          data={filtered}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="users"
              title="No customers yet"
              body="Already have them in a spreadsheet? Import the list, or add your first customer."
              action={
                <View className="flex-row gap-2.5">
                  <Button label="Import list" icon="import" variant="secondary" onPress={handleImport} />
                  <Button label="Add customer" icon="plus" onPress={handleAdd} />
                </View>
              }
            />
          }
          renderItem={({ item }) => {
            const isSelected = selectMode && selected.has(item.id);
            return (
              <View
                className={`mb-2.5 overflow-hidden rounded-xs border ${
                  isSelected ? 'border-accent' : 'border-line bg-surface'
                }`}
                style={isSelected ? { backgroundColor: colors.glow } : undefined}
              >
                <ListRow
                  leading={
                    selectMode ? (
                      <View className="flex-row items-center gap-2.5">
                        <SelectionDot selected={isSelected} />
                        <Avatar name={item.name} size={38} />
                      </View>
                    ) : (
                      <Avatar name={item.name} size={38} />
                    )
                  }
                  title={item.name}
                  subtitle={item.contact}
                  trailing={
                    selectMode ? (
                      <View style={{ width: 16 }} />
                    ) : item.creditScore != null ? (
                      <Mono className="text-caption text-muted">{item.creditScore}</Mono>
                    ) : undefined
                  }
                  onPress={() => (selectMode ? toggle(item.id) : openCustomer(item.id, item.raw))}
                  onLongPress={() => !selectMode && enter(item.id)}
                  last
                />
              </View>
            );
          }}
        />
      )}
    </View>
  );
}
