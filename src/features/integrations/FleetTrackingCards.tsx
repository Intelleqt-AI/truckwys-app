import { useMemo, useState, type ReactNode } from 'react';
import { Alert, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { AppSheet, Banner, Button, Card, SelectField, StatusPill, TextField, Txt } from '@/components/ui';
import { ListSkeleton } from '@/components/feedback';
import { toast } from '@/lib/toast';
import { formatDateTime } from '@/lib/formatters';
import { useAccountingPermissions } from '@/features/accounting/permissions';
import {
  INT_KEYS,
  integrationsApi,
  intError,
  invalidateCtrlFleet,
  useCartrackStatus,
  useCtrlFleetStatus,
  useCtrlFleetVehicles,
  type CtrlFleetVehicle,
  type SyncResult,
} from './api';
import { IntegrationLogo, LOGO_CARTRACK, LOGO_CTRLFLEET } from './IntegrationLogo';

const nested = 'gap-1 rounded-control border border-line bg-raised p-3';

/** Logo, name and one grey line, status on the right: the same header the accounting cards use. */
function Head({ logo, title, desc, chip }: { logo: ReactNode; title: string; desc: string; chip?: ReactNode }) {
  return (
    <View className="flex-row items-start gap-3">
      {logo}
      <View className="flex-1">
        <Txt className="text-body font-semibold text-fg">{title}</Txt>
        <Txt className="mt-0.5 text-caption text-muted">{desc}</Txt>
      </View>
      {chip}
    </View>
  );
}

function WriteNote({ show, title }: { show: boolean; title?: string }) {
  if (!show || !title) return null;
  return <Txt className="text-caption text-faint">{title}.</Txt>;
}

export function FleetTrackingCards() {
  return (
    <View className="gap-3">
      <CartrackCard />
      <CtrlFleetCard />
    </View>
  );
}

// ------------------------------------------------------------------ Cartrack

function CartrackCard() {
  const { canWrite, writeTitle } = useAccountingPermissions();
  const qc = useQueryClient();
  const q = useCartrackStatus();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const status = q.data;

  const submit = async () => {
    if (!username.trim() || !password || !baseUrl.trim()) {
      toast.error('Please enter username, password and base URL');
      return;
    }
    setBusy(true);
    try {
      await integrationsApi.connectCartrack({
        username: username.trim(),
        password,
        base_url: baseUrl.trim(),
      });
      toast.success('Cartrack connected');
      setUsername('');
      setPassword('');
      setBaseUrl('');
      setOpen(false);
      void qc.invalidateQueries({ queryKey: INT_KEYS.cartrack });
    } catch (e) {
      toast.error(intError(e, 'Could not connect to Cartrack. Check your credentials and base URL.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="gap-3 p-4">
      <Head
        logo={<IntegrationLogo source={LOGO_CARTRACK} />}
        title="Cartrack"
        desc="Live vehicle location, speed and ignition status"
        chip={status ? <StatusPill status={status.connected ? 'CONNECTED' : 'DISCONNECTED'} /> : undefined}
      />
      {q.isLoading ? (
        <ListSkeleton rows={1} />
      ) : status?.connected ? (
        <View className={nested}>
          <Txt className="text-caption text-fg">
            <Txt className="text-caption font-semibold text-fg">Connected: </Txt>
            {status.base_url}
          </Txt>
          {!!status.last_status_sync && (
            <Txt className="text-caption text-muted">
              Last vehicle status sync: {formatDateTime(status.last_status_sync)}
            </Txt>
          )}
        </View>
      ) : open ? (
        <View className="gap-3">
          <TextField
            label="Username"
            value={username}
            onChangeText={setUsername}
            placeholder="Cartrack username"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Cartrack password"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextField
            label="Base URL"
            value={baseUrl}
            onChangeText={setBaseUrl}
            placeholder="https://fleetapi-za.cartrack.com"
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Txt className="text-caption text-faint">
            Region-specific. Get your base URL and credentials from Fleetweb &gt; Settings &gt; API Settings.
          </Txt>
          <View className="flex-row gap-2.5">
            <Button
              label={busy ? 'Connecting…' : 'Connect'}
              size="sm"
              loading={busy}
              disabled={!canWrite}
              onPress={() => void submit()}
            />
            <Button label="Cancel" size="sm" variant="secondary" onPress={() => setOpen(false)} />
          </View>
        </View>
      ) : (
        <View>
          <Button
            label="Connect Cartrack"
            size="sm"
            variant="secondary"
            disabled={!canWrite}
            onPress={() => setOpen(true)}
          />
          <WriteNote show={!canWrite} title={writeTitle} />
        </View>
      )}
    </Card>
  );
}

// ----------------------------------------------------------------- CtrlFleet

const syncLine = (r: SyncResult | undefined, kind: 'vehicles' | 'positions') =>
  kind === 'vehicles'
    ? `Matched ${r?.matched ?? 0} of ${r?.total ?? 0} vehicles`
    : `Updated position for ${r?.updated ?? 0} of ${r?.checked ?? 0} linked vehicles`;

function CtrlFleetCard() {
  const { canWrite, writeTitle } = useAccountingPermissions();
  const qc = useQueryClient();
  const q = useCtrlFleetStatus();
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState<'connect' | 'vehicles' | 'positions' | 'disconnect' | null>(null);
  // Success toasts are silent in this app, and a sync result isn't on screen
  // anywhere else, so the last one is written into the card.
  const [result, setResult] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const status = q.data;

  const connect = async () => {
    if (!apiKey.trim()) {
      toast.error('Please enter your CtrlFleet API key');
      return;
    }
    setBusy('connect');
    try {
      const r = await integrationsApi.connectCtrlFleet(apiKey.trim());
      toast.success('CtrlFleet connected');
      setResult(syncLine(r.sync, 'vehicles') + ' by plate');
      setApiKey('');
      setOpen(false);
      invalidateCtrlFleet(qc);
    } catch (e) {
      toast.error(intError(e, 'Could not connect to CtrlFleet. Check your API key.'));
    } finally {
      setBusy(null);
    }
  };

  const run = async (kind: 'vehicles' | 'positions') => {
    setBusy(kind);
    try {
      const r =
        kind === 'vehicles'
          ? await integrationsApi.syncCtrlFleetVehicles()
          : await integrationsApi.syncCtrlFleetPositions();
      toast.success();
      setResult(syncLine(r.sync, kind));
      invalidateCtrlFleet(qc);
    } catch (e) {
      toast.error(intError(e, kind === 'vehicles' ? 'Sync failed' : 'Position sync failed'));
    } finally {
      setBusy(null);
    }
  };

  const disconnect = () =>
    Alert.alert(
      'Disconnect CtrlFleet?',
      'Every vehicle linked to CtrlFleet will be unlinked and live positions stop updating.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            setBusy('disconnect');
            try {
              await integrationsApi.disconnectCtrlFleet();
              toast.success('CtrlFleet disconnected');
              setResult(null);
              setSheet(false);
              invalidateCtrlFleet(qc);
            } catch (e) {
              toast.error(intError(e, 'Could not disconnect CtrlFleet'));
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );

  const matched = status?.matched_vehicles;

  return (
    <Card className="gap-3 p-4">
      <Head
        logo={<IntegrationLogo source={LOGO_CTRLFLEET} />}
        title="CtrlFleet"
        desc="Live vehicle location and points of interest"
        chip={status ? <StatusPill status={status.connected ? 'CONNECTED' : 'DISCONNECTED'} /> : undefined}
      />
      {q.isLoading ? (
        <ListSkeleton rows={1} />
      ) : status?.connected ? (
        <>
          <View className={nested}>
            <Txt className="text-caption font-semibold text-fg">Connected</Txt>
            {typeof matched === 'number' && (
              <Txt className="text-caption text-muted">
                {matched} vehicle{matched === 1 ? '' : 's'} matched by licence plate
              </Txt>
            )}
            {!!status.last_vehicle_sync && (
              <Txt className="text-caption text-muted">
                Last vehicle sync: {formatDateTime(status.last_vehicle_sync)}
              </Txt>
            )}
            {!!result && <Txt className="text-caption text-muted">{result}</Txt>}
          </View>
          <View className="flex-row flex-wrap gap-2.5">
            <Button
              label="Re-sync vehicles"
              size="sm"
              variant="secondary"
              loading={busy === 'vehicles'}
              disabled={!canWrite || busy != null}
              onPress={() => void run('vehicles')}
            />
            <Button
              label="Sync positions"
              size="sm"
              variant="secondary"
              loading={busy === 'positions'}
              disabled={!canWrite || busy != null}
              onPress={() => void run('positions')}
            />
            <Button label="View vehicles" size="sm" variant="secondary" onPress={() => setSheet(true)} />
            <Button
              label="Disconnect"
              size="sm"
              variant="secondary"
              loading={busy === 'disconnect'}
              disabled={!canWrite || busy != null}
              onPress={disconnect}
            />
          </View>
          <WriteNote show={!canWrite} title={writeTitle} />
        </>
      ) : open ? (
        <View className="gap-3">
          <TextField
            label="API key"
            value={apiKey}
            onChangeText={setApiKey}
            placeholder="CtrlFleet API key"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Txt className="text-caption text-faint">
            Get your API key from your CtrlFleet account. Connecting matches your vehicles to CtrlFleet&apos;s by
            licence plate.
          </Txt>
          <View className="flex-row gap-2.5">
            <Button
              label={busy === 'connect' ? 'Connecting…' : 'Connect'}
              size="sm"
              loading={busy === 'connect'}
              disabled={!canWrite}
              onPress={() => void connect()}
            />
            <Button label="Cancel" size="sm" variant="secondary" onPress={() => setOpen(false)} />
          </View>
        </View>
      ) : (
        <View>
          <Button
            label="Connect CtrlFleet"
            size="sm"
            variant="secondary"
            disabled={!canWrite}
            onPress={() => setOpen(true)}
          />
          <WriteNote show={!canWrite} title={writeTitle} />
        </View>
      )}
      <CtrlFleetVehiclesSheet open={sheet} onClose={() => setSheet(false)} canWrite={canWrite} />
    </Card>
  );
}

// ------------------------------------------------------------ vehicle linking

function CtrlFleetVehiclesSheet({
  open,
  onClose,
  canWrite,
}: {
  open: boolean;
  onClose: () => void;
  canWrite: boolean;
}) {
  const qc = useQueryClient();
  const q = useCtrlFleetVehicles(open);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [linking, setLinking] = useState<string | null>(null);

  const unlinked = useMemo(
    () =>
      (q.data?.truckwys_vehicles ?? [])
        .filter((v) => !v.ctrlfleet_vehicle_code)
        .map((v) => ({
          value: String(v.id),
          label: v.plate,
          sub: [v.make, v.model].filter(Boolean).join(' ') || undefined,
        })),
    [q.data],
  );

  const change = async (cf: CtrlFleetVehicle, vehicleId: number, code: string | null) => {
    setLinking(cf.vehicle_code);
    try {
      await integrationsApi.linkVehicle(vehicleId, code);
      toast.success(code ? 'Vehicle linked' : 'Vehicle unlinked');
      invalidateCtrlFleet(qc);
    } catch (e) {
      toast.error(intError(e, code ? 'Could not link vehicle' : 'Could not unlink vehicle'));
    } finally {
      setLinking(null);
    }
  };

  const list = q.data?.ctrlfleet_vehicles ?? [];

  return (
    <AppSheet open={open} onClose={onClose} title="CtrlFleet vehicles" maxHeight={0.85} scroll>
      <View className="px-4 pb-4">
        {q.isLoading ? (
          <ListSkeleton rows={3} />
        ) : q.isError ? (
          <Banner tone="danger" message={intError(q.error, 'Could not load CtrlFleet vehicles')} />
        ) : list.length === 0 ? (
          <Txt className="py-4 text-caption text-muted">No vehicles returned by CtrlFleet.</Txt>
        ) : (
          list.map((cf, i) => (
            <View
              key={cf.vehicle_code || i}
              className={`gap-2 py-3 ${i === list.length - 1 ? '' : 'border-b border-line-row'}`}
            >
              <View>
                <Txt className="text-body text-fg">{cf.licence_number || 'No plate'}</Txt>
                <Txt className="text-caption text-muted">
                  {cf.vehicle_code}
                  {cf.type ? ` · ${cf.type}` : ''}
                </Txt>
              </View>
              {cf.matched_vehicle_id ? (
                <View className="flex-row items-center justify-between gap-3">
                  <Txt className="flex-1 text-caption font-medium text-success">
                    Linked → {cf.matched_vehicle_plate}
                  </Txt>
                  <Button
                    label="Unlink"
                    size="sm"
                    variant="secondary"
                    loading={linking === cf.vehicle_code}
                    disabled={!canWrite || linking != null}
                    onPress={() => void change(cf, cf.matched_vehicle_id as number, null)}
                  />
                </View>
              ) : (
                <View className="flex-row items-center gap-2.5">
                  <View className="flex-1">
                    <SelectField
                      placeholder="Link to vehicle…"
                      label="Link to vehicle"
                      value={picked[cf.vehicle_code]}
                      options={unlinked}
                      onSelect={(v) => setPicked((p) => ({ ...p, [cf.vehicle_code]: v }))}
                    />
                  </View>
                  <Button
                    label="Link"
                    size="sm"
                    variant="secondary"
                    loading={linking === cf.vehicle_code}
                    disabled={!canWrite || linking != null || !picked[cf.vehicle_code]}
                    onPress={() => void change(cf, Number(picked[cf.vehicle_code]), cf.vehicle_code)}
                  />
                </View>
              )}
            </View>
          ))
        )}
      </View>
    </AppSheet>
  );
}
