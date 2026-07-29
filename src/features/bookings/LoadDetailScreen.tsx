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
  Button,
  Icon,
  Txt,
  Mono,
  Label,
} from '@/components/ui';
import { ErrorState } from '@/components/feedback';
import { useLoad, updateLoadStatus, convertLoadToInvoice, uploadLoadPod, assignLoadDriver } from './api';
import { AssignSheet, assignedIds } from './AssignSheet';
import { LOAD_STEPS, VALID_TRANSITIONS, STATUS_LABEL } from './constants';
import { num, str, pick } from '@/lib/api/list';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { useTheme } from '@/theme/ThemeProvider';
import { toast } from '@/lib/toast';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'LoadDetail'>;

export function LoadDetailScreen({ route, navigation }: Props) {
  const { id, preview } = route.params;
  const { data, isError, refetch } = useLoad(id, preview);
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [podBusy, setPodBusy] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [assignBusy, setAssignBusy] = useState(false);

  if (isError && !data) return <ErrorState onRetry={refetch} message="Couldn't load this booking." />;
  const l = (data ?? {}) as Record<string, unknown>;

  const status = str(pick(l, ['status']), 'PENDING').toUpperCase();
  const idx = LOAD_STEPS.indexOf((status === 'CANCELLED' ? 'PENDING' : status) as never);
  const transitions = VALID_TRANSITIONS[status] ?? [];
  const rate = num(pick(l, ['rate']));
  const distance = num(pick(l, ['distance']));
  const total = num(pick(l, ['total_amount']));
  const ratePerKm = distance ? (rate / distance).toFixed(2) : '0.00';
  const invoiced = status === 'INVOICED' || !!pick(l, ['invoice_id', 'invoice']);
  const hasPod = !!pick(l, ['pod_signature', 'pod_received_by', 'pod_document']);
  const current = assignedIds(l);
  const hasAssignment = !!(current.driverId || current.vehicleId);

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['load', id] }),
      qc.invalidateQueries({ queryKey: ['loads'] }),
    ]);

  const doStatus = async (next: string) => {
    setBusy(true);
    try {
      await updateLoadStatus(id, next);
      await refresh();
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
      await refresh();
      toast.success();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create invoice');
    } finally {
      setBusy(false);
    }
  };

  const submitAssign = async (driverId: string, vehicleId: string) => {
    setAssignBusy(true);
    try {
      await assignLoadDriver(id, driverId ? Number(driverId) : null, vehicleId ? Number(vehicleId) : null);
      await Promise.all([
        refresh(),
        // Availability changed for whoever was picked up or released.
        qc.invalidateQueries({ queryKey: ['drivers-available-for-assign'] }),
        qc.invalidateQueries({ queryKey: ['vehicles-available-for-assign'] }),
      ]);
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
      await refresh();
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

      {/* Progress stepper — cumulative fill + glowing active dot */}
      <View className="mb-5 rounded-xs border border-line bg-surface px-3 py-4">
        <View className="flex-row items-center">
          {LOAD_STEPS.map((step, i) => {
            const past = i <= idx;
            const current = i === idx;
            return (
              <View key={step} className="flex-1 flex-row items-center">
                {i > 0 && (
                  <View
                    style={{
                      flex: 1,
                      height: 3,
                      borderRadius: 3,
                      marginBottom: 16,
                      backgroundColor: past ? colors.accent : colors.line,
                    }}
                  />
                )}
                <View className="items-center" style={{ width: 56, gap: 6 }}>
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: current ? 'rgba(77,158,255,0.22)' : 'transparent',
                    }}
                  >
                    <View
                      style={{
                        width: current ? 12 : 10,
                        height: current ? 12 : 10,
                        borderRadius: 6,
                        backgroundColor: past ? colors.accent : colors.line,
                      }}
                    />
                  </View>
                  <Mono
                    className="text-center uppercase"
                    style={{
                      fontSize: 8.5,
                      letterSpacing: 0.4,
                      lineHeight: 11,
                      fontWeight: current ? '700' : '500',
                      color: past ? colors.accent : colors.faint,
                    }}
                  >
                    {step.replace(/_/g, ' ')}
                  </Mono>
                </View>
              </View>
            );
          })}
        </View>
      </View>

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
        <View style={{ width: '47.5%' }}>
          <StatCard label="Total amount" value={formatCurrency(total, { maximumFractionDigits: 0 })} />
        </View>
        <View style={{ width: '47.5%' }}>
          <StatCard label="Distance" value={`${distance} km`} />
        </View>
        <View style={{ width: '47.5%' }}>
          <StatCard label="Weight" value={`${(num(pick(l, ['weight'])) / 1000).toFixed(0)} t`} />
        </View>
        <View style={{ width: '47.5%' }}>
          <StatCard label="Rate / km" value={`R ${ratePerKm}`} />
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
