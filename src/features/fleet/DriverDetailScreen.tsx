import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, StatCard, StatusPill, Group, DetailRow, Avatar } from '@/components/ui';
import { ErrorState } from '@/components/feedback';
import { useDriver } from './api';
import { num, str, pick } from '@/lib/api/list';
import { formatCurrency } from '@/lib/formatters';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'DriverDetail'>;

export function DriverDetailScreen({ route, navigation }: Props) {
  const { id, preview } = route.params;
  const { data, isError, refetch } = useDriver(id, preview);
  if (isError && !data) return <ErrorState onRetry={refetch} message="Couldn't load this driver." />;
  const d = (data ?? {}) as Record<string, unknown>;
  const name = str(pick(d, ['name', 'full_name', 'driver_name']), 'Driver');

  return (
    <SheetScreen eyebrow="Driver" title={name} onBack={() => navigation.goBack()}>
      <View className="mb-4 flex-row items-center gap-3">
        <Avatar name={name} size={44} />
        <StatusPill status={str(pick(d, ['status']), 'ACTIVE')} />
      </View>
      <View className="mb-5 flex-row flex-wrap gap-3">
        <View style={{ width: '47.5%' }}>
          <StatCard label="Safety" value={`${num(pick(d, ['safety_score']))}/100`} />
        </View>
        <View style={{ width: '47.5%' }}>
          <StatCard label="On-time" value={`${num(pick(d, ['on_time_score', 'on_time']))}%`} />
        </View>
        <View style={{ width: '47.5%' }}>
          <StatCard label="Efficiency" value={`${num(pick(d, ['efficiency_score', 'efficiency']))}%`} />
        </View>
        <View style={{ width: '47.5%' }}>
          <StatCard
            label="Revenue"
            value={formatCurrency(num(pick(d, ['revenue', 'total_revenue'])), { maximumFractionDigits: 0 })}
          />
        </View>
      </View>

      <Group label="Details">
        <DetailRow label="Licence" value={str(pick(d, ['license_number', 'license']), '—')} />
        <DetailRow label="Licence expiry" value={str(pick(d, ['license_expiry']), '—')} />
        <DetailRow label="Phone" value={str(pick(d, ['phone']), '—')} mono={false} last />
      </Group>
    </SheetScreen>
  );
}
