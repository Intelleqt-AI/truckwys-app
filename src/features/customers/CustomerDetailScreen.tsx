import { useState } from 'react';
import { View, Alert } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  SheetScreen,
  StatCard,
  Group,
  DetailRow,
  ListRow,
  StatusPill,
  Avatar,
  Button,
  Txt,
  Mono,
} from '@/components/ui';
import { ErrorState } from '@/components/feedback';
import { useCustomer, useCustomerQuotes, deleteCustomer, updateCustomer } from './api';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { num, str, pick } from '@/lib/api/list';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'CustomerDetail'>;

const PAYMENT_TERMS: Record<string, string> = {
  NET30: 'Net 30 days',
  NET60: 'Net 60 days',
  NET90: 'Net 90 days',
};

export function CustomerDetailScreen({ route, navigation }: Props) {
  const { id, preview } = route.params;
  const { data, isError, refetch } = useCustomer(id, preview);
  const { data: quotesData } = useCustomerQuotes(id);
  const { openQuote } = useAppNavigation();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  if (isError && !data) return <ErrorState onRetry={refetch} message="Couldn't load this customer." />;
  const c = (data ?? {}) as Record<string, unknown>;
  const name = str(pick(c, ['name', 'company_name', 'customer_name']), 'Customer');
  const active = pick(c, ['is_active']) !== false && str(pick(c, ['status'])).toUpperCase() !== 'INACTIVE';

  const quotes = quotesData ?? [];
  const totalQuotes = quotes.length;
  const accepted = quotes.filter((q) => str(pick(q, ['status'])).toUpperCase() === 'ACCEPTED');
  const totalRevenue = accepted.reduce((s, q) => s + num(pick(q, ['total_amount', 'quote_price'])), 0);
  const terms = str(pick(c, ['payment_terms_default']), 'NET30').toUpperCase();

  const toggleActive = async () => {
    setBusy(true);
    try {
      await updateCustomer(id, { status: active ? 'INACTIVE' : 'ACTIVE', is_active: !active });
      invalidateFor(qc, 'customer');
      toast.success();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert('Delete customer', `Permanently delete ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCustomer(id);
            invalidateFor(qc, 'customer');
            toast.success();
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
      actionIcon="edit"
      onAction={() => navigation.navigate('AddCustomer', { id, preview: c })}
      footer={
        <View className="gap-2.5">
          <Button
            label={active ? 'Mark inactive' : 'Mark active'}
            variant="secondary"
            loading={busy}
            onPress={toggleActive}
            fullWidth
          />
          <Button label="Delete customer" variant="danger" icon="x" onPress={confirmDelete} fullWidth />
        </View>
      }
    >
      <View className="mb-4 flex-row items-center gap-3">
        <Avatar name={name} size={44} />
        <View className="flex-1">
          {str(pick(c, ['company_name'])) ? (
            <Txt className="text-callout text-muted" numberOfLines={1}>
              {str(pick(c, ['company_name']))}
            </Txt>
          ) : null}
          <Mono className="text-caption text-faint">{str(pick(c, ['email', 'phone']), '')}</Mono>
        </View>
      </View>

      <Button
        label="AI analysis"
        icon="sparkle"
        variant="secondary"
        onPress={() => navigation.navigate('CustomerRisk', { id })}
        fullWidth
      />

      <View className="mb-5 mt-4 flex-row flex-wrap gap-3">
        <View style={{ width: '47.5%' }}>
          <StatCard label="Total quotes" value={String(totalQuotes)} />
        </View>
        <View style={{ width: '47.5%' }}>
          <StatCard label="Accepted" value={String(accepted.length)} />
        </View>
        <View style={{ width: '47.5%' }}>
          <StatCard label="Total revenue" value={formatCurrency(totalRevenue, { maximumFractionDigits: 0 })} />
        </View>
        <View style={{ width: '47.5%' }}>
          <StatCard
            label="Credit limit"
            value={
              pick(c, ['credit_limit']) != null
                ? formatCurrency(num(pick(c, ['credit_limit'])), { maximumFractionDigits: 0 })
                : '—'
            }
          />
        </View>
      </View>

      <Group label="Contact">
        <DetailRow label="Email" value={str(pick(c, ['email']), '—')} mono={false} />
        <DetailRow label="Phone" value={str(pick(c, ['phone']), '—')} mono={false} />
        <DetailRow label="City" value={str(pick(c, ['city']), '—')} mono={false} />
        <DetailRow label="Province" value={str(pick(c, ['state']), '—')} mono={false} />
        <DetailRow label="Zip code" value={str(pick(c, ['zip_code']), '—')} />
        <DetailRow label="Address" value={str(pick(c, ['address']), '—')} mono={false} />
        <DetailRow
          label="Billing address"
          value={str(pick(c, ['billing_address', 'address']), '—')}
          mono={false}
          last
        />
      </Group>

      <Group label="Account">
        <DetailRow label="Payment terms" value={PAYMENT_TERMS[terms] ?? terms} mono={false} />
        <DetailRow
          label="Credit limit"
          value={
            pick(c, ['credit_limit']) != null
              ? formatCurrency(num(pick(c, ['credit_limit'])), { maximumFractionDigits: 0 })
              : '—'
          }
        />
        <DetailRow label="Status" value={active ? 'Active' : 'Inactive'} mono={false} />
        <DetailRow
          label="Member since"
          value={pick(c, ['created_at']) ? formatDate(str(pick(c, ['created_at']))) : '—'}
          last
        />
      </Group>

      <Group label={`Quotes (${totalQuotes})`}>
        {quotes.length === 0 ? (
          <View className="px-3.5 py-4">
            <Txt className="text-sub text-muted">No quotes yet for this customer.</Txt>
          </View>
        ) : (
          quotes.slice(0, 15).map((q, i, arr) => {
            const qid = pick(q, ['id']) as string | number;
            return (
              <ListRow
                key={String(qid ?? i)}
                title={str(pick(q, ['quote_number', 'reference']), `#${qid}`)}
                subtitle={`${str(pick(q, ['pickup_location']), '—')} → ${str(pick(q, ['delivery_location']), '—')}`}
                trailing={
                  <View className="items-end gap-1">
                    <Mono className="text-callout font-semibold text-fg">
                      {formatCurrency(num(pick(q, ['total_amount', 'quote_price'])), { maximumFractionDigits: 0 })}
                    </Mono>
                    <StatusPill status={str(pick(q, ['status']), 'DRAFT').toUpperCase()} />
                  </View>
                }
                onPress={() => qid != null && openQuote(qid, q)}
                last={i === Math.min(arr.length, 15) - 1}
              />
            );
          })
        )}
      </Group>
    </SheetScreen>
  );
}
