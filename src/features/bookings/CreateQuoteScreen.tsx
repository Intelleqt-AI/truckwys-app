import { useEffect, useRef, useState } from 'react';
import { View, Pressable, TextInput } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  SheetScreen,
  Group,
  DetailRow,
  RoutePreview,
  SegmentedControl,
  TextField,
  ConfidenceTag,
  Button,
  Icon,
  Txt,
  Mono,
  Label,
  EmptyState,
} from '@/components/ui';
import { analyzeQuote, createQuoteRequest, sendQuote, suggestLocations } from './api';
import { VEHICLE_CLASSES } from './constants';
import { num, str, pick, asArray } from '@/lib/api/list';
import { formatCurrency } from '@/lib/formatters';
import { useTheme } from '@/theme/ThemeProvider';
import { toast } from '@/lib/toast';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'CreateQuote'>;

interface Estimate {
  amount: number;
  distance: number;
  sla: number;
  confidence: number;
  marginPct: number;
  breakdown: { label: string; value: number }[];
}

export function CreateQuoteScreen({ route, navigation }: Props) {
  const ai = route.params?.ai;
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [origin, setOrigin] = useState('');
  const [dest, setDest] = useState('');
  const [vclass, setVclass] = useState('Superlink-30t');
  const [weight, setWeight] = useState('28');
  const [customer, setCustomer] = useState('');
  const [email, setEmail] = useState('');
  const [expiry, setExpiry] = useState('7');
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentCode, setSentCode] = useState<string | null>(null);

  const runEstimate = async () => {
    setBusy(true);
    try {
      const r = (await analyzeQuote({
        origin,
        destination: dest,
        vehicle_class: vclass,
        weight: Number(weight) * 1000,
      })) as Record<string, unknown>;
      setEstimate({
        amount: num(pick(r, ['total_amount', 'total', 'price', 'amount'])),
        distance: num(pick(r, ['distance', 'distance_km'])),
        sla: num(pick(r, ['sla_hours', 'duration_hours', 'sla'])),
        confidence: pick(r, ['confidence']) != null ? num(pick(r, ['confidence'])) : 0.8,
        marginPct: num(pick(r, ['margin_percent', 'margin'])),
        breakdown: [
          { label: 'Base', value: num(pick(r, ['base_rate', 'base'])) },
          { label: 'Fuel', value: num(pick(r, ['fuel_surcharge', 'fuel'])) },
          { label: 'Tolls', value: num(pick(r, ['toll_charges', 'tolls'])) },
          { label: 'Driver / vehicle', value: num(pick(r, ['driver_allowance', 'driver'])) },
        ].filter((b) => b.value > 0),
      });
      setStep(1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not calculate estimate');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      const created = (await createQuoteRequest({
        origin,
        destination: dest,
        vehicle_class: vclass,
        weight: Number(weight) * 1000,
        customer_name: customer,
        client_email: email,
        total_amount: estimate?.amount,
        valid_days: Number(expiry),
      })) as Record<string, unknown>;
      const id = pick(created, ['id', 'pk']) as string | number | undefined;
      if (id) await sendQuote(id).catch(() => undefined);
      await qc.invalidateQueries({ queryKey: ['quotes'] });
      setSentCode(str(pick(created, ['quote_number', 'reference', 'id']), 'Quote'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create quote');
    } finally {
      setBusy(false);
    }
  };

  if (sentCode) {
    return (
      <SheetScreen onBack={() => navigation.goBack()}>
        <View className="mt-3 items-center px-4">
          <View className="mb-5 h-[72px] w-[72px] items-center justify-center rounded-pill border-2 border-success bg-success-bg">
            <Icon name="check" size={38} color="#22C55E" strokeWidth={2.5} />
          </View>
          <Txt className="text-title font-semibold text-fg">Quote {sentCode} sent</Txt>
          <Txt className="mt-2 text-center text-callout text-muted">
            A secure, no-login link was sent to the client. You&apos;ll be notified when it&apos;s viewed or
            accepted.
          </Txt>
          <View className="mt-6 w-full">
            <Button label="Done" onPress={() => navigation.goBack()} fullWidth />
          </View>
        </View>
      </SheetScreen>
    );
  }

  const titles = ['Route & load', 'Estimate', 'Review & send'];
  const canNext = step === 0 ? origin.length > 0 && dest.length > 0 : true;

  return (
    <SheetScreen
      eyebrow={`${ai ? 'AI quote' : 'New quote'} · Step ${step + 1} of 3`}
      title={titles[step]}
      onBack={step === 0 ? () => navigation.goBack() : () => setStep(step - 1)}
      footer={
        step === 0 ? (
          <Button label="Calculate estimate" icon="arrowRight" loading={busy} disabled={!canNext} onPress={runEstimate} fullWidth />
        ) : step === 1 ? (
          <Button label="Continue to send" icon="arrowRight" onPress={() => setStep(2)} fullWidth />
        ) : (
          <Button label="Send quote to client" icon="send" loading={busy} disabled={!customer} onPress={submit} fullWidth />
        )
      }
    >
      {/* progress */}
      <View className="mb-5 flex-row gap-1.5">
        {[0, 1, 2].map((s) => (
          <View
            key={s}
            className={`h-[3px] flex-1 rounded-xs ${s <= step ? 'bg-accent' : 'bg-line'}`}
          />
        ))}
      </View>

      {step === 0 && (
        <View className="gap-4">
          {ai && (
            <View className="flex-row items-center gap-2.5 rounded-xs border border-accent bg-surface p-3">
              <Icon name="sparkle" size={16} color="#4D9EFF" />
              <Txt className="flex-1 text-sub text-muted">
                AI optimises route, margin and win-probability from your inputs.
              </Txt>
            </View>
          )}
          <LocationField label="Pickup" value={origin} onChange={setOrigin} placeholder="Search origin" />
          <LocationField label="Drop-off" value={dest} onChange={setDest} placeholder="Search destination" />
          <View>
            <Label className="mb-2 text-muted">Vehicle class</Label>
            <SegmentedControl options={VEHICLE_CLASSES} value={vclass} onChange={setVclass} />
          </View>
          <TextField
            label="Cargo weight (tons)"
            keyboardType="numeric"
            value={weight}
            onChangeText={setWeight}
          />
        </View>
      )}

      {step === 1 && estimate && (
        <View className="gap-5">
          <RoutePreview
            origin={origin}
            dest={dest}
            distance={estimate.distance ? `${estimate.distance} km` : undefined}
            duration={estimate.sla ? `SLA ${estimate.sla}h` : undefined}
          />
          <View className="flex-row items-center justify-between rounded-xs border border-accent bg-surface px-4 py-3.5">
            <View>
              <Label className="text-accent" style={{ fontSize: 10 }}>
                AI estimate{estimate.marginPct ? ` · ${estimate.marginPct}% margin` : ''}
              </Label>
              <Mono className="mt-1 text-fg" style={{ fontSize: 26, fontWeight: '600' }}>
                {formatCurrency(estimate.amount)}
              </Mono>
            </View>
            <ConfidenceTag value={estimate.confidence} />
          </View>
          {estimate.breakdown.length > 0 && (
            <Group label="Breakdown">
              {estimate.breakdown.map((b) => (
                <DetailRow key={b.label} label={b.label} value={formatCurrency(b.value)} />
              ))}
              <View className="flex-row items-center justify-between bg-surface-hover px-3.5 py-3.5">
                <Txt className="text-callout font-semibold text-fg">Total incl. VAT</Txt>
                <Mono className="text-heading font-semibold text-accent">
                  {formatCurrency(estimate.amount)}
                </Mono>
              </View>
            </Group>
          )}
        </View>
      )}

      {step === 2 && (
        <View className="gap-4">
          <View className="rounded-xs border border-line bg-surface p-3.5">
            <Txt className="text-sub text-muted">
              {origin} → {dest} · {vclass}
            </Txt>
            <Mono className="mt-1.5 text-fg" style={{ fontSize: 22, fontWeight: '600' }}>
              {formatCurrency(estimate?.amount ?? 0)}
            </Mono>
          </View>
          <TextField label="Customer" value={customer} onChangeText={setCustomer} placeholder="Customer name" />
          <TextField
            label="Client email"
            value={email}
            onChangeText={setEmail}
            placeholder="client@company.co.za"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <View>
            <Label className="mb-2 text-muted">Link expires in</Label>
            <SegmentedControl
              options={[
                { label: '24h', value: '1' },
                { label: '48h', value: '2' },
                { label: '7 days', value: '7' },
              ]}
              value={expiry}
              onChange={setExpiry}
            />
          </View>
          <View className="flex-row items-start gap-2.5 rounded-xs border border-info bg-info-bg p-3">
            <Icon name="link" size={16} color="#4D9EFF" />
            <Txt className="flex-1 text-sub text-muted">
              The client reviews and accepts via a secure link — no login required.
            </Txt>
          </View>
        </View>
      )}

      {step === 1 && !estimate && (
        <EmptyState icon="gauge" title="No estimate" body="Go back and calculate an estimate." />
      )}
    </SheetScreen>
  );
}

// ── Location autocomplete via /location/suggest/ ────────────────────────────
function LocationField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    // Clearing/fetching happens inside a timer callback (async), never
    // synchronously in the effect body.
    if (!focused || value.length < 3) {
      timer.current = setTimeout(() => setResults([]), 0);
      return () => {
        if (timer.current) clearTimeout(timer.current);
      };
    }
    timer.current = setTimeout(async () => {
      try {
        const raw = await suggestLocations(value);
        const list = asArray(raw)
          .map((r) =>
            typeof r === 'string' ? r : str(pick(r as Record<string, unknown>, ['label', 'name', 'description', 'address'])),
          )
          .filter(Boolean)
          .slice(0, 6);
        setResults(list);
      } catch {
        setResults([]);
      }
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, focused]);

  return (
    <View>
      <Label className="mb-1.5 text-muted">{label}</Label>
      <View
        className={`min-h-[48px] flex-row items-center gap-2 rounded-xs border bg-surface px-3 ${
          focused ? 'border-accent' : 'border-line'
        }`}
      >
        <Icon name="pin" size={16} color={value ? colors.accent : colors.faint} />
        <TextInput
          className="flex-1 text-body text-fg"
          placeholder={placeholder}
          placeholderTextColor={colors.faint}
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          style={{ paddingVertical: 12 }}
        />
      </View>
      {focused && results.length > 0 && (
        <View className="mt-2 overflow-hidden rounded-xs border border-line bg-surface">
          {results.map((r, i) => (
            <Pressable
              key={`${r}-${i}`}
              onPress={() => {
                onChange(r);
                setResults([]);
              }}
              className="flex-row items-center gap-2.5 border-b border-line-row px-3 py-3 active:bg-surface-hover"
            >
              <Icon name="pin" size={15} color={colors.faint} />
              <Txt className="flex-1 text-sub text-fg">{r}</Txt>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
