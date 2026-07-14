import { View, Share } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, StatCard, StatusPill, Group, DetailRow, Button, Badge, Txt } from '@/components/ui';
import { ErrorState } from '@/components/feedback';
import { useInvoice } from './api';
import { num, str, pick } from '@/lib/api/list';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { toast } from '@/lib/toast';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'InvoiceDetail'>;

export function InvoiceDetailScreen({ route, navigation }: Props) {
  const { id, preview } = route.params;
  const { data, isError, refetch } = useInvoice(id, preview);
  if (isError && !data) return <ErrorState onRetry={refetch} message="Couldn't load this invoice." />;
  const inv = (data ?? {}) as Record<string, unknown>;

  const total = num(pick(inv, ['total', 'total_amount']));
  const balance = num(pick(inv, ['balance', 'balance_due', 'amount_due']));
  const paid = num(pick(inv, ['paid', 'amount_paid'])) || total - balance;
  const eligible = Boolean(pick(inv, ['early_pay_eligible']));
  const token = str(pick(inv, ['view_token', 'token']));

  const share = async () => {
    if (!token) return toast.info('No public link available');
    await Share.share({
      message: `Invoice ${str(pick(inv, ['invoice_number']), '')}: https://app.truckwys.co.za/invoice/view/${id}/${token}`,
    });
  };

  return (
    <SheetScreen
      eyebrow="Invoice"
      title={str(pick(inv, ['invoice_number', 'number']), 'Invoice')}
      onBack={() => navigation.goBack()}
      actionLabel="Share"
      onAction={share}
      footer={
        eligible ? (
          <Button
            label="Request Fast Pay advance"
            icon="dollar"
            onPress={() => toast.info('Fast Pay request started')}
            fullWidth
          />
        ) : undefined
      }
    >
      <View className="mb-4 flex-row items-center gap-2.5">
        <StatusPill status={str(pick(inv, ['status']), 'UNPAID')} />
        {eligible && <Badge label="Fast Pay eligible" tone="info" />}
      </View>

      <View className="mb-5 flex-row gap-3">
        <StatCard label="Total" value={formatCurrency(total, { maximumFractionDigits: 0 })} />
        <StatCard label="Balance" value={formatCurrency(balance, { maximumFractionDigits: 0 })} />
      </View>

      <Group label="Details">
        <DetailRow label="Customer" value={str(pick(inv, ['customer_name', 'customer']), '—')} mono={false} />
        <DetailRow label="Issued" value={formatDate(str(pick(inv, ['issue_date', 'created_at'])) || new Date().toISOString())} />
        <DetailRow label="Due" value={formatDate(str(pick(inv, ['due_date'])) || new Date().toISOString())} />
        <DetailRow label="Paid" value={formatCurrency(paid)} last />
      </Group>

      <Group label="Amounts">
        <DetailRow label="Subtotal" value={formatCurrency(num(pick(inv, ['subtotal'])))} />
        <DetailRow label="VAT (15%)" value={formatCurrency(num(pick(inv, ['vat', 'tax', 'vat_amount'])))} />
        <View className="flex-row items-center justify-between bg-surface-hover px-3.5 py-3.5">
          <Txt className="text-callout font-semibold text-fg">Total</Txt>
          <Txt className="text-heading font-semibold text-accent" style={{ fontFamily: 'Menlo' }}>
            {formatCurrency(total)}
          </Txt>
        </View>
      </Group>
    </SheetScreen>
  );
}
