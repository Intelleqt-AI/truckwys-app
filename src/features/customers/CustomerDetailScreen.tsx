import { View, Alert } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, StatCard, Group, DetailRow, Avatar, SectionLabel, Button, Txt, Mono } from '@/components/ui';
import { ErrorState } from '@/components/feedback';
import { useCustomer, useCustomerRisk, deleteCustomer } from './api';
import { num, str, pick } from '@/lib/api/list';
import { formatCurrency } from '@/lib/formatters';
import { toast } from '@/lib/toast';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'CustomerDetail'>;

export function CustomerDetailScreen({ route, navigation }: Props) {
  const { id, preview } = route.params;
  const { data, isError, refetch } = useCustomer(id, preview);
  const { data: risk } = useCustomerRisk(id);
  const qc = useQueryClient();
  if (isError && !data) return <ErrorState onRetry={refetch} message="Couldn't load this customer." />;
  const c = (data ?? {}) as Record<string, unknown>;
  const name = str(pick(c, ['name', 'company_name', 'customer_name']), 'Customer');

  const confirmDelete = () =>
    Alert.alert('Delete customer', `Permanently delete ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCustomer(id);
            await qc.invalidateQueries({ queryKey: ['customers'] });
            toast.success('Customer deleted');
            navigation.goBack();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not delete');
          }
        },
      },
    ]);

  return (
    <SheetScreen
      eyebrow="Customer"
      title={name}
      onBack={() => navigation.goBack()}
      actionLabel="Edit"
      onAction={() => navigation.navigate('AddCustomer', { id, preview: c })}
      footer={<Button label="Delete customer" variant="danger" icon="x" onPress={confirmDelete} fullWidth />}
    >
      <View className="mb-4 flex-row items-center gap-3">
        <Avatar name={name} size={44} />
        <View>
          <Txt className="text-callout text-muted">{str(pick(c, ['contact_name', 'email']), '')}</Txt>
          <Mono className="text-caption text-faint">{str(pick(c, ['phone']), '')}</Mono>
        </View>
      </View>

      <View className="mb-5 flex-row flex-wrap gap-3">
        <View style={{ width: '47.5%' }}>
          <StatCard label="Credit score" value={String(num(pick(c, ['credit_score'])) || '—')} />
        </View>
        <View style={{ width: '47.5%' }}>
          <StatCard
            label="Credit limit"
            value={formatCurrency(num(pick(c, ['credit_limit'])), { maximumFractionDigits: 0 })}
          />
        </View>
        <View style={{ width: '47.5%' }}>
          <StatCard label="Avg days to pay" value={`${num(pick(c, ['avg_days_to_pay']))}d`} />
        </View>
        <View style={{ width: '47.5%' }}>
          <StatCard label="Dispute rate" value={`${num(pick(c, ['dispute_rate']))}%`} />
        </View>
      </View>

      {risk && (
        <>
          <SectionLabel>Risk profile</SectionLabel>
          <Group>
            <DetailRow label="Risk score" value={String(num(pick(risk, ['score', 'risk_score'])) || '—')} />
            <DetailRow label="Rating" value={str(pick(risk, ['rating', 'band', 'grade']), '—')} mono={false} />
            <DetailRow
              label="Recommendation"
              value={str(pick(risk, ['recommendation', 'decision']), '—')}
              mono={false}
              last
            />
          </Group>
        </>
      )}

      <Group label="Contact">
        <DetailRow label="Email" value={str(pick(c, ['email']), '—')} mono={false} />
        <DetailRow label="Phone" value={str(pick(c, ['phone']), '—')} mono={false} />
        <DetailRow label="Address" value={str(pick(c, ['address']), '—')} mono={false} last />
      </Group>
    </SheetScreen>
  );
}
