import { useState } from 'react';
import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AmbientGlow,
  SearchField,
  Avatar,
  ListRow,
  IconButton,
  Txt,
  Mono,
  EmptyState,
  Button,
} from '@/components/ui';
import { ListSkeleton, ErrorState } from '@/components/feedback';
import { useCustomers } from './api';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'Customers'>;

export function CustomersScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError, refetch } = useCustomers();
  const { openCustomer } = useAppNavigation();
  const [q, setQ] = useState('');

  return (
    <View className="flex-1 bg-bg-deep" style={{ paddingTop: insets.top }}>
      <AmbientGlow />
      <View className="flex-row items-center justify-between px-2 pt-1">
        <IconButton name="chevronLeft" accessibilityLabel="Back" onPress={() => navigation.goBack()} />
        <IconButton name="plus" accessibilityLabel="Add customer" onPress={() => navigation.navigate('AddCustomer')} />
      </View>
      <View className="px-screen pb-3">
        <Txt className="mb-3 text-title font-semibold text-fg" style={{ fontSize: 24 }}>
          Customers
        </Txt>
        <SearchField value={q} onChangeText={setQ} placeholder="Search customers…" />
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
