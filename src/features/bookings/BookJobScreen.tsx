import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fetchAllRows } from '@/lib/api/fetchAllPages';
import {
  SheetScreen,
  SelectField,
  DateField,
  RadioRows,
  Group,
  Banner,
  Button,
  Txt,
  Mono,
  type Option,
} from '@/components/ui';
import { str, pick } from '@/lib/api/list';
import { convertQuoteToLoad, linkReturnLoad, seedLoad, useBookingPreview, useQuote } from './api';
import {
  bookErrorText,
  bookingBodyFor,
  candidateSub,
  candidateTitle,
  type ReturnChoice,
  marginCardView,
  parseBooking,
  parseEconomics,
  parseWarnings,
  partnerLeg,
  type BookingResult,
  type Candidate,
  type CandidateDirection,
} from './trip/economics';
import { CandidateRow, InvoicePreviewGroup, TripMarginCard } from './trip/TripUi';
import { invalidateFor } from '@/lib/queryInvalidation';
import { toast } from '@/lib/toast';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'BookJob'>;

interface DriverOption {
  id: number | string;
  user_details?: { name?: string; username?: string };
}

interface VehicleOption {
  id: number | string;
  make?: string;
  model?: string;
  plate?: string;
}

const dateOnly = (v: unknown) => /^\d{4}-\d{2}-\d{2}/.exec(str(v))?.[0] ?? '';

/**
 * One-tap booking: an accepted quote becomes a job. Truck, driver and dates
 * are optional; once booked the sheet shows the invoice delivery will raise
 * and any loads that could pair with this one as a return trip.
 */
export function BookJobScreen({ route, navigation }: Props) {
  const { quoteId, reference, vehicleType, popCallerOnSuccess } = route.params;
  const qc = useQueryClient();
  const { data: quote } = useQuote(quoteId);
  const q = (quote ?? {}) as Record<string, unknown>;
  const oneWay = str(pick(q, ['trip_type']), 'ONE_WAY').toUpperCase() !== 'ROUND_TRIP';

  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  // Undefined until touched: the quote's own dates show (and are sent) until then.
  const [pickupDate, setPickupDate] = useState<string | undefined>();
  const [deliveryDate, setDeliveryDate] = useState<string | undefined>();
  const [choice, setChoice] = useState<ReturnChoice>('empty');
  const [busy, setBusy] = useState(false);
  // Synchronous guards: a second tap lands before `busy` re-renders.
  const bookingRef = useRef(false);
  const linkingRef = useRef(false);
  const [result, setResult] = useState<BookingResult | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [linkedId, setLinkedId] = useState<string | null>(null);

  const pickupShown = pickupDate ?? dateOnly(pick(q, ['pickup_date']));
  const deliveryShown = deliveryDate ?? dateOnly(pick(q, ['delivery_date']));
  const datesOutOfOrder = !!pickupShown && !!deliveryShown && deliveryShown < pickupShown;
  // What booking would give, before booking (newer backends; null otherwise).
  const { data: preview } = useBookingPreview(quoteId, pickupShown, deliveryShown);
  const alreadyBookedId = preview && !preview.preview ? preview.loadId : null;

  const { data: driversRaw, isLoading: driversLoading } = useQuery({
    queryKey: ['drivers-available-for-assign'],
    queryFn: () => fetchAllRows<DriverOption>('drivers/?status=ACTIVE'),
  });
  const { data: vehiclesRaw, isLoading: vehiclesLoading } = useQuery({
    queryKey: ['vehicles-available-for-assign', vehicleType ?? ''],
    queryFn: () =>
      fetchAllRows<VehicleOption>(
        `vehicles/?status=AVAILABLE${vehicleType ? `&vehicle_type__name=${encodeURIComponent(vehicleType)}` : ''}`,
      ),
  });

  const driverOptions: Option[] = useMemo(
    () => [
      { label: 'Assign later', value: '' },
      ...(driversRaw ?? []).map((d) => ({
        label: d.user_details?.name || d.user_details?.username || `Driver #${d.id}`,
        value: String(d.id),
      })),
    ],
    [driversRaw],
  );
  const vehicleOptions: Option[] = useMemo(
    () => [
      { label: 'Assign later', value: '' },
      ...(vehiclesRaw ?? []).map((v) => {
        const name = [v.make, v.model].filter(Boolean).join(' ');
        return { label: `${name || 'Truck'}${v.plate ? ` · ${v.plate}` : ` #${v.id}`}`, value: String(v.id) };
      }),
    ],
    [vehiclesRaw],
  );
  const noDrivers = !driversLoading && driverOptions.length === 1;
  const noVehicles = !vehiclesLoading && vehicleOptions.length === 1;

  const driverWithoutTruck = !!driverId && !vehicleId;

  // Back empty / expecting one, then the suggested loads (best first, 3 each).
  const returnOptions = useMemo(() => {
    const opts: { label: string; value: string; sub?: string }[] = [
      { label: 'Back empty', value: 'empty' },
      {
        label: 'Expecting a return load',
        value: 'expect',
        sub: preview ? undefined : 'Loads near the drop are suggested once it is booked',
      },
    ];
    for (const c of preview?.returnCandidates.slice(0, 3) ?? []) {
      const sub = candidateSub(c, 'return');
      opts.push({ label: `Back with ${candidateTitle(c)}`, value: `ret:${c.loadId}`, sub: [c.loadNumber, sub].filter(Boolean).join(' · ') });
    }
    for (const c of preview?.outboundCandidates.slice(0, 3) ?? []) {
      const sub = candidateSub(c, 'outbound');
      opts.push({ label: `Return of ${candidateTitle(c)}`, value: `out:${c.loadId}`, sub: [c.loadNumber, sub].filter(Boolean).join(' · ') });
    }
    return opts;
  }, [preview]);
  // A suggestion that dropped off a refreshed preview falls back to Back empty.
  const choiceShown = returnOptions.some((o) => o.value === choice) ? choice : 'empty';
  const canBook = !busy && !driverWithoutTruck && !datesOutOfOrder && preview?.canBook !== false;

  const openJob = (id: number | string, title?: string) => {
    navigation.pop(popCallerOnSuccess ? 2 : 1);
    navigation.navigate('LoadDetail', { id, title: title || undefined });
  };

  const book = async () => {
    if (!canBook || bookingRef.current) return;
    bookingRef.current = true;
    setBusy(true);
    try {
      // One call: the link is made with the booking. Only a backend whose
      // preview predates link_fields gets a follow-up link-return call.
      const { linkReturnId, ...returnBody } = oneWay
        ? bookingBodyFor(choiceShown, preview?.linksInOneCall ?? false)
        : {};
      const body = await convertQuoteToLoad(quoteId, {
        ...(vehicleId ? { vehicle_id: vehicleId } : {}),
        ...(driverId ? { driver_id: driverId } : {}),
        ...(pickupDate ? { pickup_date: pickupDate } : {}),
        ...(deliveryDate ? { delivery_date: deliveryDate } : {}),
        ...returnBody,
      });
      const booked = parseBooking(body);
      seedLoad(qc, body, booked.loadId ?? undefined);
      invalidateFor(qc, 'quote', 'load');
      // The quote is booked now: its preview (candidates, "already booked") is stale.
      void qc.invalidateQueries({ queryKey: ['booking-preview'] });
      if (booked.loadId == null) throw new Error("Couldn't book this job. Try again.");
      if (preview) {
        // Everything was chosen up front: straight to the job.
        let note: string | null = booked.returnLink?.error ?? booked.returnLink?.warnings[0]?.title ?? null;
        if (linkReturnId) {
          try {
            const res = await linkReturnLoad(booked.loadId, linkReturnId);
            note = parseWarnings((res ?? {}).warnings)[0]?.title ?? note;
            invalidateFor(qc, 'load');
          } catch (e) {
            note = e instanceof Error ? `Booked. ${e.message}` : "Booked. The return load couldn't be linked.";
          }
        }
        if (booked.alreadyConverted) toast.info(`Already booked as ${booked.loadNumber || 'a job'}`);
        else if (note) toast.info(note.startsWith('Booked') ? note : `Booked. ${note}`);
        else toast.success('Booked');
        openJob(booked.loadId, booked.loadNumber);
        return;
      }
      if (!booked.hasBooking) {
        // Older backend: no booking block to show, straight to the job.
        toast.success('Booked');
        openJob(booked.loadId, booked.loadNumber);
        return;
      }
      if (booked.alreadyConverted) toast.info(`Already booked as ${booked.loadNumber || 'a job'}`);
      setResult(booked);
    } catch (e) {
      toast.error(bookErrorText(e));
    } finally {
      bookingRef.current = false;
      setBusy(false);
    }
  };

  const link = async (c: Candidate, direction: CandidateDirection) => {
    if (!result?.loadId || linkingId || linkingRef.current) return;
    linkingRef.current = true;
    const key = String(c.loadId);
    setLinkingId(key);
    try {
      // `return`: the candidate brings this job's truck home (this job is the
      // outbound). `outbound`: this job is the candidate's return.
      const res =
        direction === 'return'
          ? await linkReturnLoad(result.loadId, c.loadId)
          : await linkReturnLoad(c.loadId, result.loadId);
      const economics = parseEconomics((res ?? {}).economics);
      setResult({ ...result, economics: economics ?? result.economics, expectingReturn: false });
      setLinkedId(key);
      invalidateFor(qc, 'load');
      const warning = parseWarnings((res ?? {}).warnings)[0];
      if (warning) toast.info(`Linked. ${warning.title}`);
      else toast.success('Return load linked');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't link that load");
    } finally {
      linkingRef.current = false;
      setLinkingId(null);
    }
  };

  // ── Booked ────────────────────────────────────────────────────────────────
  if (result) {
    const paired = !!linkedId || result.isReturnOf != null || result.returnLoadId != null;
    const returns = result.returnCandidates.slice(0, 3);
    const outbounds = result.outboundCandidates.slice(0, 3);
    const showSuggestions = !paired && oneWay && (returns.length > 0 || outbounds.length > 0);
    const linkedCandidate = [...result.returnCandidates, ...result.outboundCandidates].find(
      (c) => String(c.loadId) === linkedId,
    );
    const pairView = result.economics?.pair ? marginCardView(result.economics) : null;
    // Linked in the booking call itself (either direction): name the partner.
    const oneCallPartner =
      !linkedCandidate && result.economics?.pair && result.loadId != null
        ? partnerLeg(result.economics, result.loadId)
        : null;
    return (
      <SheetScreen
        variant="modal"
        title="Booked"
        onBack={() => navigation.goBack()}
        footer={
          <Button
            label="Open job"
            icon="arrowRight"
            onPress={() => result.loadId != null && openJob(result.loadId, result.loadNumber)}
            fullWidth
          />
        }
      >
        <Txt className="mb-5 text-sub text-muted">
          {result.alreadyConverted
            ? `${reference || 'This quote'} was already booked as ${result.loadNumber || 'a job'}.`
            : `${reference || 'The quote'} is booked as ${result.loadNumber || 'a job'}.`}
        </Txt>

        {result.returnLink?.error && (
          <View className="mb-5">
            <Banner tone="warning" message={result.returnLink.error} />
          </View>
        )}

        {showSuggestions && (
          <>
            {returns.length > 0 && (
              <Group label="Coming back loaded?">
                {returns.map((c, i) => (
                  <CandidateRow
                    key={`r-${c.loadId}`}
                    candidate={c}
                    direction="return"
                    busy={linkingId === String(c.loadId)}
                    disabled={!!linkingId}
                    onPress={() => link(c, 'return')}
                    last={i === returns.length - 1}
                  />
                ))}
              </Group>
            )}
            {outbounds.length > 0 && (
              <Group label="Return of an earlier job?">
                {outbounds.map((c, i) => (
                  <CandidateRow
                    key={`o-${c.loadId}`}
                    candidate={c}
                    direction="outbound"
                    busy={linkingId === String(c.loadId)}
                    disabled={!!linkingId}
                    onPress={() => link(c, 'outbound')}
                    last={i === outbounds.length - 1}
                  />
                ))}
              </Group>
            )}
          </>
        )}
        {!paired && oneWay && !showSuggestions && result.expectingReturn && (
          <Mono className="mb-5 text-caption text-faint">
            Expecting a return load. Matches show on the job as they come in.
          </Mono>
        )}
        {linkedCandidate && (
          <Mono className="mb-3 text-caption text-faint">Linked {linkedCandidate.loadNumber}</Mono>
        )}
        {oneCallPartner && (
          <Mono className="mb-3 text-caption text-faint">
            {result.isReturnOf != null
              ? `Linked as the return of ${oneCallPartner.loadNumber}`
              : `Linked ${oneCallPartner.loadNumber} as the return load`}
          </Mono>
        )}
        {pairView && <TripMarginCard view={pairView} pair />}

        {result.invoice && <InvoicePreviewGroup preview={result.invoice} />}
      </SheetScreen>
    );
  }

  // ── Already booked (the preview says so) ─────────────────────────────────
  if (alreadyBookedId != null) {
    return (
      <SheetScreen
        variant="modal"
        title="Book job"
        onBack={() => navigation.goBack()}
        footer={<Button label="Open job" icon="arrowRight" onPress={() => openJob(alreadyBookedId)} fullWidth />}
      >
        <Txt className="text-sub text-muted">{`${reference || 'This quote'} is already booked.`}</Txt>
      </SheetScreen>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <SheetScreen
      variant="modal"
      title="Book job"
      onBack={() => navigation.goBack()}
      footer={<Button label={busy ? 'Booking…' : 'Book job'} loading={busy} disabled={!canBook} onPress={book} fullWidth />}
    >
      <Txt className="mb-5 text-sub text-muted">
        {`Book ${reference || 'this quote'} as a job. Truck, driver and dates can wait.`}
      </Txt>
      {preview?.blockedText && (
        <View className="mb-5">
          <Banner tone="warning" message={preview.blockedText} />
        </View>
      )}

      <View className="gap-4">
        <SelectField
          label={vehicleType ? `Truck (${vehicleType})` : 'Truck'}
          placeholder="Assign later"
          options={noVehicles ? [] : vehicleOptions}
          value={vehicleId}
          onSelect={setVehicleId}
          warning={
            noVehicles
              ? vehicleType
                ? `No available ${vehicleType} trucks. Check the Fleet tab.`
                : 'No available trucks. Check the Fleet tab.'
              : undefined
          }
        />
        <SelectField
          label="Driver"
          placeholder="Assign later"
          options={noDrivers ? [] : driverOptions}
          value={driverId}
          onSelect={setDriverId}
          warning={noDrivers ? 'No available drivers. Check the Fleet tab.' : undefined}
        />
        {driverWithoutTruck && (
          <Mono className="-mt-2 text-caption text-warning">Pick a truck for this driver, or clear the driver.</Mono>
        )}
        <DateField label="Collection" value={pickupShown} onChange={setPickupDate} placeholder="Not set" />
        <DateField
          label="Delivery"
          value={deliveryShown}
          onChange={setDeliveryDate}
          placeholder="Not set"
          error={datesOutOfOrder ? 'Delivery is before collection' : undefined}
        />
        {oneWay && (
          <RadioRows
            label="Coming back loaded?"
            value={choiceShown}
            onSelect={(v) => setChoice(v as ReturnChoice)}
            options={returnOptions}
          />
        )}
      </View>

      {preview?.invoice && (
        <View className="mt-5">
          <InvoicePreviewGroup preview={preview.invoice} />
        </View>
      )}
    </SheetScreen>
  );
}
