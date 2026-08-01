import { useState, useLayoutEffect, useCallback } from 'react';
import { View } from 'react-native';
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
import type { AppStackParamList } from '@/navigation/types';
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus';

type Props = NativeStackScreenProps<AppStackParamList, 'Customers'>;

export function CustomersScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { data, isLoading, isError, refetch } = useCustomers();
  useRefetchOnFocus(refetch);
  const { openCustomer } = useAppNavigation();
  const [q, setQ] = useState('');

  const renderAdd = useCallback(
    () => <IconButton name="plus" accessibilityLabel="Add customer" onPress={() => navigation.navigate('AddCustomer')} />,
    [navigation],
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
          ListEmptyComponent={
            <EmptyState
              icon="users"
              title="No customers yet"
              body="Add your first customer to start quoting."
              action={<Button label="Add customer" icon="plus" onPress={() => navigation.navigate('AddCustomer')} />}
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
