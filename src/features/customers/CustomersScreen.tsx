import { useState, useLayoutEffect, useCallback } from 'react';
import { View, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
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
} from '@/components/ui';
import { ListSkeleton, ErrorState } from '@/components/feedback';
import { num, str, pick } from '@/lib/api/list';
import { useCustomers } from './api';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { useTheme } from '@/theme/ThemeProvider';
import { useDemo } from '@/hooks/useDemo';
import type { AppStackParamList } from '@/navigation/types';
import { useManualRefresh } from '@/hooks/useManualRefresh';

type Props = NativeStackScreenProps<AppStackParamList, 'Customers'>;

export function CustomersScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { data, isLoading, isError, refetch } = useCustomers();
  const { refreshing, onRefresh } = useManualRefresh(refetch);
  const { openCustomer } = useAppNavigation();
  const demo = useDemo();
  const [q, setQ] = useState('');

  // Customers are fixed seeded data in the demo company — creation happens
  // server-side too (400 "fixed demo data"), but stopping here avoids the
  // round trip and lets the toast fire on the tap itself.
  const handleAdd = useCallback(() => {
    if (demo.block()) return;
    navigation.navigate('AddCustomer');
  }, [demo, navigation]);

  const renderAdd = useCallback(
    () => <IconButton name="plus" accessibilityLabel="Add customer" onPress={handleAdd} />,
    [handleAdd],
  );
  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Customers',
      headerLargeTitle: false,
      headerTransparent: false,
      headerStyle: { backgroundColor: colors.bgDeep },
      headerRight: renderAdd,
    });
  }, [navigation, colors.bgDeep, renderAdd]);

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
          data={data.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()))}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="users"
              title="No customers yet"
              body="Add your first customer to start quoting."
              action={<Button label="Add customer" icon="plus" onPress={handleAdd} />}
            />
          }
          renderItem={({ item }) => (
            <View className="mb-2.5 overflow-hidden rounded-xs border border-line bg-surface">
              <ListRow
                leading={<Avatar name={item.name} size={38} />}
                title={item.name}
                subtitle={item.contact}
                trailing={
                  item.creditScore != null ? (
                    <Mono className="text-caption text-muted">{item.creditScore}</Mono>
                  ) : undefined
                }
                onPress={() => openCustomer(item.id, item.raw)}
                last
              />
            </View>
          )}
        />
      )}
    </View>
  );
}
