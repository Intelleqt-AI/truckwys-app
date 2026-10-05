import { useLayoutEffect, useState } from 'react';
import { View, Alert, Platform, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  SearchField,
  FilterChips,
  ListRow,
  IconButton,
  OverflowMenu,
  Badge,
  Mono,
  EmptyState,
  Button,
  type OverflowAction,
} from '@/components/ui';
import { ListSkeleton, ErrorState } from '@/components/feedback';
import { deleteSupplier, updateSupplier, useSuppliersList } from '@/lib/finance/api';
import type { Supplier } from '@/lib/finance/types';
import { expenseCategoryLabel } from '../api';
import { useTheme } from '@/theme/ThemeProvider';
import { useManualRefresh } from '@/hooks/useManualRefresh';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'Suppliers'>;

type StatusFilter = 'ACTIVE' | 'INACTIVE' | 'ALL';

/** The people a company buys from: fuel stops, tyre shops, subcontractors. Expenses link to one. */
export function SuppliersScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ACTIVE');
  const search = useDebouncedValue(q.trim());
  // Server-side: the active filter and the search (name, VAT or registration
  // number, email) are done by the API, one page at a time; page 1 carries the
  // active / inactive / all counts over every supplier.
  const list = useSuppliersList(status, search);
  const { refreshing, onRefresh } = useManualRefresh(list.refresh);
  const data = list.combinedData;

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Suppliers',
      headerLargeTitle: false,
      headerTransparent: false,
      headerStyle: { backgroundColor: colors.bgDeep },
      headerRight: () => (
        <IconButton name="plus" accessibilityLabel="Add supplier" onPress={() => navigation.navigate('SupplierForm')} />
      ),
    });
  }, [navigation, colors.bgDeep]);

  const counts = list.extras?.counts;

  const toggleActive = async (s: Supplier) => {
    try {
      await updateSupplier(s.id, { is_active: !s.is_active });
      invalidateFor(qc, 'supplier');
      toast.success(s.is_active ? 'Supplier deactivated' : 'Supplier activated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update the supplier");
    }
  };

  const confirmDelete = (s: Supplier) =>
    Alert.alert('Delete this supplier?', `${s.name} will be removed.`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            try {
              await deleteSupplier(s.id);
              invalidateFor(qc, 'supplier');
              toast.success('Supplier deleted');
            } catch (e) {
              // A supplier with expenses can't be deleted; the server says so.
              toast.error(e instanceof Error ? e.message : 'Deactivate it instead.');
            }
          })(),
      },
    ]);

  const actionsFor = (s: Supplier): OverflowAction[] => [
    { label: 'Edit', icon: 'edit', onPress: () => navigation.navigate('SupplierForm', { id: s.id, preview: { ...s } }) },
    { label: s.is_active ? 'Deactivate' : 'Activate', icon: s.is_active ? 'eyeOff' : 'check', onPress: () => void toggleActive(s) },
    // Only one that has never been used; otherwise deactivate it.
    ...(s.expense_count === 0
      ? [{ label: 'Delete', icon: 'trash' as const, destructive: true, onPress: () => confirmDelete(s) }]
      : []),
  ];

  const options = [
    { label: 'Active', value: 'ACTIVE' as const, count: counts?.ACTIVE },
    { label: 'Inactive', value: 'INACTIVE' as const, count: counts?.INACTIVE },
    { label: 'All', value: 'ALL' as const, count: counts?.ALL },
  ];

  return (
    <View className="flex-1 bg-bg-deep">
      {/* Android's taller header already leaves blank space under the title (no divider),
          so no extra top padding there — otherwise the gap above the search box looks
          much larger than the gap below it. */}
      <View className={`px-screen ${Platform.OS === 'android' ? 'pt-0' : 'pt-3'}`}>
        <View className="pb-3">
          <SearchField value={q} onChangeText={setQ} placeholder="Search name, VAT or registration number…" />
        </View>
        <View className="pb-3">
          <FilterChips options={options} value={status} onChange={setStatus} />
        </View>
      </View>

      {list.isLoading ? (
        <View className="p-screen">
          <ListSkeleton />
        </View>
      ) : list.isError && data.length === 0 ? (
        <ErrorState onRetry={() => void list.refresh()} message="Couldn't load suppliers." />
      ) : (
        <FlashList
          data={data}
          keyExtractor={(s) => String(s.id)}
          onRefresh={onRefresh}
          refreshing={refreshing}
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
          ListEmptyComponent={
            <EmptyState
              icon="building"
              title={counts?.ALL === 0 ? 'No suppliers yet' : 'No suppliers here'}
              body={
                counts?.ALL === 0
                  ? 'Add the fuel stops, workshops and subcontractors you buy from, then pick them on expenses.'
                  : 'No suppliers match this filter.'
              }
              action={
                counts?.ALL === 0 ? (
                  <Button label="Add supplier" icon="plus" onPress={() => navigation.navigate('SupplierForm')} />
                ) : (
                  <Button
                    label="Show all"
                    variant="secondary"
                    onPress={() => {
                      setQ('');
                      setStatus('ALL');
                    }}
                  />
                )
              }
            />
          }
          renderItem={({ item }) => {
            const subtitle = [
              item.category ? expenseCategoryLabel(item.category) : null,
              item.vat_number ? `VAT ${item.vat_number}` : null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <View className="mb-2.5 overflow-hidden rounded-card border border-line bg-surface">
                <ListRow
                  title={item.name}
                  subtitle={subtitle || undefined}
                  detail={!item.is_active ? <Badge label="Inactive" variant="chip" /> : undefined}
                  trailing={
                    <View className="flex-row items-center gap-2.5">
                      {item.expense_count > 0 && (
                        <Mono className="text-caption text-faint">
                          {item.expense_count} {item.expense_count === 1 ? 'expense' : 'expenses'}
                        </Mono>
                      )}
                      <OverflowMenu actions={actionsFor(item)} accessibilityLabel={`Actions for ${item.name}`} title={item.name} />
                    </View>
                  }
                  onPress={() => navigation.navigate('SupplierForm', { id: item.id, preview: { ...item } })}
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
