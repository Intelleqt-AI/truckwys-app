import { useState } from 'react';
import { View, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  SheetScreen,
  SectionLabel,
  SelectField,
  StatCard,
  StatusPill,
  Group,
  DetailRow,
  Timeline,
  type TimelineStep,
  Button,
  Icon,
  Txt,
  Mono,
  Label,
} from '@/components/ui';
import { ErrorState } from '@/components/feedback';
import { useLoad, updateLoadStatus, convertLoadToInvoice, uploadLoadPod, assignLoadDriver } from './api';
import { AssignSheet, assignedIds } from './AssignSheet';
import { useSubscription } from '@/hooks/useSubscription';
import { LOAD_STEPS, VALID_TRANSITIONS, STATUS_LABEL, stepIndexFor } from './constants';
import { num, str, pick } from '@/lib/api/list';
import { invalidateFor } from '@/lib/queryInvalidation';
import { formatCurrency, formatDate, formatNumber } from '@/lib/formatters';
import { useTheme } from '@/theme/ThemeProvider';
import { status as statusHues } from '@/theme/tokens';
import { toast } from '@/lib/toast';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'LoadDetail'>;

export function LoadDetailScreen({ route, navigation }: Props) {
  const { id, preview } = route.params;
  const { data, isError, refetch } = useLoad(id, preview);
  const { colors } = useTheme();
  const qc = useQueryClient();
  const subscription = useSubscription();
  const [busy, setBusy] = useState(false);
  const [podBusy, setPodBusy] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [assignBusy, setAssignBusy] = useState(false);

  if (isError && !data) return <ErrorState onRetry={refetch} message="Couldn't load this booking." />;
  const l = (data ?? {}) as Record<string, unknown>;

  const status = str(pick(l, ['status']), 'PENDING').toUpperCase();
  const idx = stepIndexFor(status);
  const transitions = VALID_TRANSITIONS[status] ?? [];
  const rate = num(pick(l, ['rate']));
  const distance = num(pick(l, ['distance']));
  const total = num(pick(l, ['total_amount']));
  const ratePerKm = distance ? rate / distance : 0;
  const invoiced = status === 'INVOICED' || !!pick(l, ['invoice_id', 'invoice']);
  const hasPod = !!pick(l, ['pod_signature', 'pod_received_by', 'pod_document']);
  const current = assignedIds(l);
  const hasAssignment = !!(current.driverId || current.vehicleId);

  // Each stage shows the one real fact the API actually records for it — the
  // Load model only has `created_at` and `actual_delivered_at` as genuine
  // per-stage timestamps, so nothing here is a guessed date.
  const timelineSteps: TimelineStep[] = LOAD_STEPS.map((step, i) => {
    const base = { label: STATUS_LABEL(step), done: i < idx, current: i === idx, color: colors.accent };
    switch (step) {
      case 'PENDING': {
        const createdAt = str(pick(l, ['created_at']));
        return { ...base, time: createdAt ? `Created ${formatDate(createdAt)}` : undefined };
      }
      case 'ASSIGNED': {
        const driverName = str(pick(l, ['driver_name']));
        const vehicleInfo = str(pick(l, ['vehicle_info']));
        const meta = [driverName, vehicleInfo].filter(Boolean).join(' · ');
        // The check attests to an assignment, not to lifecycle position: the
        // backend only enforces driver+vehicle for the ASSIGNED status itself,
        // so a load can legitimately reach IN_TRANSIT with neither. Deriving
        // `done` from the same `meta` that gets rendered makes a checkmark over
        // "Not yet assigned" unrepresentable.
        return { ...base, done: base.done && !!meta, meta: meta || 'Not yet assigned' };
      }
      case 'IN_TRANSIT': {
        const pickupDate = str(pick(l, ['pickup_date']));
        return { ...base, time: pickupDate ? `Pickup ${formatDate(pickupDate)}` : undefined };
      }
      case 'DELIVERED': {
        const deliveredAt = str(pick(l, ['actual_delivered_at']));
        const deliveryDate = str(pick(l, ['delivery_date']));
        return {
          ...base,
          time: deliveredAt
            ? `Delivered ${formatDate(deliveredAt)}`
            : base.done
              // Already delivered — a "Due" date here would read as still pending.
              ? undefined
              : deliveryDate
                ? `Due ${formatDate(deliveryDate)}`
                : undefined,
        };
      }
      case 'INVOICED': {
        const invoiceNumber = str(pick(l, ['invoice_number', 'invoice']));
        return { ...base, meta: invoiceNumber ? `Invoice ${invoiceNumber}` : undefined };
      }
      default:
        return base;
    }
  });
  // The API doesn't record how far a cancelled load got, so the honest thing
  // is to leave every stage muted (idx is -1) and cap the list with its own
  // terminal row, rather than guessing which stage it was cancelled from.
  if (status === 'CANCELLED') {
    timelineSteps.push({ label: 'Cancelled', done: true, current: false, color: statusHues.danger });
  }

  const refresh = () => invalidateFor(qc, 'load');

  const doStatus = async (next: string) => {
    if (subscription.blocked) return toast.error(subscription.notice ?? 'Subscription inactive');
    setBusy(true);
    try {
      await updateLoadStatus(id, next);
      refresh();
      toast.success();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = (next: string) => {
    if (next === status || busy) return;
    // Cancelling a load that's already moving is destructive — confirm first.
    if (next === 'CANCELLED' && !['PENDING', 'LOADING'].includes(status)) {
      Alert.alert('Cancel load', 'Cancel this load? This can only be undone by re-opening it.', [
        { text: 'Keep', style: 'cancel' },
        { text: 'Cancel load', style: 'destructive', onPress: () => doStatus('CANCELLED') },
      ]);
      return;
    }
    doStatus(next);
  };

  const createInvoice = async () => {
    setBusy(true);
    try {
      await convertLoadToInvoice(id);
      // Creates an invoice, so the invoice list/finance totals move too —
      // 'load' already covers invoices in the map.
      refresh();
      toast.success();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create invoice');
    } finally {
      setBusy(false);
    }
  };

  const submitAssign = async (driverId: string, vehicleId: string) => {
    if (subscription.blocked) return toast.error(subscription.notice ?? 'Subscription inactive');
    setAssignBusy(true);
    try {
      await assignLoadDriver(id, driverId ? Number(driverId) : null, vehicleId ? Number(vehicleId) : null);
      // Availability changed for whoever was picked up or released.
      refresh();
      setShowAssign(false);
      toast.success(driverId && vehicleId ? 'Assigned' : 'Unassigned');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not assign');
    } finally {
      setAssignBusy(false);
    }
  };

  const uploadPod = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    setPodBusy(true);
    try {
      const name = asset.fileName ?? `pod-${id}.jpg`;
      const type = asset.mimeType ?? 'image/jpeg';
      await uploadLoadPod(id, { uri: asset.uri, name, type });
      // A POD is what makes an invoice Fast Pay-eligible, so this moves the
      // capital lists too ('load' covers them).
      refresh();
      toast.success();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not upload POD');
    } finally {
      setPodBusy(false);
    }
  };

  return (
    <SheetScreen
      eyebrow="Load detail"
      title={str(pick(l, ['load_number', 'reference']), 'Load')}
      onBack={() => navigation.goBack()}
      footer={
        <View className="gap-2.5">
          {!invoiced && (
            <Button label="Create invoice" icon="receipt" loading={busy} onPress={createInvoice} fullWidth />
          )}
          <Button
            label={hasPod ? 'POD uploaded' : 'Upload POD'}
            icon="download"
            variant="secondary"
            loading={podBusy}
            onPress={uploadPod}
            fullWidth
          />
        </View>
      }
    >
      <View className="mb-4 flex-row items-center gap-2.5">
        <StatusPill status={status} />
        <Txt className="text-callout text-muted">{str(pick(l, ['customer_name', 'customer']), '')}</Txt>
      </View>

      {/* Status timeline — done / current / upcoming, one real fact per stage */}
      <Group label="Status">
        <View className="p-4">
          <Timeline steps={timelineSteps} />
        </View>
      </Group>

      {/* Update status — single dropdown (current + valid next states) */}
      {transitions.length > 0 && (
        <View className="mb-5">
          <SelectField
            label="Update status"
            options={[
              { label: STATUS_LABEL(status), value: status },
              ...transitions.map((ns) => ({ label: STATUS_LABEL(ns), value: ns })),
            ]}
            value={status}
            onSelect={changeStatus}
          />
        </View>
      )}

      {/* Metrics */}
      <View className="mb-5 flex-row flex-wrap gap-3">
        <View className="flex-row" style={{ width: '47.5%' }}>
          <StatCard label="Total amount" value={formatCurrency(total, { maximumFractionDigits: 0 })} />
        </View>
        <View className="flex-row" style={{ width: '47.5%' }}>
          <StatCard label="Distance" value={`${formatNumber(distance)} km`} />
        </View>
        <View className="flex-row" style={{ width: '47.5%' }}>
          <StatCard
            label="Weight"
            value={`${formatNumber(num(pick(l, ['weight'])) / 1000, { maximumFractionDigits: 0 })} t`}
          />
        </View>
        <View className="flex-row" style={{ width: '47.5%' }}>
          <StatCard label="Rate / km" value={formatCurrency(ratePerKm)} />
        </View>
      </View>

      {/* Route */}
      <SectionLabel>Route</SectionLabel>
      <View className="mb-5 rounded-xs border border-line bg-surface p-4">
        <View className="flex-row gap-3">
          <View className="items-center pt-1">
            <View style={{ width: 10, height: 10, borderRadius: 10, backgroundColor: colors.accent }} />
            <View
              style={{
                width: 0,
                flex: 1,
                minHeight: 40,
                borderLeftWidth: 2,
                borderStyle: 'dashed',
                borderColor: colors.lineActive,
                marginVertical: 4,
              }}
            />
            <Icon name="pin" size={16} color="#22C55E" />
          </View>
          <View className="flex-1">
            <Label className="text-faint" style={{ fontSize: 9 }}>
              Pickup · {formatDate(str(pick(l, ['pickup_date'])) || new Date().toISOString())}
            </Label>
            <Txt className="mt-0.5 text-callout font-medium text-fg">
              {str(pick(l, ['pickup_location', 'pickup_city']), '—')}
            </Txt>
            <Txt className="text-caption text-muted">
              {str(pick(l, ['pickup_city']))}
              {pick(l, ['pickup_state']) ? `, ${str(pick(l, ['pickup_state']))}` : ''}
            </Txt>
            <Mono className="my-3 text-caption text-faint">{str(pick(l, ['cargo']), 'General cargo')}</Mono>
            <Label className="text-faint" style={{ fontSize: 9 }}>
              Delivery · {formatDate(str(pick(l, ['delivery_date'])) || new Date().toISOString())}
            </Label>
            <Txt className="mt-0.5 text-callout font-medium text-fg">
              {str(pick(l, ['delivery_location', 'delivery_city']), '—')}
            </Txt>
            <Txt className="text-caption text-muted">
              {str(pick(l, ['delivery_city']))}
              {pick(l, ['delivery_state']) ? `, ${str(pick(l, ['delivery_state']))}` : ''}
            </Txt>
          </View>
        </View>
      </View>

      {/* Financials */}
      <Group label="Financials">
        <DetailRow label="Base rate" value={formatCurrency(rate)} />
        <DetailRow label="Fuel surcharge" value={formatCurrency(num(pick(l, ['fuel_surcharge'])))} />
        <DetailRow label="Additional" value={formatCurrency(num(pick(l, ['additional_charges', 'additional'])))} />
        <View className="flex-row items-center justify-between bg-surface-hover px-3.5 py-3.5">
          <Txt className="text-callout font-semibold text-fg">Total</Txt>
          <Mono className="text-heading font-semibold text-accent">{formatCurrency(total)}</Mono>
        </View>
      </Group>

      {/* Assignment */}
      <Group
        label="Assignment"
        action={hasAssignment ? 'Reassign' : 'Assign'}
        onAction={() => setShowAssign(true)}
      >
        <DetailRow
          label="Driver"
          value={str(pick(l, ['driver_name']), '') || 'Unassigned'}
          mono={false}
        />
        <DetailRow
          label="Vehicle"
          value={str(pick(l, ['vehicle_info']), '') || 'Unassigned'}
          mono={false}
        />
        <DetailRow label="Quote" value={str(pick(l, ['quote_number', 'quote']), '—')} last />
      </Group>

      {showAssign && (
        <AssignSheet
          mode="reassign"
          // Web doesn't filter by type when re-assigning; we do, so the picker
          // can't offer a truck that can't run this load.
          vehicleType={str(pick(l, ['vehicle_type'])) || undefined}
          initialDriverId={current.driverId}
          initialVehicleId={current.vehicleId}
          busy={assignBusy}
          onConfirm={submitAssign}
          onCancel={() => setShowAssign(false)}
        />
      )}
    </SheetScreen>
  );
}
