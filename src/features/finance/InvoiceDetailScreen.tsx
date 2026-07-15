import { useState } from 'react';
import { View, Share, Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, StatCard, StatusPill, Group, DetailRow, Button, Badge, Txt } from '@/components/ui';
import { ErrorState } from '@/components/feedback';
import {
  useInvoice,
  generateInvoicePdf,
  sendInvoice,
  sendInvoiceReminder,
  markInvoicePaid,
  recordPayment,
} from './api';
import { num, str, pick } from '@/lib/api/list';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { toast } from '@/lib/toast';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'InvoiceDetail'>;

export function InvoiceDetailScreen({ route, navigation }: Props) {
  const { id, preview } = route.params;
  const { data, isError, refetch } = useInvoice(id, preview);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  if (isError && !data) return <ErrorState onRetry={refetch} message="Couldn't load this invoice." />;
  const inv = (data ?? {}) as Record<string, unknown>;

  const total = num(pick(inv, ['total', 'total_amount']));
  const balance = num(pick(inv, ['balance', 'balance_due', 'amount_due']));
  const paid = num(pick(inv, ['paid', 'amount_paid'])) || total - balance;
  const eligible = Boolean(pick(inv, ['early_pay_eligible']));
  const token = str(pick(inv, ['view_token', 'token']));
  const status = str(pick(inv, ['status']), 'UNPAID').toUpperCase();

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['invoice', id] }),
      qc.invalidateQueries({ queryKey: ['invoices'] }),
    ]);

  const run = async (fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
      toast.success(okMsg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const openPdf = async () => {
    setBusy(true);
    try {
      const res = await generateInvoicePdf(id);
      const url = str(pick(res, ['pdf_url', 'url', 'file']));
      if (!url) throw new Error('No PDF returned');
      await WebBrowser.openBrowserAsync(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not generate PDF');
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!token) return toast.info('No public link available');
    await Share.share({
      message: `Invoice ${str(pick(inv, ['invoice_number']), '')}: https://app.truckwys.co.za/invoice/view/${id}/${token}`,
    });
  };

  const confirmPayment = () =>
    Alert.alert('Record payment', `Record full balance of ${formatCurrency(balance)} as paid?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Record',
        onPress: () => run(() => recordPayment({ invoice: Number(id), amount: balance }), 'Payment recorded'),
      },
    ]);

  return (
    <SheetScreen
      eyebrow="Invoice"
      title={str(pick(inv, ['invoice_number', 'number']), 'Invoice')}
      onBack={() => navigation.goBack()}
      actionLabel="Share"
      onAction={share}
      footer={
        <View className="gap-2.5">
          <View className="flex-row gap-2.5">
            <View className="flex-1">
              <Button label="PDF" icon="download" variant="secondary" loading={busy} onPress={openPdf} fullWidth />
            </View>
            <View className="flex-1">
              <Button label="Send" icon="send" loading={busy} onPress={() => run(() => sendInvoice(id), 'Invoice sent')} fullWidth />
            </View>
          </View>
          {status !== 'PAID' && (
            <View className="flex-row gap-2.5">
              <View className="flex-1">
                <Button label="Reminder" icon="bell" variant="secondary" onPress={() => run(() => sendInvoiceReminder(id), 'Reminder sent')} fullWidth />
              </View>
              <View className="flex-1">
                <Button label="Record payment" icon="dollar" onPress={confirmPayment} fullWidth />
              </View>
            </View>
          )}
          {status !== 'PAID' && (
            <Button label="Mark as paid" variant="secondary" onPress={() => run(() => markInvoicePaid(id), 'Marked paid')} fullWidth />
          )}
          {eligible && status !== 'PAID' && (
            <Button label="Request Fast Pay advance" icon="dollar" onPress={() => navigation.navigate('Capital')} fullWidth />
          )}
        </View>
      }
    >
      <View className="mb-4 flex-row items-center gap-2.5">
        <StatusPill status={status} />
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
