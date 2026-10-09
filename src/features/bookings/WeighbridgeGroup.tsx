import { useState } from 'react';
import { View } from 'react-native';
import { Button, DetailRow, Group, TextField, Txt } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';
import { toast } from '@/lib/toast';
import { saveWeighbridge } from './api';
import { fmtRatePerTonne, fmtTonnes, parseTonnes, type LoadTonnage } from './quote/tonnage';

const fieldText = (v: unknown) => (v == null || v === '' ? '' : String(Number(v)).replace('.', ','));

/** Tonnes and slip inputs, shared by the group and the delivery dialog. */
export function WeighbridgeFields({
  tonnes,
  slip,
  onTonnes,
  onSlip,
  planned,
}: {
  tonnes: string;
  slip: string;
  onTonnes: (v: string) => void;
  onSlip: (v: string) => void;
  planned?: unknown;
}) {
  const bad = tonnes.trim() !== '' && parseTonnes(tonnes) == null;
  return (
    <View className="flex-row gap-3">
      <View className="flex-1">
        <TextField
          label="Weighbridge tonnes"
          placeholder={planned != null ? fieldText(planned) : 'e.g. 30,4'}
          keyboardType="decimal-pad"
          value={tonnes}
          onChangeText={onTonnes}
          error={bad ? 'Up to 100 t' : undefined}
        />
      </View>
      <View className="flex-1">
        <TextField label="Slip number" placeholder="Optional" value={slip} onChangeText={onSlip} maxLength={60} />
      </View>
    </View>
  );
}

/**
 * A per-tonne load's weighbridge: planned vs weighed tonnes, the minimum and
 * the billed amount; enter or confirm the tonnes (the invoice follows).
 * Same content as the web order page's Weighbridge card.
 */
export function WeighbridgeGroup({
  load,
  onSaved,
  disabled,
}: {
  load: Record<string, unknown>;
  onSaved: (res: Record<string, unknown>) => void;
  disabled?: boolean;
}) {
  const b = load.tonnage as LoadTonnage | null | undefined;
  const [editing, setEditing] = useState(false);
  const [tonnes, setTonnes] = useState(fieldText(load.actual_tonnes));
  const [slip, setSlip] = useState(String(load.weighbridge_slip ?? ''));
  const [busy, setBusy] = useState(false);
  if (!b) return null;
  const status = String(load.status ?? '').toUpperCase();
  const delivered = status === 'DELIVERED' || status === 'INVOICED';
  const actual = load.actual_tonnes;
  const submit = async (t: number | null) => {
    if (t == null) {
      toast.error('Enter the weighbridge tonnes');
      return;
    }
    setBusy(true);
    try {
      onSaved(await saveWeighbridge(String(load.id), t, slip));
      setEditing(false);
      toast.success(`Weighbridge ${fmtTonnes(t)} saved`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the tonnes");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Group label="Weighbridge">
      {b.awaiting_weighbridge && delivered && (
        <View className="bg-warning-bg px-3.5 py-3">
          <Txt className="text-sub text-fg">Awaiting weighbridge tonnes. The invoice uses planned tonnes until they are in.</Txt>
        </View>
      )}
      <DetailRow label="Planned" value={fmtTonnes(load.planned_tonnes as number | null)} />
      <DetailRow
        label="Weighed"
        hint={load.weighbridge_slip ? `Slip ${String(load.weighbridge_slip)}` : undefined}
        value={actual != null ? fmtTonnes(actual as number) : 'Not yet'}
      />
      {b.min_tonnes != null && <DetailRow label="Minimum" value={fmtTonnes(b.min_tonnes)} />}
      <DetailRow
        label="Billed"
        hint={`${fmtTonnes(b.billable_tonnes)} × ${fmtRatePerTonne(b.rate_per_tonne)}`}
        value={formatCurrency(b.amount)}
        boldValue
        last={disabled}
      />
      {!disabled && (
        <View className="gap-2.5 px-3.5 py-3">
          {editing ? (
            <>
              <WeighbridgeFields tonnes={tonnes} slip={slip} onTonnes={setTonnes} onSlip={setSlip} planned={load.planned_tonnes} />
              <View className="flex-row gap-2.5">
                <View className="flex-1">
                  <Button label="Cancel" variant="secondary" onPress={() => setEditing(false)} disabled={busy} fullWidth />
                </View>
                <View className="flex-1">
                  <Button label="Save" loading={busy} onPress={() => submit(parseTonnes(tonnes))} fullWidth />
                </View>
              </View>
            </>
          ) : (
            <View className="flex-row gap-2.5">
              {actual == null && load.planned_tonnes != null && delivered && (
                <View className="flex-1">
                  <Button
                    label={`Confirm ${fmtTonnes(load.planned_tonnes as number)}`}
                    variant="secondary"
                    loading={busy}
                    onPress={() => submit(Number(load.planned_tonnes))}
                    fullWidth
                  />
                </View>
              )}
              <View className="flex-1">
                <Button
                  label={actual == null ? 'Enter tonnes' : 'Change'}
                  variant={actual == null && delivered ? 'primary' : 'secondary'}
                  onPress={() => setEditing(true)}
                  disabled={busy}
                  fullWidth
                />
              </View>
            </View>
          )}
        </View>
      )}
    </Group>
  );
}
