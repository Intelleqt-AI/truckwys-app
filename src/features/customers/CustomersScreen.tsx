import { useLayoutEffect, useCallback, useEffect, useState } from 'react';
import { View, RefreshControl, TouchableOpacity, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  SearchField,
  FilterChips,
  StatCard,
  KpiRow,
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
import { num, pick } from '@/lib/api/list';
import { useCustomersList, bulkDeleteCustomers, type CustomerSort } from './api';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { useTheme } from '@/theme/ThemeProvider';
import { useDemo } from '@/hooks/useDemo';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import { reportBulkDelete } from '@/lib/bulkDelete';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import type { AppStackParamList } from '@/navigation/types';
import { useManualRefresh } from '@/hooks/useManualRefresh';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatCurrency } from '@/lib/formatters';

type Props = NativeStackScreenProps<AppStackParamList, 'Customers'>;

const NOUNS = { singular: 'customer', plural: 'customers' };

const SORTS: { label: string; value: CustomerSort }[] = [
  { label: 'A to Z', value: 'name_asc' },
  { label: 'Owes most', value: 'owed' },
  { label: 'Most overdue', value: 'overdue' },
  { label: 'Newest', value: 'newest' },
];

const wholeRands = (n: number) => formatCurrency(n, { maximumFractionDigits: 0 });

export function CustomersScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const { openCustomer, openImport } = useAppNavigation();
  const demo = useDemo();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<CustomerSort>('name_asc');
  const search = useDebouncedValue(q.trim());
  // Server-side: search, sort and paging go to the API, which also sends what
  // each customer owes. Nothing here downloads every customer or the invoices.
  const list = useCustomersList(sort, search);
  const { isLoading, isError } = list;
  const data = list.combinedData;
  const { refreshing, onRefresh } = useManualRefresh(list.refresh);
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

  const hasData = data.length > 0;
  // Select-all and bulk delete work on the customers loaded so far.
  const filtered = data;

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
            <TouchableOpacity
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              activeOpacity={0.7}
              accessibilityRole="button"
              className="px-2"
              onPress={() => enter()}
            >
              <Mono className="text-sub font-medium text-link">Select</Mono>
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

  const flags = list.extras?.flags;
  const total = list.count ?? data.length;

  return (
    <View className="flex-1 bg-bg-deep">
      <View className="px-screen pt-3">
        {!isLoading && list.extras && (
          <View className="mb-3">
            <KpiRow>
              <StatCard label={search ? 'Matches' : 'Total customers'} value={String(total)} />
              <StatCard
                label="Overdue"
                value={wholeRands(flags?.total_overdue ?? 0)}
                note={(flags?.total_overdue ?? 0) > 0 ? 'Across all customers' : 'Nothing late'}
                tone={(flags?.total_overdue ?? 0) > 0 ? 'danger' : undefined}
                onPress={() => setSort('overdue')}
              />
            </KpiRow>
          </View>
        )}
        <View className="pb-3">
          <SearchField value={q} onChangeText={setQ} placeholder="Search customers…" />
        </View>
        <View className="pb-3">
          <FilterChips options={SORTS} value={sort} onChange={setSort} />
        </View>
      </View>

      {isLoading ? (
        <View className="p-screen"><ListSkeleton /></View>
      ) : isError && data.length === 0 ? (
        <ErrorState onRetry={() => void list.refresh()} message="Couldn't load customers." />
      ) : (
        <FlashList
          data={filtered}
          keyExtractor={(c) => String(c.id)}
          showsVerticalScrollIndicator={false}
          extraData={selectMode ? selected : sort}
          onEndReached={() => list.hasMore && !list.isFetching && void list.loadMore()}
          onEndReachedThreshold={1.5}
          ListFooterComponent={
            list.isFetching ? (
              <View className="py-4">
                <ActivityIndicator color={colors.faint} />
              </View>
            ) : null
          }
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.faint} />
          }
          ListEmptyComponent={
            search ? (
              <EmptyState icon="users" title="No customers match" body="Try another name, email, phone or city." />
            ) : (
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
            )
          }
          renderItem={({ item }) => {
            const isSelected = selectMode && selected.has(item.id);
            const owed = num(pick(item.raw, ['owed_amount']));
            const overdue = num(pick(item.raw, ['overdue_amount']));
            return (
              <View
                className={`mb-2.5 overflow-hidden rounded-card border ${
                  isSelected ? 'border-line-strong bg-raised' : 'border-line bg-surface'
                }`}
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
                    ) : owed > 0 ? (
                      <View className="items-end">
                        <Mono className="text-callout font-semibold text-fg">{wholeRands(owed)}</Mono>
                        <Mono className={`text-caption ${overdue > 0 ? 'text-danger' : 'text-faint'}`}>
                          {overdue > 0 ? `${wholeRands(overdue)} overdue` : 'owes'}
                        </Mono>
                      </View>
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
