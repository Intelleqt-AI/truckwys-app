import { useEffect, useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { AppSheet, Badge, Card, Group, Mono, SegmentedControl, Txt, type Tone } from '@/components/ui';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { toast } from '@/lib/toast';
import {
  type FuelActuals,
  type Tone as FuelTone,
  type VehicleTypeFuel,
  confidenceChip,
  fuelCell,
  headerStrip,
  leftOut,
  measuredLines,
  methodSentence,
  periodHeading,
  selectedMode,
  truckCard,
  unusableText,
} from '@/features/bookings/quote/fleetFuel';
import { patchFuelActuals, refreshFleetFuel, setBurnMode, useFleetFuel, useReplaceFuelRow } from './fuelActuals';

// Fleet actuals UI (FLEET-ACTUALS-CLIENT-SPEC.md): measured fuel use from
// Cartrack on Settings › Vehicle types and on a truck's page. Mirrors the web's
// components/fleet/FleetFuel.tsx; every string comes from fleetFuel.ts.

const TONE: Record<FuelTone, Tone> = { good: 'success', neutral: 'neutral', warn: 'warning', bad: 'danger' };

const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** A small tappable text action ("Refresh now", "Use measured figure"). */
function TextAction({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Mono className={`text-caption font-medium ${disabled ? 'text-faint' : 'text-link'}`}>{label}</Mono>
    </TouchableOpacity>
  );
}

/** Header strip: when the figures were last measured, what didn't match, and "Refresh now" (admin). */
export function FleetFuelStrip({ data, isAdmin }: { data: FuelActuals; isAdmin: boolean }) {
  const qc = useQueryClient();
  const { nav, goTab } = useAppNavigation();
  const s = headerStrip(data);
  const [busy, setBusy] = useState(false);
  // Re-render when the cooldown ends, so "Refresh now" comes back by itself.
  const [, setTick] = useState(0);
  useEffect(() => {
    const ms = data.refresh_next_at ? Date.parse(data.refresh_next_at) - Date.now() : 0;
    if (!(ms > 0)) return;
    const t = setTimeout(() => setTick((x) => x + 1), ms + 500);
    return () => clearTimeout(t);
  }, [data.refresh_next_at]);
  const queued = !!data.refresh_queued || busy;

  const refresh = async () => {
    setBusy(true);
    try {
      const r = await refreshFleetFuel();
      patchFuelActuals(qc, (d) => ({ ...d, refresh_queued: r.queued, refresh_next_at: r.next_at }));
    } catch (e) {
      toast.error(errText(e, "Couldn't start a refresh."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="gap-1.5 p-3.5">
      <Txt className="text-sub text-muted">{s.main}</Txt>
      {s.lines.map((l) => (
        <Txt key={l} className="text-caption text-faint">
          {l}
        </Txt>
      ))}
      {(s.link || (s.canRefresh && isAdmin)) && (
        <View className="mt-1 flex-row flex-wrap items-center gap-x-4 gap-y-1">
          {s.link && (
            <TextAction
              label={s.link.text}
              onPress={() =>
                s.link?.to === 'fleet' ? goTab('Fleet', { tab: 'vehicles' }) : nav.push('Settings', { section: 'integrations' })
              }
            />
          )}
          {s.canRefresh && isAdmin && !s.cooldown && (
            <TextAction label={queued ? 'Refreshing...' : 'Refresh now'} onPress={refresh} disabled={queued} />
          )}
          {s.canRefresh && isAdmin && s.cooldown && <Txt className="text-caption text-faint">{s.cooldown}</Txt>}
        </View>
      )}
    </Card>
  );
}

/** The "Fuel use" line under a vehicle type: the figure quotes use, where it comes from, and what an admin can do. */
export function FuelUseLine({
  row,
  isAdmin,
  onDetail,
  onSet,
  onUseMeasured,
}: {
  row: VehicleTypeFuel;
  isAdmin: boolean;
  onDetail: () => void;
  onSet: () => void;
  onUseMeasured: () => void;
}) {
  const c = fuelCell(row);
  if (c.missing) {
    return (
      <View className="mt-1 flex-row items-center gap-3">
        <Mono className="text-caption text-faint">Fuel use: Not set</Mono>
        {isAdmin && <TextAction label="Set fuel use" onPress={onSet} />}
      </View>
    );
  }
  return (
    <View className="mt-1 gap-0.5">
      <View className="flex-row flex-wrap items-center gap-2">
        <Mono className="text-caption text-fg">{c.value}</Mono>
        {c.tag && <Badge label={c.tag} tone={c.tag === 'Measured' ? 'accent' : 'neutral'} />}
        {row.measured ? <TextAction label="Details" onPress={onDetail} /> : null}
      </View>
      {c.sub && <Mono className="text-caption text-faint">{c.sub}</Mono>}
      {c.offerUseMeasured && isAdmin && <TextAction label="Use measured figure" onPress={onUseMeasured} />}
    </View>
  );
}

/** Measured detail for one vehicle type, in a bottom sheet. */
export function FuelDetailSheet({
  row,
  open,
  onClose,
  isAdmin,
  minKm,
}: {
  row: VehicleTypeFuel | null;
  open: boolean;
  onClose: () => void;
  isAdmin: boolean;
  minKm: number;
}) {
  const replaceRow = useReplaceFuelRow();
  const [saving, setSaving] = useState<string | null>(null);
  const m = row?.measured;
  return (
    <AppSheet open={open && !!row} onClose={onClose} title={row?.name} scroll>
      {row && m ? (
        <FuelDetailBody
          row={row}
          isAdmin={isAdmin}
          minKm={minKm}
          saving={saving}
          onMode={async (mode) => {
            if (saving || mode === selectedMode(row)) return;
            setSaving(mode);
            try {
              replaceRow(await setBurnMode(row.id, mode));
            } catch (e) {
              toast.error(errText(e, "Couldn't change the figure."));
            } finally {
              setSaving(null);
            }
          }}
        />
      ) : null}
    </AppSheet>
  );
}

function FuelDetailBody({
  row,
  isAdmin,
  minKm,
  saving,
  onMode,
}: {
  row: VehicleTypeFuel;
  isAdmin: boolean;
  minKm: number;
  saving: string | null;
  onMode: (mode: 'MEASURED' | 'CONFIGURED') => void;
}) {
  const m = row.measured!;
  const chip = confidenceChip(m, minKm);
  const why = unusableText(m);
  const out = leftOut(m.rejections);
  const sel = selectedMode(row);
  const how = methodSentence(m.rated_method);
  return (
    <View className="gap-3 px-4 pb-6">
      <Txt className="text-body font-medium text-fg">{periodHeading(m)}</Txt>
      <Badge label={chip.text} tone={TONE[chip.tone]} />
      {why ? <Txt className="text-sub text-warning">{why}</Txt> : null}
      {m.confidence === 'rejected' && m.note && !why ? <Txt className="text-sub text-warning">{m.note}</Txt> : null}
      <View className="gap-1">
        {measuredLines(m).map((l) => (
          <Txt key={l} className="text-sub text-fg">
            {l}
          </Txt>
        ))}
      </View>
      {how ? <Txt className="text-caption text-faint">{how}</Txt> : null}
      {out.lines.length > 0 && (
        <View className="gap-1">
          <Txt className="text-sub font-medium text-muted">Left out</Txt>
          {out.lines.map((l, i) => (
            <Txt key={`${i}-${l}`} className="text-caption text-faint">
              {l}
            </Txt>
          ))}
          {out.more ? <Txt className="text-caption text-faint">{out.more}</Txt> : null}
        </View>
      )}
      {isAdmin && (
        <View className="gap-1.5">
          <Txt className="text-sub font-medium text-muted">Figure used for quotes</Txt>
          <SegmentedControl
            options={[
              { label: saving === 'MEASURED' ? 'Saving...' : 'Use measured figure', value: 'MEASURED' as const },
              { label: saving === 'CONFIGURED' ? 'Saving...' : 'Use my figure', value: 'CONFIGURED' as const },
            ]}
            value={sel}
            onChange={(mode) => {
              // The measured figure can't be chosen until it is usable.
              if (mode === 'MEASURED' && !row.can_use_measured && sel !== 'MEASURED') return;
              onMode(mode);
            }}
          />
          {!row.can_use_measured && sel !== 'MEASURED' ? (
            <Txt className="text-caption text-faint">{"The measured figure can't be used for quotes yet."}</Txt>
          ) : null}
        </View>
      )}
    </View>
  );
}

/** A truck's "Fuel use (last 90 days)" card. Renders nothing until there is something measured. */
export function TruckFuelCard({ vehicleId }: { vehicleId: number | string }) {
  const { data } = useFleetFuel();
  if (!data) return null;
  const v = data.vehicles.find((x) => String(x.id) === String(vehicleId));
  if (!v) return null;
  const type = data.vehicle_types.find((t) => t.id === v.vehicle_type_id);
  const card = truckCard(v, type, data.rules?.min_distance_km ?? 2000);
  if (!card) return null;
  return (
    <Group label={`Fuel use (last ${data.rules?.period_days ?? 90} days)`}>
      <Card className="gap-1.5 p-3.5">
        <View className="flex-row flex-wrap items-center gap-2">
          {card.value ? <Mono className="text-heading font-semibold text-fg">{card.value}</Mono> : null}
          {card.chip ? <Badge label={card.chip.text} tone={TONE[card.chip.tone]} /> : null}
        </View>
        {card.lines.map((l) => (
          <Txt key={l} className="text-sub text-muted">
            {l}
          </Txt>
        ))}
        {card.typeLine ? <Txt className="text-sub text-muted">{card.typeLine}</Txt> : null}
        {card.amber ? <Txt className="text-sub text-warning">{card.amber}</Txt> : null}
      </Card>
    </Group>
  );
}
