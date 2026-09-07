import { View, Alert } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  SheetScreen,
  StatCard,
  StatusPill,
  SelectField,
  Group,
  DetailRow,
  ListRow,
  Avatar,
  Button,
  Icon,
  Mono,
  Txt,
} from '@/components/ui';
import { ErrorState } from '@/components/feedback';
import { useDriver, useDriverLoads, updateDriver, deleteDriver, DRIVER_STATUSES } from './api';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { num, str, pick, asArray } from '@/lib/api/list';
import { resolveDriverName } from '@/types/domain';
import { formatCurrency, formatCurrencyCompact, formatDate, formatNumber, formatPercent } from '@/lib/formatters';
import { useTheme } from '@/theme/ThemeProvider';
import { status as statusHues } from '@/theme/tokens';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import { useDemo } from '@/hooks/useDemo';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'DriverDetail'>;

const showDate = (v: string) => (v ? formatDate(v) : '—');
const statusLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replace(/_/g, ' ');
const isPast = (v: string) => (v ? new Date(v).getTime() < Date.now() : false);

export function DriverDetailScreen({ route, navigation }: Props) {
  const { id, preview } = route.params;
  const { data, isError, refetch } = useDriver(id, preview);
  const { data: loadsData } = useDriverLoads(id);
  const { openLoad } = useAppNavigation();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const demo = useDemo();

  if (isError && !data) return <ErrorState onRetry={refetch} message="Couldn't load this driver." />;
  const d = (data ?? {}) as Record<string, unknown>;
  const userDetails = (pick(d, ['user_details']) ?? {}) as Record<string, unknown>;
  const name = resolveDriverName(d);
  const status = str(pick(d, ['status']), 'ACTIVE').toUpperCase();

  const loads = asArray(loadsData ?? []);

  const licenceExpiry = str(pick(d, ['license_expiry']));
  const medicalExpiry = str(pick(d, ['medical_card_expiry']));
  const submeta = [str(pick(d, ['license_number'])), str(pick(userDetails, ['phone']))]
    .filter(Boolean)
    .join(' · ');

  const setStatus = async (next: string) => {
    if (next === status) return;
    if (demo.block()) return;
    try {
      await updateDriver(id, { status: next });
      invalidateFor(qc, 'driver');
      toast.success();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const confirmDelete = () => {
    if (demo.block()) return;
    Alert.alert('Delete driver', `Permanently delete ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDriver(id);
            invalidateFor(qc, 'driver');
            toast.success('Driver deleted');
            navigation.goBack();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not delete');
          }
        },
      },
    ]);
  };

  return (
    <SheetScreen
      title={name}
      onBack={() => navigation.goBack()}
      actionLabel="Edit"
      actionIcon="edit"
      onAction={() => {
        if (demo.block()) return;
        navigation.navigate('AddDriver', { id, preview: d });
      }}
      footer={<Button label="Delete driver" variant="danger" icon="x" onPress={confirmDelete} fullWidth />}
    >
      <View className="mb-4 flex-row items-center gap-3">
        <Avatar name={name} uri={str(pick(userDetails, ['avatar'])) || undefined} size={44} />
        <View className="flex-1">
          <Txt className="text-body font-medium text-fg" numberOfLines={1}>
            {name}
          </Txt>
          {submeta ? (
            <Mono className="mt-0.5 text-caption text-faint" numberOfLines={1}>
              {submeta}
            </Mono>
          ) : null}
        </View>
        <StatusPill status={status} />
      </View>

      <View className="mb-5">
        <SelectField
          label="Update status"
          options={DRIVER_STATUSES.map((s) => ({ label: statusLabel(s), value: s }))}
          value={status}
          onSelect={setStatus}
        />
      </View>

      <View className="mb-5 flex-row flex-wrap gap-3">
        <View className="flex-row" style={{ width: '47.5%' }}>
          <StatCard label="Safety" value={`${num(pick(d, ['safety_score']))}/100`} />
        </View>
        <View className="flex-row" style={{ width: '47.5%' }}>
          <StatCard label="On-time" value={formatPercent(num(pick(d, ['on_time_rate'])))} />
        </View>
        <View className="flex-row" style={{ width: '47.5%' }}>
          <StatCard label="Trips" value={String(num(pick(d, ['total_trips'])))} />
        </View>
        <View className="flex-row" style={{ width: '47.5%' }}>
          <StatCard label="Revenue" value={formatCurrencyCompact(num(pick(d, ['revenue_generated'])))} />
        </View>
      </View>

      <Group label="Contact">
        <DetailRow label="Phone" value={str(pick(userDetails, ['phone']), '—')} mono={false} />
        <DetailRow label="Email" value={str(pick(userDetails, ['email']), '—')} mono={false} />
        <DetailRow label="Address" value={str(pick(userDetails, ['address']), '—')} mono={false} />
        <DetailRow
          label="Emergency contact"
          value={str(pick(d, ['emergency_contact']), '—')}
          mono={false}
          last
        />
      </Group>

      <Group label="Licence & compliance">
        <DetailRow label="Licence number" value={str(pick(d, ['license_number', 'license']), '—')} />
        <DetailRow label="Province" value={str(pick(d, ['license_state']), '—')} />
        <DetailRow
          label="Licence expiry"
          value={showDate(licenceExpiry)}
          valueColor={isPast(licenceExpiry) ? statusHues.danger : undefined}
        />
        <DetailRow
          label="Medical expiry"
          value={showDate(medicalExpiry)}
          valueColor={isPast(medicalExpiry) ? statusHues.danger : undefined}
          last
        />
      </Group>

      <Group label="Employment">
        <DetailRow label="Hire date" value={showDate(str(pick(d, ['hire_date'])))} />
        <DetailRow label="Experience" value={`${num(pick(d, ['experience_years']))} years`} />
        <DetailRow
          label="Assigned vehicle"
          value={str(pick(d, ['assigned_vehicle']), 'Unassigned')}
          mono={false}
          last
        />
      </Group>

      <Group label="Performance & safety">
        <DetailRow label="Efficiency" value={`${num(pick(d, ['efficiency_score']))}/100`} />
        <DetailRow label="Trips this month" value={String(num(pick(d, ['trips_this_month'])))} />
        <DetailRow label="Total distance" value={`${formatNumber(num(pick(d, ['total_distance'])))} km`} />
        <DetailRow
          label="Avg revenue / trip"
          value={formatCurrencyCompact(num(pick(d, ['avg_revenue_per_trip'])))}
        />
        <DetailRow label="Margin / trip" value={formatCurrencyCompact(num(pick(d, ['margin_per_trip'])))} />
        <DetailRow label="Violations" value={String(num(pick(d, ['violation_count'])))} />
        <DetailRow label="Accidents" value={String(num(pick(d, ['accident_history'])))} last />
      </Group>

      <Group label={`Recent loads (${loads.length})`}>
        {loads.length === 0 ? (
          <View className="px-3.5 py-4">
            <Txt className="text-sub text-muted">No loads yet for this driver.</Txt>
          </View>
        ) : (
          loads.slice(0, 15).map((l, i, arr) => {
            const lid = pick(l, ['id']) as string | number;
            return (
              <ListRow
                key={String(lid ?? i)}
                leading={<Icon name="truck" size={20} color={colors.muted} />}
                title={str(pick(l, ['load_number', 'reference']), 'Load')}
                subtitle={`${str(pick(l, ['pickup_city']), '—')} → ${str(pick(l, ['delivery_city']), '—')}`}
                trailing={
                  <View className="items-end gap-1">
                    <Mono className="text-callout font-semibold text-fg">
                      {formatCurrency(num(pick(l, ['total_amount'])), { maximumFractionDigits: 0 })}
                    </Mono>
                    <StatusPill status={str(pick(l, ['status']), 'PENDING').toUpperCase()} />
                  </View>
                }
                onPress={() => lid != null && openLoad(lid, l)}
                last={i === Math.min(arr.length, 15) - 1}
              />
            );
          })
        )}
      </Group>
    </SheetScreen>
  );
}
