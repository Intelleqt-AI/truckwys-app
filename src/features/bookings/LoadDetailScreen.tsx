import { useState } from 'react';
import { View, Alert, Modal, TouchableOpacity, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
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
  Banner,
  Card,
} from '@/components/ui';
import { ErrorState, DetailSkeleton, NotFoundState } from '@/components/feedback';
import { RouteMap } from '@/components/RouteMap';
import { useLoad, updateLoadStatus, uploadLoadPod, seedLoad } from './api';
import { assignedIds } from './AssignDriverVehicleScreen';
import { useSubscription } from '@/hooks/useSubscription';
import { LOAD_STEPS, VALID_TRANSITIONS, STATUS_LABEL, stepIndexFor } from './constants';
import { num, str, pick, asArray } from '@/lib/api/list';
import { mediaUrl } from '@/lib/api/client';
import { invalidateFor } from '@/lib/queryInvalidation';
import { formatCurrency, formatDate, formatNumber } from '@/lib/formatters';
import type { CustomerPrice } from '@/lib/vat';
import { invoiceDisplayNumber } from '@/lib/invoiceStatus';
import { staleWork, staleLabel, staleAction } from '@/lib/staleWork';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { toast } from '@/lib/toast';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'LoadDetail'>;

export function LoadDetailScreen({ route, navigation }: Props) {
  const { id, preview, title } = route.params;
  const { data, error, isError, isPending, refetch } = useLoad(id, preview);
  const { colors } = useTheme();
  const qc = useQueryClient();
  const subscription = useSubscription();
  const nav = useAppNavigation();
  const [busy, setBusy] = useState(false);
  const [podBusy, setPodBusy] = useState(false);
  const [showDeliverModal, setShowDeliverModal] = useState(false);
  const [showPodPreview, setShowPodPreview] = useState(false);
  const [deliverBusy, setDeliverBusy] = useState(false);
  const [uploadDeliverBusy, setUploadDeliverBusy] = useState(false);

  // A 404 means the load was deleted or moved, which retrying can't fix.
  if (isError && !data && (error as { status?: number } | null)?.status === 404) {
    return (
      <SheetScreen title="Load" onBack={() => navigation.goBack()}>
        <NotFoundState what="Load" onBack={() => navigation.goBack()} />
      </SheetScreen>
    );
  }
  if (isError && !data) return <ErrorState onRetry={refetch} message="Couldn't load this booking." />;
  // Nothing cached and no list-row preview (e.g. opened from a notification):
  // say it's loading rather than rendering a zeroed "PENDING / Unassigned" load.
  if (isPending && !data) {
    return (
      <SheetScreen title={title ?? 'Load'} onBack={() => navigation.goBack()}>
        <DetailSkeleton />
      </SheetScreen>
    );
  }
  const l =(data ?? {}) as Record<string, unknown>;

  const status = str(pick(l, ['status']), 'PENDING').toUpperCase();
  const idx = stepIndexFor(status);
  const transitions = VALID_TRANSITIONS[status] ?? [];
  const rate = num(pick(l, ['rate']));
  const distance = num(pick(l, ['distance']));
  const total = num(pick(l, ['total_amount']));
  // Price excl. VAT, VAT and total incl. VAT as the customer is shown them (same
  // rule as the quote it came from: 15%, or 0% international; backend quote_vat).
  const rawPrice = pick(l, ['customer_price']);
  const customerPrice =
    rawPrice && typeof rawPrice === 'object' && !Array.isArray(rawPrice)
      ? (rawPrice as CustomerPrice)
      : undefined;
  const vatShown = !!customerPrice?.vat_registered;
  const ratePerKm = distance ? rate / distance : 0;
  const fuelSurcharge = num(pick(l, ['fuel_surcharge']));
  const additional = num(pick(l, ['additional_charges', 'additional']));
  // The lines shown must add up to the total. When the stored total carries
  // charges that were never broken down on this order, say so in one line
  // instead of leaving a silent gap.
  const notItemised = Math.round((total - (rate + fuelSurcharge + additional)) * 100) / 100;
  // What fuel was expected to cost (the quote's fuel line) against what was
  // spent (approved FUEL expenses logged on this order's trips). Null when
  // there is no such figure; the block hides itself when both are null.
  const fuelEst = pick(l, ['fuel_cost_estimated']) != null ? num(pick(l, ['fuel_cost_estimated'])) : null;
  const fuelAct = pick(l, ['fuel_cost_actual']) != null ? num(pick(l, ['fuel_cost_actual'])) : null;
  const fuelDiff = fuelEst != null && fuelAct != null ? Math.round((fuelAct - fuelEst) * 100) / 100 : null;
  // Open too long, or past its delivery date: not current work.
  const stale = staleWork({
    status,
    delivery_date: str(pick(l, ['delivery_date'])) || null,
    pickup_date: str(pick(l, ['pickup_date'])) || null,
    created_at: str(pick(l, ['created_at'])) || null,
  });
  const invoiced = status === 'INVOICED' || !!pick(l, ['invoice_id', 'invoice']);
  const hasPod = !!pick(l, ['pod_signature', 'pod_received_by', 'pod_document']);
  const podDocumentUrl = str(pick(l, ['pod_document']));
  const podReceivedBy = str(pick(l, ['pod_received_by']));
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

  // Real road-path polyline, carried over from the source quote on convert —
  // older loads (converted before this field existed) fall back to RouteMap's
  // dashed line.
  const routeGeometry = asArray<Record<string, unknown>>(pick(l, ['route_geometry']))
    .map((p) => ({ lat: num(pick(p, ['lat'])), lon: num(pick(p, ['lon'])) }))
    .filter((p) => p.lat && p.lon);

  const pickupLat = num(pick(l, ['pickup_lat']));
  const pickupLon = num(pick(l, ['pickup_lng']));
  const deliveryLat = num(pick(l, ['delivery_lat']));
  const deliveryLon = num(pick(l, ['delivery_lng']));
  const hasRouteCoords = !!(pickupLat && deliveryLat);

  // Each stage shows the one real fact the API actually records for it — the
  // Load model only has `created_at` and `actual_delivered_at` as genuine
  // per-stage timestamps, so nothing here is a guessed date.
  // A status with no further transitions (e.g. INVOICED) is a dead end — render
  // its own step as done (checkmark) instead of "current" (which would leave it
  // permanently showing a hollow ring + pulsing halo with nothing left to do).
  const isTerminal = transitions.length === 0;
  const timelineSteps: TimelineStep[] = LOAD_STEPS.map((step, i) => {
    const base = {
      label: STATUS_LABEL(step),
      done: i < idx || (isTerminal && i === idx),
      current: !isTerminal && i === idx,
      color: colors.accent,
    };
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
        // A draft invoice carries a placeholder number until it is sent.
        const invoiceNumber = invoiceDisplayNumber({ invoice_number: pick(l, ['invoice_number', 'invoice']) }, '');
        return {
          ...base,
          meta: invoiceNumber === 'Draft' ? 'Invoice drafted' : invoiceNumber ? `Invoice ${invoiceNumber}` : undefined,
        };
      }
      default:
        return base;
    }
  });
  // The API doesn't record how far a cancelled load got, so the honest thing
  // is to leave every stage muted (idx is -1) and cap the list with its own
  // terminal row, rather than guessing which stage it was cancelled from.
  if (status === 'CANCELLED') {
    timelineSteps.push({ label: 'Cancelled', done: true, current: false, color: colors.dangerDot });
  }

  const refresh = () => invalidateFor(qc, 'load');

  const doStatus = async (next: string) => {
    if (subscription.blocked) return toast.error(subscription.notice ?? 'Subscription inactive');
    setBusy(true);
    try {
      seedLoad(qc, await updateLoadStatus(id, next), id);
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
    // Backend requires a vehicle to reach Assigned — driver is optional. If
    // the vehicle is missing, open the assign screen right here instead of
    // letting the PATCH 400. Confirming it also moves the status
    // (activateOnAssign). Mirrors web's Bookings.tsx (vehicle-only check).
    if (next === 'ASSIGNED' && !current.vehicleId) {
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
      // seedLoad ignores the response unless it is a load record.
      seedLoad(qc, await uploadLoadPod(id, { uri: asset.uri, name, type }), id);
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
      seedLoad(qc, await updateLoadStatus(id, 'DELIVERED'), id);
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
    setUploadDeliverBusy(true);
    try {
      const name = asset.fileName ?? `pod-${id}.jpg`;
      const type = asset.mimeType ?? 'image/jpeg';
      seedLoad(qc, await uploadLoadPod(id, { uri: asset.uri, name, type }), id);
      // Backend flips IN_TRANSIT -> DELIVERED as a side effect of this call.
      refresh();
      setShowDeliverModal(false);
      toast.success();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not upload POD');
    } finally {
      setUploadDeliverBusy(false);
    }
  };

  return (
    <SheetScreen
      title={str(pick(l, ['load_number', 'reference']), 'Load')}
      onBack={() => navigation.goBack()}
      footer={
        // Nothing to do here before the load has moved past Pending — POD and
        // invoicing both only make sense once the load is in motion.
        status === 'PENDING' ? undefined : (
          <View className="gap-2.5">
            {invoiced && invoiceId && (
              <Button
                label="View invoice"
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
              onPress={hasPod ? () => setShowPodPreview(true) : uploadPod}
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

      {/* Stale work is never shown as current: say how long and what to do. */}
      {stale && (
        <View className="mb-5">
          <Banner
            tone="warning"
            message={`Still ${STATUS_LABEL(status).toLowerCase()}, ${
              stale.overdue ? `${staleLabel(stale).days} past its delivery date` : `open ${staleLabel(stale).text}`
            }. ${staleAction({ status })}.`}
          />
        </View>
      )}

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
          <StatCard
            label={vatShown ? 'Total incl. VAT' : 'Total amount'}
            value={formatCurrency(vatShown ? num(customerPrice?.total_incl_vat) : total, {
              maximumFractionDigits: 0,
            })}
          />
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
      <Card className="mb-5 p-4">
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
            <Icon name="pin" size={16} color={colors.successDot} />
          </View>
          <View className="flex-1">
            <Label className="text-faint">
              Pickup · {formatDate(str(pick(l, ['pickup_date'])))}
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
                <Label className="text-faint">
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
            <Label className="text-faint">
              Delivery · {formatDate(str(pick(l, ['delivery_date'])))}
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
      </Card>

      {hasRouteCoords && (
        <View className="mb-5">
          <RouteMap
            pickup={{ lat: pickupLat, lon: pickupLon }}
            delivery={{ lat: deliveryLat, lon: deliveryLon }}
            stops={stopPoints}
            geometry={routeGeometry.length > 1 ? routeGeometry : undefined}
          />
        </View>
      )}

      {/* Financials */}
      <Group label="Financials">
        {/* The per-km figure is a rate, not a summand, so it sits under Base
            rate as a note rather than among the lines that add up. */}
        <DetailRow
          label="Base rate"
          hint={ratePerKm > 0 ? `${formatCurrency(ratePerKm)}/km` : undefined}
          value={formatCurrency(rate)}
        />
        <DetailRow label="Fuel surcharge" value={formatCurrency(fuelSurcharge)} />
        <DetailRow label="Additional charges" value={formatCurrency(additional)} />
        {Math.abs(notItemised) > 0.5 && (
          <DetailRow
            label="Not itemised"
            hint={
              str(pick(l, ['quote_number']))
                ? `The total includes charges not broken down here. Quote ${str(pick(l, ['quote_number']))} has the full breakdown.`
                : 'The total includes charges that were not entered as separate lines.'
            }
            value={formatCurrency(notItemised)}
          />
        )}
        <View className="flex-row items-center justify-between bg-surface-hover px-3.5 py-3.5">
          <Txt className="text-callout font-semibold text-fg">{vatShown ? 'Total excl. VAT' : 'Total'}</Txt>
          <Mono className="text-heading font-semibold text-fg">{formatCurrency(total)}</Mono>
        </View>
        {vatShown ? (
          <>
            <DetailRow
              label={customerPrice?.vat_label || 'VAT'}
              value={formatCurrency(num(customerPrice?.vat_amount))}
            />
            <View className="flex-row items-center justify-between bg-surface-hover px-3.5 py-3.5">
              <Txt className="text-callout font-semibold text-fg">Total incl. VAT</Txt>
              <Mono className="text-heading font-semibold text-fg">
                {formatCurrency(num(customerPrice?.total_incl_vat))}
              </Mono>
            </View>
          </>
        ) : null}
      </Group>

      {(fuelEst != null || fuelAct != null) && (
        <Group label="Fuel cost">
          <DetailRow
            label="Estimated"
            hint="The fuel line of the quote this order came from"
            value={fuelEst != null ? formatCurrency(fuelEst) : 'Not recorded'}
          />
          <DetailRow
            label="Actual"
            hint="Approved fuel expenses logged on this order's trips"
            value={fuelAct != null ? formatCurrency(fuelAct) : 'Not recorded'}
            last={fuelDiff == null || Math.abs(fuelDiff) < 0.5}
          />
          {fuelDiff != null && Math.abs(fuelDiff) >= 0.5 && (
            <DetailRow
              label="Difference"
              value={fuelDiff > 0 ? `${formatCurrency(fuelDiff)} over` : `${formatCurrency(-fuelDiff)} under`}
              valueColor={fuelDiff > 0 ? colors.danger : undefined}
              last
            />
          )}
        </Group>
      )}

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
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setShowDeliverModal(false)}
            className="flex-1 items-center justify-center bg-backdrop px-6"
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => {}}
              className="w-full max-w-[420px] rounded-panel border border-line bg-surface p-5"
            >
              <Txt className="text-heading font-semibold text-fg">Proof of delivery</Txt>
              <Txt className="mb-4 mt-1.5 text-sub text-muted">
                Attach a proof of delivery now, or skip it. You can still add one later from Upload POD.
              </Txt>
              <View className="gap-2.5">
                <Button
                  label="Upload POD and mark delivered"
                  icon="download"
                  loading={uploadDeliverBusy}
                  disabled={deliverBusy}
                  onPress={uploadPodAndDeliver}
                  fullWidth
                />
                <Button
                  label="Skip and mark delivered"
                  variant="secondary"
                  loading={deliverBusy}
                  disabled={uploadDeliverBusy}
                  onPress={skipAndDeliver}
                  fullWidth
                />
                <Button
                  label="Cancel"
                  variant="secondary"
                  disabled={deliverBusy || uploadDeliverBusy}
                  onPress={() => setShowDeliverModal(false)}
                  fullWidth
                />
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {showPodPreview && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowPodPreview(false)}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setShowPodPreview(false)}
            className="flex-1 items-center justify-center bg-backdrop px-6"
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => {}}
              className="w-full max-w-[420px] rounded-panel border border-line bg-surface p-5"
            >
              <Txt className="text-heading font-semibold text-fg">Proof of delivery</Txt>
              <Txt className="mb-4 mt-1.5 text-sub text-muted">{podReceivedBy || 'Received'}</Txt>
              {podDocumentUrl ? (
                /\.pdf($|\?)/i.test(podDocumentUrl) ? (
                  <View className="mb-4">
                    <Txt className="mb-3 text-sub text-muted">PDF document attached.</Txt>
                    <Button
                      label="Open PDF"
                      icon="download"
                      variant="secondary"
                      onPress={() => WebBrowser.openBrowserAsync(mediaUrl(podDocumentUrl)!)}
                      fullWidth
                    />
                  </View>
                ) : (
                  <Image
                    source={{ uri: mediaUrl(podDocumentUrl) }}
                    style={{ width: '100%', aspectRatio: 1.2, borderRadius: radius.control, marginBottom: 16 }}
                    resizeMode="contain"
                  />
                )
              ) : (
                <Txt className="mb-4 text-sub text-muted">
                  No document file was attached. Only a receipt name is on record.
                </Txt>
              )}
              <View className="gap-2.5">
                <Button
                  label="Replace"
                  variant="secondary"
                  onPress={() => {
                    setShowPodPreview(false);
                    uploadPod();
                  }}
                  fullWidth
                />
                <Button
                  label="Close"
                  variant="secondary"
                  onPress={() => setShowPodPreview(false)}
                  fullWidth
                />
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
    </SheetScreen>
  );
}
