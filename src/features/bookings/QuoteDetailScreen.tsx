import { useState } from 'react';
import { View, Share, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  SheetScreen,
  SectionLabel,
  Group,
  DetailRow,
  RoutePreview,
  Timeline,
  StatusPill,
  ConfidenceTag,
  Button,
  Icon,
  Txt,
  Mono,
} from '@/components/ui';
import { ErrorState } from '@/components/feedback';
import { useQuote, sendQuote, convertQuoteToLoad, deleteQuote, downloadQuotePdf } from './api';
import { num, str, pick } from '@/lib/api/list';
import { formatCurrency, formatDateTime } from '@/lib/formatters';
import { toast } from '@/lib/toast';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'QuoteDetail'>;

export function QuoteDetailScreen({ route, navigation }: Props) {
  const { id, preview } = route.params;
  const { data, isError, refetch } = useQuote(id, preview);
  const qc = useQueryClient();
  const [sendBusy, setSendBusy] = useState(false);
  const [convertBusy, setConvertBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);

  if (isError && !data) return <ErrorState onRetry={refetch} message="Couldn't load this quote." />;
  const q = (data ?? {}) as Record<string, unknown>;

  const status = str(pick(q, ['status']), 'DRAFT').toUpperCase();
  const total = num(pick(q, ['total_amount', 'price']));
  const marginPct = num(pick(q, ['margin_percent', 'margin']));
  const confidence = pick(q, ['confidence']) != null ? num(pick(q, ['confidence'])) : undefined;
  const token = str(pick(q, ['token', 'view_token']));
  const shareUrl = token ? `https://app.truckwys.co.za/quotes/view/${id}/${token}` : undefined;

  const costRows: { label: string; value: number }[] = [
    { label: 'Base rate', value: num(pick(q, ['base_rate'])) },
    { label: 'Fuel surcharge', value: num(pick(q, ['fuel_surcharge'])) },
    { label: 'Toll charges', value: num(pick(q, ['toll_charges'])) },
    { label: 'Driver allowance', value: num(pick(q, ['driver_allowance'])) },
  ].filter((r) => r.value > 0);

  const viewed = ['VIEWED', 'QUOTED', 'ACCEPTED', 'APPROVED'].includes(status);
  const accepted = ['ACCEPTED', 'APPROVED'].includes(status);
  const steps = [
    { label: 'Quote created', time: formatDateTime(str(pick(q, ['created_at', 'updated_at'])) || new Date().toISOString()), done: true },
    { label: 'Sent to client', time: status !== 'DRAFT' ? 'Delivered' : undefined, done: status !== 'DRAFT', color: '#F59E0B' },
    { label: viewed ? 'Viewed by client' : 'Awaiting view', time: viewed ? 'Opened' : undefined, done: viewed, color: '#4D9EFF' },
    { label: 'Accepted', time: accepted ? 'Won' : undefined, done: accepted, color: '#22C55E' },
  ];

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['quote', id] }),
      qc.invalidateQueries({ queryKey: ['quotes'] }),
    ]);

  // Each action drives its own spinner so buttons never co-load.
  const run = async (
    setFlag: (v: boolean) => void,
    fn: () => Promise<unknown>,
    okMsg: string,
    back = false,
  ) => {
    setFlag(true);
    try {
      await fn();
      await refresh();
      toast.success(okMsg);
      if (back) navigation.goBack();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setFlag(false);
    }
  };

  const doSend = () => run(setSendBusy, () => sendQuote(id), 'Quote sent to client');
  const convert = () => run(setConvertBusy, () => convertQuoteToLoad(id), 'Converted to booking', true);
  const editQuote = () => navigation.navigate('CreateQuote', { quoteId: id });

  const download = async () => {
    setDownloadBusy(true);
    try {
      const blob = await downloadQuotePdf(id);
      const base64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('read failed'));
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
        reader.readAsDataURL(blob);
      });
      const path = `${FileSystem.cacheDirectory}Quote-${str(pick(q, ['quote_number']), String(id))}.pdf`;
      await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
      } else {
        toast.info('Sharing not available');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not download PDF');
    } finally {
      setDownloadBusy(false);
    }
  };

  const share = async () => {
    if (!shareUrl) return toast.info('No share link yet — send the quote first');
    await Share.share({ message: `Truckwys quote ${str(pick(q, ['quote_number']), '')}: ${shareUrl}` });
  };

  const confirmDelete = () =>
    Alert.alert('Delete quote', 'Permanently delete this quote?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => run(setConvertBusy, () => deleteQuote(id), 'Quote deleted', true) },
    ]);

  const footer = (
    <View className="gap-2.5">
      <View className="flex-row gap-2.5">
        <View className="flex-1">
          <Button label="Edit quote" icon="edit" variant="secondary" onPress={editQuote} fullWidth />
        </View>
        <View className="flex-1">
          <Button label="Send" icon="send" loading={sendBusy} onPress={doSend} fullWidth />
        </View>
      </View>
      {accepted && (
        <Button label="Convert to booking" icon="arrowRight" loading={convertBusy} onPress={convert} fullWidth />
      )}
      <View className="flex-row gap-2.5">
        <View className="flex-1">
          <Button label="Download PDF" icon="download" variant="secondary" loading={downloadBusy} onPress={download} fullWidth />
        </View>
        <View className="flex-1">
          <Button label="Delete" variant="danger" icon="x" onPress={confirmDelete} fullWidth />
        </View>
      </View>
    </View>
  );

  return (
    <SheetScreen
      eyebrow={str(pick(q, ['customer_name', 'customer']), 'Quote')}
      title={str(pick(q, ['quote_number', 'reference']), 'Quote')}
      onBack={() => navigation.goBack()}
      actionLabel="Share"
      actionIcon="share"
      onAction={share}
      footer={footer}
    >
      <View className="mb-4 flex-row flex-wrap items-center gap-2.5">
        <StatusPill status={status} />
        {confidence != null && <ConfidenceTag value={confidence} />}
        {marginPct > 0 && <Mono className="text-micro text-faint">Margin {marginPct}%</Mono>}
      </View>

      <View className="mb-5">
        <RoutePreview
          origin={str(pick(q, ['origin_city', 'origin', 'pickup_city']), '—')}
          dest={str(pick(q, ['destination_city', 'destination', 'delivery_city']), '—')}
          distance={pick(q, ['distance']) ? `${num(pick(q, ['distance']))} km` : undefined}
          duration={pick(q, ['sla_hours']) ? `SLA ${num(pick(q, ['sla_hours']))}h` : undefined}
        />
      </View>

      {marginPct > 0 && marginPct < 12 && (
        <View className="mb-5 flex-row items-center gap-2.5 rounded-xs border border-warning bg-warning-bg p-3">
          <Icon name="alert" size={17} color="#F59E0B" />
          <Txt className="flex-1 text-sub text-muted">
            Margin <Mono className="text-warning">{marginPct}%</Mono> is below your pricing guardrail — review
            before sending.
          </Txt>
        </View>
      )}

      {costRows.length > 0 && (
        <Group label="Cost breakdown">
          {costRows.map((c) => (
            <DetailRow key={c.label} label={c.label} value={formatCurrency(c.value)} />
          ))}
          <View className="flex-row items-center justify-between bg-surface-hover px-3.5 py-3.5">
            <Txt className="text-callout font-semibold text-fg">
              Total{marginPct ? ` · ${marginPct}% margin` : ''}
            </Txt>
            <Mono className="text-heading font-semibold text-accent">{formatCurrency(total)}</Mono>
          </View>
        </Group>
      )}

      <SectionLabel>Status timeline</SectionLabel>
      <View className="rounded-xs border border-line bg-surface p-4">
        <Timeline steps={steps} />
      </View>
    </SheetScreen>
  );
}
