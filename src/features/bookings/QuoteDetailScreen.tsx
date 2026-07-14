import { useState } from 'react';
import { View, Share } from 'react-native';
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
import { useQuote, sendQuote } from './api';
import { num, str, pick } from '@/lib/api/list';
import { formatCurrency, formatDateTime } from '@/lib/formatters';
import { toast } from '@/lib/toast';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'QuoteDetail'>;

export function QuoteDetailScreen({ route, navigation }: Props) {
  const { id, preview } = route.params;
  const { data, isError, refetch } = useQuote(id, preview);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

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

  const doSend = async () => {
    setBusy(true);
    try {
      await sendQuote(id);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['quote', id] }),
        qc.invalidateQueries({ queryKey: ['quotes'] }),
      ]);
      toast.success('Quote sent to client');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send quote');
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!shareUrl) return toast.info('No share link yet — send the quote first');
    await Share.share({ message: `Truckwys quote ${str(pick(q, ['quote_number']), '')}: ${shareUrl}` });
  };

  const footer = (() => {
    if (status === 'DRAFT')
      return <Button label="Send to client" icon="send" loading={busy} onPress={doSend} fullWidth />;
    if (['SENT', 'VIEWED', 'QUOTED'].includes(status))
      return (
        <View className="flex-row gap-2.5">
          <View className="flex-1">
            <Button label="Remind" icon="bell" variant="secondary" onPress={doSend} fullWidth />
          </View>
          <View className="flex-1">
            <Button label="Resend link" icon="link" onPress={share} fullWidth />
          </View>
        </View>
      );
    if (accepted) return <Button label="Convert to booking" icon="arrowRight" fullWidth onPress={() => toast.info('Booking conversion coming soon')} />;
    return <Button label="Duplicate quote" icon="copy" variant="secondary" fullWidth onPress={() => toast.info('Duplicated')} />;
  })();

  return (
    <SheetScreen
      eyebrow={str(pick(q, ['customer_name', 'customer']), 'Quote')}
      title={str(pick(q, ['quote_number', 'reference']), 'Quote')}
      onBack={() => navigation.goBack()}
      actionLabel="Share"
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
