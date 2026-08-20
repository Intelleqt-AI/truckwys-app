import { useState } from 'react';
import { View, Share, Alert, Modal, Pressable } from 'react-native';
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
  TextField,
  RadioRows,
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
  useLoads,
  recordQuoteOutcome,
  deleteQuote,
  downloadQuotePdf,
  patchQuote,
} from './api';
import { AssignSheet } from './AssignSheet';
import { num, str, pick } from '@/lib/api/list';
import { invalidateFor } from '@/lib/queryInvalidation';
import { quoteShareUrl } from '@/lib/legal';
import { openWhatsApp } from '@/lib/whatsapp';
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  parseNum,
} from '@/lib/formatters';
import { toast } from '@/lib/toast';
import { useSubscription } from '@/hooks/useSubscription';
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

// Same fixed reasons the web outcome modal offers.
const REJECTION_REASONS = [
  'Price too high',
  'Went with competitor',
  'Job cancelled',
  'Other',
] as const;

const round2 = (n: number) => Math.round(n * 100) / 100;
const titleCase = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '');

export function QuoteDetailScreen({ route, navigation }: Props) {
  const subscription = useSubscription();
  const { data: loads } = useLoads();
  const { id, preview } = route.params;
  const { data, isError, refetch } = useQuote(id, preview);
  const qc = useQueryClient();
  const [sendBusy, setSendBusy] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [convertBusy, setConvertBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [outcomeType, setOutcomeType] = useState<'accepted' | 'rejected' | null>(null);
  const [outcomeBusy, setOutcomeBusy] = useState(false);
  const [finalPrice, setFinalPrice] = useState('');
  const finalPriceNum = parseNum(finalPrice);
  const finalPriceInvalid = finalPrice.trim() !== '' && finalPriceNum == null;
  const [rejectionReason, setRejectionReason] = useState('');
  const [customReason, setCustomReason] = useState('');

  if (isError && !data) return <ErrorState onRetry={refetch} message="Couldn't load this quote." />;
  const q = (data ?? {}) as Record<string, unknown>;

  const status = str(pick(q, ['status']), 'DRAFT').toUpperCase();
  const total = num(pick(q, ['total_amount', 'price']));
  const marginPct = num(pick(q, ['margin_percentage', 'margin_percent', 'margin']));
  const confidence = str(pick(q, ['confidence']));
  const roundTrip = str(pick(q, ['trip_type'])).toUpperCase() === 'ROUND_TRIP';
  const token = str(pick(q, ['token', 'view_token']));
  const shareUrl = token ? quoteShareUrl(id, token) : undefined;

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
    // formatNumber, not bare toLocaleString(): with no locale argument those
    // two fell through to the DEVICE locale, so a handset set to German
    // rendered 1234 kg as "1.234 kg".
    { label: 'Weight', value: weightKg > 0 ? `${formatNumber(weightKg)} kg` : '' },
    { label: 'Distance', value: distanceKm > 0 ? `${formatNumber(Math.round(distanceKm))} km` : '' },
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
  // The quote row carries its load once converted; fall back to scanning loads
  // by their `quote` back-reference, which is what the web list keys on.
  const convertedFromQuote = pick(q, ['load_id', 'load', 'booking_id']);
  const convertedLoadId =
    convertedFromQuote != null
      ? (convertedFromQuote as string | number)
      : ((loads ?? []).find((l) => String(pick(l.raw ?? {}, ['quote']) ?? '') === String(id))?.id ??
        null);
  const outcome = str(pick(q, ['outcome'])).toLowerCase();
  // Web only offers won/lost capture while the quote is still open.
  const canRecordOutcome = !outcome && ['SENT', 'DRAFT'].includes(status);

  const refresh = () => invalidateFor(qc, 'quote');

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
      refresh();
      toast.success(okMsg);
      if (back) navigation.goBack();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setFlag(false);
    }
  };

  // Send offers Email or WhatsApp rather than emailing immediately. WhatsApp
  // needs the public link, which send_to_customer is what mints — so an unsent
  // quote is sent first, then handed off.
  const sendViaEmail = () => {
    setSendOpen(false);
    void run(setSendBusy, () => sendQuote(id), 'Quote emailed to client');
  };

  const sendViaWhatsApp = async () => {
    setSendOpen(false);
    setSendBusy(true);
    try {
      let link = shareUrl;
      if (!link) {
        const res = await sendQuote(id);
        refresh();
        // send_to_customer returns share_url; rewrite it onto our own host so
        // the link always points at this environment (the backend's
        // FRONTEND_URL may be pinned to production), mirroring the web app.
        const returned = str(pick(res, ['share_url', 'url']));
        const tok = str(pick(res, ['token', 'view_token']));
        if (tok) link = quoteShareUrl(id, tok);
        else if (returned) {
          const tail = returned.split('/quotes/view/')[1];
          link = tail ? quoteShareUrl(id, tail.split('/').pop() ?? '') : returned;
        }
      }
      const ref = str(pick(q, ['quote_number']));
      const name = str(pick(q, ['customer_name', 'customer']));
      const message = [
        `Hi${name ? ` ${name}` : ''}, here's your freight quote${ref ? ` (${ref})` : ''} from Truckwys`,
        total > 0 ? formatCurrency(total) : '',
        link ?? '',
      ]
        .filter(Boolean)
        .join(' · ');
      await openWhatsApp(str(pick(q, ['customer_phone'])), message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not open WhatsApp');
    } finally {
      setSendBusy(false);
    }
  };

  const convert = async (driverId: string, vehicleId: string) => {
    setConvertBusy(true);
    try {
      const created = await convertQuoteToLoad(id, { driver_id: driverId, vehicle_id: vehicleId });
      // The new load lands in Orders, and the chosen vehicle/driver are no
      // longer "available".
      invalidateFor(qc, 'quote', 'load');
      setShowAssign(false);
      toast.success(driverId && vehicleId ? 'Converted and assigned' : 'Converted to booking');
      // The quote is now a booking — replace rather than stack, matching web.
      const loadId = pick((created ?? {}) as Record<string, unknown>, ['id', 'load_id', 'pk']);
      if (loadId != null) navigation.replace('LoadDetail', { id: loadId as string | number });
      else navigation.goBack();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not convert quote');
    } finally {
      setConvertBusy(false);
    }
  };

  const closeOutcome = () => {
    setOutcomeType(null);
    setFinalPrice('');
    setRejectionReason('');
    setCustomReason('');
  };

  const reasonText = rejectionReason === 'Other' ? customReason.trim() : rejectionReason;
  const canSubmitOutcome =
    outcomeType === 'accepted' ? !finalPriceInvalid : !!reasonText;

  const submitOutcome = () => {
    if (!outcomeType || !canSubmitOutcome) return;
    const payload =
      outcomeType === 'accepted'
        ? {
            outcome: 'accepted' as const,
            // Blank is legitimate here ("keep the quoted total"), but an
            // unparseable value is not — Number() silently dropped it and closed
            // the quote at the old total.
            ...(finalPriceNum != null && finalPriceNum > 0 ? { final_price: finalPriceNum } : {}),
          }
        : { outcome: 'rejected' as const, rejection_reason: reasonText };
    run(
      setOutcomeBusy,
      async () => {
        await recordQuoteOutcome(id, payload);
        closeOutcome();
      },
      outcomeType === 'accepted' ? 'Marked as won' : 'Marked as lost',
    );
  };

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
          <Button label="Send" icon="send" loading={sendBusy} onPress={() => setSendOpen(true)} fullWidth />
        </View>
      </View>
      {canRecordOutcome && (
        <View className="flex-row gap-2.5">
          <View className="flex-1">
            <Button
              label="Mark accepted"
              icon="checkCircle"
              variant="secondary"
              onPress={() => setOutcomeType('accepted')}
              fullWidth
            />
          </View>
          <View className="flex-1">
            <Button
              label="Mark rejected"
              icon="x"
              variant="secondary"
              onPress={() => setOutcomeType('rejected')}
              fullWidth
            />
          </View>
        </View>
      )}
      {/* A quote converts to at most one load — convert_to_load rejects a
          second attempt — so once it has, offer the booking instead of a button
          that can only fail. */}
      {accepted && convertedLoadId != null && (
        <Button
          label="View booking"
          icon="arrowRight"
          variant="secondary"
          onPress={() => navigation.navigate('LoadDetail', { id: convertedLoadId })}
          fullWidth
        />
      )}
      {accepted && convertedLoadId == null && (
        <Button
          label="Convert to booking"
          icon="arrowRight"
          loading={convertBusy}
          disabled={subscription.blocked}
          onPress={() => setShowAssign(true)}
          fullWidth
        />
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
        {outcome === 'accepted' && <Badge label="✓ Won" tone="success" />}
        {outcome === 'rejected' && <Badge label="✗ Lost" tone="danger" />}
        <Badge label={roundTrip ? 'Round trip' : 'One way'} tone={roundTrip ? 'info' : 'neutral'} />
        {marginPct > 0 && (
          <Mono className="text-micro text-faint">Margin {formatPercent(marginPct)}</Mono>
        )}
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
            Margin <Mono className="text-warning">{formatPercent(marginPct)}</Mono> is below your pricing guardrail — review
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
        <DetailRow label="Margin" value={formatPercent(marginPct || 0)} />
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

      {showAssign && (
        <AssignSheet
          mode="convert"
          reference={str(pick(q, ['quote_number']))}
          vehicleType={str(pick(q, ['vehicle_type'])) || undefined}
          busy={convertBusy}
          onConfirm={convert}
          onCancel={() => setShowAssign(false)}
        />
      )}

      {sendOpen && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setSendOpen(false)}>
          <Pressable
            onPress={() => setSendOpen(false)}
            className="flex-1 items-center justify-center bg-black/65 px-6"
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              className="w-full max-w-[420px] rounded-sm border border-line bg-surface p-5"
            >
              <Txt className="text-heading font-semibold text-fg">Send quote</Txt>
              <Txt className="mb-4 mt-1.5 text-sub text-muted">
                {str(pick(q, ['customer_name', 'customer']), 'the customer')}
              </Txt>
              <View className="gap-2.5">
                <Button label="Email" icon="send" onPress={sendViaEmail} fullWidth />
                <Button
                  label="WhatsApp"
                  icon="share"
                  variant="secondary"
                  onPress={sendViaWhatsApp}
                  fullWidth
                />
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => setSendOpen(false)}
                  fullWidth
                />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {outcomeType && (
        <Modal visible transparent animationType="fade" onRequestClose={closeOutcome}>
          <Pressable
            onPress={closeOutcome}
            className="flex-1 items-center justify-center bg-black/65 px-6"
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              className="w-full max-w-[420px] rounded-sm border border-line bg-surface p-5"
            >
              <Txt className="text-heading font-semibold text-fg">
                {outcomeType === 'accepted' ? 'Mark quote as accepted' : 'Mark quote as rejected'}
              </Txt>

              {outcomeType === 'accepted' ? (
                <View className="mt-4">
                  <TextField
                    label="Final agreed price (optional)"
                    placeholder={formatNumber(total, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    prefix="R"
                    keyboardType="decimal-pad"
                    numeric
                    decimals={2}
                    error={finalPriceInvalid ? 'Enter a number, e.g. 12 500,00' : undefined}
                    value={finalPrice}
                    onChangeText={setFinalPrice}
                  />
                  <Txt className="mt-1.5 text-caption text-faint">
                    Leave blank to keep the quoted {formatCurrency(total)}.
                  </Txt>
                </View>
              ) : (
                <View className="mt-4 gap-3.5">
                  {/* Inline rows, not a SelectField — its picker is itself a
                      Modal, and nesting Modals is unreliable on iOS. */}
                  <RadioRows
                    label="Reason"
                    options={REJECTION_REASONS.map((r) => ({ label: r, value: r }))}
                    value={rejectionReason}
                    onSelect={setRejectionReason}
                  />
                  {rejectionReason === 'Other' && (
                    <TextField
                      label="Please specify"
                      placeholder="Why was this quote lost?"
                      value={customReason}
                      onChangeText={setCustomReason}
                    />
                  )}
                </View>
              )}

              <View className="mt-5 flex-row gap-2.5">
                <View className="flex-1">
                  <Button label="Cancel" variant="secondary" onPress={closeOutcome} fullWidth />
                </View>
                <View className="flex-1">
                  <Button
                    label={outcomeType === 'accepted' ? 'Mark accepted' : 'Mark rejected'}
                    variant={outcomeType === 'accepted' ? 'primary' : 'danger'}
                    loading={outcomeBusy}
                    disabled={!canSubmitOutcome}
                    onPress={submitOutcome}
                    fullWidth
                  />
                </View>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </SheetScreen>
  );
}
