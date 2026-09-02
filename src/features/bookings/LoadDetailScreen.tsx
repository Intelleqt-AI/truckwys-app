import { useState } from 'react';
import { View, Alert, Modal, Pressable } from 'react-native';
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
import { RouteMap } from '@/components/RouteMap';
import { useLoad, updateLoadStatus, uploadLoadPod } from './api';
import { assignedIds } from './AssignDriverVehicleScreen';
import { useSubscription } from '@/hooks/useSubscription';
import { LOAD_STEPS, VALID_TRANSITIONS, STATUS_LABEL, stepIndexFor } from './constants';
import { num, str, pick, asArray } from '@/lib/api/list';
import { invalidateFor } from '@/lib/queryInvalidation';
import { formatCurrency, formatDate, formatNumber } from '@/lib/formatters';
import { useTheme } from '@/theme/ThemeProvider';
import { status as statusHues } from '@/theme/tokens';
import { toast } from '@/lib/toast';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'LoadDetail'>;

export function LoadDetailScreen({ route, navigation }: Props) {
  const { id, preview } = route.params;
  const { data, isError, refetch } = useLoad(id, preview);
  const { colors } = useTheme();
  const qc = useQueryClient();
  const subscription = useSubscription();
  const nav = useAppNavigation();
  const [busy, setBusy] = useState(false);
  const [podBusy, setPodBusy] = useState(false);
  const [showDeliverModal, setShowDeliverModal] = useState(false);
  const [deliverBusy, setDeliverBusy] = useState(false);

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
  // Driver/vehicle are locked in once the load moves past Assigned — editing
  // them mid-transit (or after delivery/invoicing/cancellation) would rewrite
  // history that's already in motion. Mirrors web's Bookings.tsx.
  const assignmentLocked = !['PENDING', 'ASSIGNED'].includes(status);
  const invoiceId = str(pick(l, ['invoice_id']));

  const stopsRaw = asArray<Record<string, unknown>>(pick(l, ['stops']));
  const stopPoints = stopsRaw
    .map((s) => ({ lat: num(pick(s, ['lat'])), lon: num(pick(s, ['lon'])) }))
    .filter((p) => p.lat && p.lon);

  const pickupLat = num(pick(l, ['pickup_lat']));
  const pickupLon = num(pick(l, ['pickup_lng']));
  const deliveryLat = num(pick(l, ['delivery_lat']));
  const deliveryLon = num(pick(l, ['delivery_lng']));
  const hasRouteCoords = !!(pickupLat && deliveryLat);

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
    // Backend requires both driver and vehicle to reach Assigned — if either
    // is missing, open the assign screen right here instead of letting the
    // PATCH 400. Confirming it also moves the status (activateOnAssign).
    if (next === 'ASSIGNED' && !(current.driverId && current.vehicleId)) {
      nav.openAssign({
        mode: 'reassign',
        loadId: id,
        vehicleType: str(pick(l, ['vehicle_type'])) || undefined,
        initialDriverId: current.driverId,
        initialVehicleId: current.vehicleId,
        activateOnAssign: true,
      });
      return;
    }
    // Give the user a chance to attach the POD right at the point of delivery
    // — but don't force it, a plain PATCH to Delivered is still valid too.
    if (next === 'DELIVERED') {
      setShowDeliverModal(true);
      return;
    }
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

  const skipAndDeliver = async () => {
    setDeliverBusy(true);
    try {
      await updateLoadStatus(id, 'DELIVERED');
      refresh();
      setShowDeliverModal(false);
      toast.success();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setDeliverBusy(false);
    }
  };

  const uploadPodAndDeliver = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    setDeliverBusy(true);
    try {
      const name = asset.fileName ?? `pod-${id}.jpg`;
      const type = asset.mimeType ?? 'image/jpeg';
      await uploadLoadPod(id, { uri: asset.uri, name, type });
      // Backend flips IN_TRANSIT -> DELIVERED as a side effect of this call.
      refresh();
      setShowDeliverModal(false);
      toast.success();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not upload POD');
    } finally {
      setDeliverBusy(false);
    }
  };

  return (
    <SheetScreen
      eyebrow="Load detail"
      title={str(pick(l, ['load_number', 'reference']), 'Load')}
      onBack={() => navigation.goBack()}
      footer={
        // Nothing to do here before the load has moved past Pending — POD and
        // invoicing both only make sense once the load is in motion.
        status === 'PENDING' ? undefined : (
          <View className="gap-2.5">
            {invoiced && invoiceId && (
              <Button
                label="See invoice"
                icon="receipt"
                variant="secondary"
                onPress={() => nav.openInvoice(invoiceId)}
                fullWidth
              />
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
        )
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
            {stopsRaw.length > 0 && (
              <View className="my-2">
                <Label className="text-faint" style={{ fontSize: 9 }}>
                  Stops ({stopsRaw.length})
                </Label>
                {stopsRaw.map((s, i) => (
                  <Txt key={i} className="mt-0.5 text-caption text-muted">
                    {i + 1}. {str(pick(s, ['location']))}
                  </Txt>
                ))}
              </View>
            )}
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

      {hasRouteCoords && (
        <View className="mb-5">
          <RouteMap
            pickup={{ lat: pickupLat, lon: pickupLon }}
            delivery={{ lat: deliveryLat, lon: deliveryLon }}
            stops={stopPoints}
          />
        </View>
      )}

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
        action={assignmentLocked ? undefined : hasAssignment ? 'Reassign' : 'Assign'}
        onAction={
          assignmentLocked
            ? undefined
            : () =>
                nav.openAssign({
                  mode: 'reassign',
                  loadId: id,
                  vehicleType: str(pick(l, ['vehicle_type'])) || undefined,
                  initialDriverId: current.driverId,
                  initialVehicleId: current.vehicleId,
                  activateOnAssign: false,
                })
        }
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

      {showDeliverModal && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowDeliverModal(false)}>
          <Pressable
            onPress={() => setShowDeliverModal(false)}
            className="flex-1 items-center justify-center bg-black/65 px-6"
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              className="w-full max-w-[420px] rounded-sm border border-line bg-surface p-5"
            >
              <Txt className="text-heading font-semibold text-fg">Mark as delivered</Txt>
              <Txt className="mb-4 mt-1.5 text-sub text-muted">
                Attach a proof of delivery now, or skip it — you can still add one later from Upload POD.
              </Txt>
              <View className="gap-2.5">
                <Button
                  label="Upload POD & set delivered"
                  icon="download"
                  loading={deliverBusy}
                  onPress={uploadPodAndDeliver}
                  fullWidth
                />
                <Button
                  label="Skip & set delivered"
                  variant="secondary"
                  loading={deliverBusy}
                  onPress={skipAndDeliver}
                  fullWidth
                />
                <Button
                  label="Cancel"
                  variant="secondary"
                  disabled={deliverBusy}
                  onPress={() => setShowDeliverModal(false)}
                  fullWidth
                />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </SheetScreen>
  );
}
