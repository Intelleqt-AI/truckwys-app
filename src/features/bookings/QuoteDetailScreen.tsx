import { useState } from 'react';
import { View, Share, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  SheetScreen,
  Group,
  DetailRow,
  RoutePreview,
  StatusPill,
  SelectField,
  Badge,
  Button,
  Icon,
  Txt,
  Mono,
} from '@/components/ui';
import { ErrorState } from '@/components/feedback';
import {
  useQuote,
  sendQuote,
  convertQuoteToLoad,
  deleteQuote,
  downloadQuotePdf,
  patchQuote,
} from './api';
import { num, str, pick } from '@/lib/api/list';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { toast } from '@/lib/toast';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'QuoteDetail'>;

// Matches the web quote-detail status dropdown (plain PATCH { status }).
const STATUS_OPTIONS = [
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Sent', value: 'SENT' },
  { label: 'Accepted', value: 'ACCEPTED' },
  { label: 'Declined', value: 'DECLINED' },
  { label: 'In-Transit', value: 'IT' },
  { label: 'Completed', value: 'COMPLETED' },
];

const round2 = (n: number) => Math.round(n * 100) / 100;
const titleCase = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '');

export function QuoteDetailScreen({ route, navigation }: Props) {
  const { id, preview } = route.params;
  const { data, isError, refetch } = useQuote(id, preview);
  const qc = useQueryClient();
  const [sendBusy, setSendBusy] = useState(false);
  const [convertBusy, setConvertBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  if (isError && !data) return <ErrorState onRetry={refetch} message="Couldn't load this quote." />;
  const q = (data ?? {}) as Record<string, unknown>;

  const status = str(pick(q, ['status']), 'DRAFT').toUpperCase();
  const total = num(pick(q, ['total_amount', 'price']));
  const marginPct = num(pick(q, ['margin_percentage', 'margin_percent', 'margin']));
  const confidence = str(pick(q, ['confidence']));
  const roundTrip = str(pick(q, ['trip_type'])).toUpperCase() === 'ROUND_TRIP';
  const token = str(pick(q, ['token', 'view_token']));
  const shareUrl = token ? `https://app.truckwys.co.za/quotes/view/${id}/${token}` : undefined;

  // Full-text locations (web uses pickup_location / delivery_location, not codes).
  const origin = str(pick(q, ['pickup_location', 'origin_city', 'origin', 'pickup_city']), '—');
  const dest = str(pick(q, ['delivery_location', 'destination_city', 'destination', 'delivery_city']), '—');

  // Customer (flat fields on the quote).
  const customer = [
    { label: 'Name', value: str(pick(q, ['customer_name', 'customer'])) },
    { label: 'Company', value: str(pick(q, ['customer_company'])) },
    { label: 'Email', value: str(pick(q, ['customer_email'])) },
    { label: 'Phone', value: str(pick(q, ['customer_phone'])) },
    { label: 'City', value: str(pick(q, ['customer_city'])) },
  ].filter((r) => r.value);

  // Cargo details (web "Cargo Details" card).
  const weightKg = num(pick(q, ['weight']));
  const distanceKm = num(pick(q, ['distance']));
  const cargo = [
    { label: 'Description', value: str(pick(q, ['cargo_description'])) },
    { label: 'Vehicle type', value: str(pick(q, ['vehicle_type'])) },
    { label: 'Weight', value: weightKg > 0 ? `${weightKg.toLocaleString()} kg` : '' },
    { label: 'Distance', value: distanceKm > 0 ? `${Math.round(distanceKm).toLocaleString()} km` : '' },
    { label: 'Assigned vehicle', value: str(pick(q, ['vehicle_display'])) },
    { label: 'Assigned driver', value: str(pick(q, ['driver_display'])) },
  ].filter((r) => r.value);

  // Cost breakdown — exact web order + conditionals.
  const fuel = num(pick(q, ['fuel_surcharge']));
  const toll = num(pick(q, ['toll_charges']));
  const driver = num(pick(q, ['driver_allowance']));
  const additional = num(pick(q, ['additional_charges']));
  const returnBaseRate = num(pick(q, ['return_base_rate']));
  const serviceCharge = round2(total - fuel - toll - driver - additional);
  const costRows: { label: string; value: number }[] = [
    { label: 'Fuel surcharge', value: fuel },
    { label: 'Toll charges', value: toll },
    { label: 'Driver allowance', value: driver },
  ];
  if (additional > 0) costRows.push({ label: 'Additional charges', value: additional });
  if (serviceCharge > 0) costRows.push({ label: 'Service charge', value: serviceCharge });
  if (roundTrip && returnBaseRate > 0) costRows.push({ label: 'Return leg', value: returnBaseRate });

  const validUntil = str(pick(q, ['valid_until']));
  const createdAt = str(pick(q, ['created_at']));
  const notes = str(pick(q, ['notes']));

  const accepted = ['ACCEPTED', 'APPROVED'].includes(status);

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
  const changeStatus = (s: string) => {
    if (s === status || statusBusy) return;
    run(setStatusBusy, () => patchQuote(id, { status: s }), 'Status updated');
  };

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
        <Badge label={roundTrip ? 'Round trip' : 'One way'} tone={roundTrip ? 'info' : 'neutral'} />
        {marginPct > 0 && <Mono className="text-micro text-faint">Margin {marginPct}%</Mono>}
      </View>

      <View className="mb-5">
        <RoutePreview
          origin={origin}
          dest={dest}
          distance={distanceKm > 0 ? `${Math.round(distanceKm)} km` : undefined}
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

      {customer.length > 0 && (
        <Group label="Customer">
          {customer.map((c, i) => (
            <DetailRow key={c.label} label={c.label} value={c.value} mono={false} last={i === customer.length - 1} />
          ))}
        </Group>
      )}

      {cargo.length > 0 && (
        <Group label="Cargo details">
          {cargo.map((c, i) => (
            <DetailRow key={c.label} label={c.label} value={c.value} mono={false} last={i === cargo.length - 1} />
          ))}
        </Group>
      )}

      {roundTrip && (
        <Group label="Return leg">
          <DetailRow label="Returns to" value={str(pick(q, ['return_location']), '—')} mono={false} />
          {str(pick(q, ['return_cargo'])) ? (
            <DetailRow label="Return cargo" value={str(pick(q, ['return_cargo']))} mono={false} />
          ) : null}
          {str(pick(q, ['return_date'])) ? (
            <DetailRow label="Return date" value={formatDate(str(pick(q, ['return_date'])))} />
          ) : null}
          {returnBaseRate > 0 ? (
            <DetailRow label="Return rate" value={formatCurrency(returnBaseRate)} last />
          ) : null}
        </Group>
      )}

      {costRows.length > 0 && (
        <Group label="Cost breakdown">
          {costRows.map((c) => (
            <DetailRow key={c.label} label={c.label} value={formatCurrency(c.value)} />
          ))}
          <View className="flex-row items-center justify-between bg-surface-hover px-3.5 py-3.5">
            <Txt className="text-callout font-semibold text-fg">
              {roundTrip ? 'Total · both legs' : 'Total'}
              {marginPct ? ` · ${marginPct}% margin` : ''}
            </Txt>
            <Mono className="text-heading font-semibold text-accent">{formatCurrency(total)}</Mono>
          </View>
        </Group>
      )}

      <Group label="Quote info">
        <View className="border-b border-line-row px-3.5 py-3">
          <SelectField
            label="Status"
            options={STATUS_OPTIONS}
            value={status}
            onSelect={changeStatus}
          />
        </View>
        {confidence ? <DetailRow label="Confidence" value={titleCase(confidence)} mono={false} /> : null}
        <DetailRow label="Margin" value={`${marginPct || 0}%`} />
        {validUntil ? <DetailRow label="Valid until" value={formatDate(validUntil)} /> : null}
        {createdAt ? <DetailRow label="Created" value={formatDate(createdAt)} last /> : null}
      </Group>

      {notes ? (
        <Group label="Notes">
          <View className="px-3.5 py-3">
            <Txt className="text-sub text-muted">{notes}</Txt>
          </View>
        </Group>
      ) : null}
    </SheetScreen>
  );
}
