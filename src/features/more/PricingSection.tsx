import { useEffect, useState, type ReactNode } from 'react';
import { View, Alert, TextInput } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Group, Toggle, Txt, Mono, Badge, Button, TextField, Label, Card } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { useRole } from '@/lib/access';
import { useDemo } from '@/hooks/useDemo';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import { num, pick } from '@/lib/api/list';
import { parseNum } from '@/lib/formatters';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import {
  apiMessage,
  automationChangeLines,
  automationPatch,
  boundError,
  boundText,
  boundValue,
  fieldErrors,
  type QuoteAutomation,
} from '@/lib/followups';
import { useCompanyProfile, updateCompanyProfile } from './api';
import {
  patchQuoteAutomation,
  usePricingSetup,
  useQuoteAutomation,
} from '@/features/bookings/followupsApi';

// Settings → Pricing: the pricing basics (target margin, operating cost,
// driver allowance, fuel price) and the "Quote follow-ups" card
// (FOLLOWUPS-CLIENT-SPEC §1, §6). Admins edit; everyone else reads. Every
// change to pricing settings is confirmed before it is saved.

export function PricingSection({ focus }: { focus?: string }) {
  return (
    <View className="gap-2">
      <PricingBasics focus={focus} />
      <QuoteFollowUpsCard />
    </View>
  );
}

// ── Pricing basics ──────────────────────────────────────────────────────────

type BasicKey = 'margin_target_pct' | 'operating_cost_per_km' | 'driver_allowance_per_night';

const BASICS: {
  key: BasicKey;
  item: string;
  label: string;
  prefix?: string;
  suffix?: string;
  optional: boolean;
}[] = [
  { key: 'margin_target_pct', item: 'target_margin', label: 'Target margin (%)', optional: false },
  {
    key: 'operating_cost_per_km',
    item: 'operating_cost',
    label: 'Operating cost per km',
    prefix: 'R',
    optional: true,
  },
  {
    key: 'driver_allowance_per_night',
    item: 'driver_allowance',
    label: 'Driver allowance per night',
    prefix: 'R',
    optional: true,
  },
];

const SUMMARY: Record<BasicKey, (v: number | null) => string> = {
  margin_target_pct: (v) => `Target margin: ${v == null ? 'not set' : `${boundText(v)}%`}`,
  operating_cost_per_km: (v) =>
    `Operating cost: ${v == null ? 'standard estimate' : `R ${boundText(v)}/km`}`,
  driver_allowance_per_night: (v) =>
    `Driver allowance: ${v == null ? 'approved allowance' : `R ${boundText(v)} a night`}`,
};

const storedNum = (v: unknown): number | null => (v == null || v === '' ? null : num(v));

function PricingBasics({ focus }: { focus?: string }) {
  const role = useRole();
  const admin = role === 'ADMIN';
  const demo = useDemo();
  const qc = useQueryClient();
  const { nav } = useAppNavigation();
  const { data: company } = useCompanyProfile();
  const { data: setup } = usePricingSetup();
  const [draft, setDraft] = useState<Record<BasicKey, string> | null>(null);
  const [errors, setErrors] = useState<Partial<Record<BasicKey, string>>>({});
  const [busy, setBusy] = useState(false);

  const stored = (k: BasicKey) => storedNum(pick(company ?? {}, [k]));
  useEffect(() => {
    if (company && !draft) {
      setDraft({
        margin_target_pct: boundText(storedNum(company.margin_target_pct)),
        operating_cost_per_km: boundText(storedNum(company.operating_cost_per_km)),
        driver_allowance_per_night: boundText(storedNum(company.driver_allowance_per_night)),
      });
    }
  }, [company, draft]);

  const item = (key: string) => setup?.items?.find((i) => i.key === key);
  const notSet = (key: string) => !!setup && item(key)?.set === false;

  const save = () => {
    if (!draft || demo.block()) return;
    const patch: Record<string, number | null> = {};
    const errs: Partial<Record<BasicKey, string>> = {};
    for (const b of BASICS) {
      const raw = draft[b.key].trim();
      const value = raw === '' ? null : parseNum(raw);
      if (raw !== '' && value === null) {
        errs[b.key] = 'Enter a number.';
        continue;
      }
      if (value === null && !b.optional) {
        errs[b.key] = 'Enter your target margin.';
        continue;
      }
      if (value !== stored(b.key)) patch[b.key] = value;
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const keys = Object.keys(patch) as BasicKey[];
    if (!keys.length) {
      toast.info('Nothing changed');
      return;
    }
    Alert.alert(
      'Save changes?',
      `${keys.map((k) => SUMMARY[k](patch[k] ?? null)).join('\n')}\n\nNew quotes use these.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: async () => {
            setBusy(true);
            try {
              await updateCompanyProfile(patch);
              invalidateFor(qc, 'company');
              setDraft(null);
              toast.success('Saved');
            } catch (e) {
              const data = (e as { data?: unknown }).data as Record<string, unknown> | undefined;
              const fe: Partial<Record<BasicKey, string>> = {};
              for (const b of BASICS) {
                const m = data?.[b.key];
                const msg = Array.isArray(m) ? m[0] : m;
                if (typeof msg === 'string') fe[b.key] = msg;
              }
              setErrors(fe);
              toast.error(
                Object.keys(fe).length
                  ? 'Check the highlighted fields'
                  : apiMessage(e, (e as Error).message),
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const fuel = item('fuel_mode');

  // Other roles can't read the company profile (403): what quotes use, read-only.
  if (!admin) {
    const items = setup?.items ?? [];
    if (!items.length) return null;
    return (
      <Group label="Pricing basics">
        {items.map((it, i) => (
          <View
            key={it.key}
            className={`flex-row items-start justify-between gap-3 px-3.5 py-3 ${
              i === items.length - 1 ? '' : 'border-b border-line-row'
            }`}
          >
            <View className="flex-1">
              <Txt className="text-callout text-muted">{it.label}</Txt>
              {!it.set && (
                <View className="mt-1">
                  <Badge label="Not set yet" tone="warning" dot />
                </View>
              )}
            </View>
            <Txt className="max-w-[55%] text-right text-sub font-medium text-fg">{it.display}</Txt>
          </View>
        ))}
      </Group>
    );
  }

  return (
    <Group label="Pricing basics">
      <View className="gap-3 px-3.5 py-3.5">
        {BASICS.map((b) => {
          const it = item(b.item);
          return (
            <View key={b.key}>
              <TextField
                label={b.label}
                prefix={b.prefix}
                placeholder={it?.display ?? ''}
                keyboardType="decimal-pad"
                editable={admin && !busy}
                autoFocus={admin && focus === b.item}
                value={draft?.[b.key] ?? ''}
                onChangeText={(v) => {
                  setDraft((d) => (d ? { ...d, [b.key]: v } : d));
                  if (errors[b.key]) setErrors((e) => ({ ...e, [b.key]: undefined }));
                }}
                error={errors[b.key]}
              />
              {notSet(b.item) && (
                <View className="mt-1.5 flex-row flex-wrap items-center gap-2">
                  <Badge label="Not set yet" tone="warning" dot />
                  {it?.default_text ? (
                    <Txt className="flex-1 text-caption text-faint">{it.default_text}</Txt>
                  ) : null}
                </View>
              )}
            </View>
          );
        })}
        <View>
          <Label className="mb-1.5 text-sub text-muted">Fuel price</Label>
          <View className="flex-row items-center justify-between gap-3">
            <Txt className="flex-1 text-callout text-fg">
              {fuel?.display ?? 'Set in Company details'}
            </Txt>
            {admin && (
              <Button
                label="Change"
                size="sm"
                variant="secondary"
                onPress={() => nav.push('Settings', { section: 'company' })}
              />
            )}
          </View>
          {fuel && notSet('fuel_mode') && (
            <View className="mt-1.5">
              <Badge label="Not set yet" tone="warning" dot />
            </View>
          )}
        </View>
        {admin ? (
          <Button label="Save changes" loading={busy} disabled={!draft} onPress={save} fullWidth />
        ) : (
          <Txt className="text-caption text-faint">Only a company admin can change these.</Txt>
        )}
      </View>
    </Group>
  );
}

// ── Quote follow-ups card ─────────────────────────────────────────────────

type BoundKey = 'fuel_surcharge_threshold_pct' | 'follow_up_after_days' | 'expiry_nudge_days';
type BoolKey =
  | 'fuel_surcharge_enabled'
  | 'fuel_alerts_enabled'
  | 'follow_ups_enabled'
  | 'weekly_margin_email_enabled';

export function QuoteFollowUpsCard() {
  const { colors } = useTheme();
  const role = useRole();
  const admin = role === 'ADMIN';
  const demo = useDemo();
  const qc = useQueryClient();
  const { data: saved, isError, refetch } = useQuoteAutomation();
  const [flags, setFlags] = useState<Pick<QuoteAutomation, BoolKey> | null>(null);
  const [boxes, setBoxes] = useState<Record<BoundKey, string> | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (saved && (!flags || !boxes)) {
      setFlags({
        fuel_surcharge_enabled: saved.fuel_surcharge_enabled,
        fuel_alerts_enabled: saved.fuel_alerts_enabled,
        follow_ups_enabled: saved.follow_ups_enabled,
        weekly_margin_email_enabled: saved.weekly_margin_email_enabled,
      });
      setBoxes({
        fuel_surcharge_threshold_pct: boundText(saved.fuel_surcharge_threshold_pct),
        follow_up_after_days: boundText(saved.follow_up_after_days),
        expiry_nudge_days: boundText(saved.expiry_nudge_days),
      });
    }
  }, [saved, flags, boxes]);

  if (isError && !saved) {
    return (
      <Group label="Quote follow-ups">
        <View className="gap-2 px-3.5 py-3.5">
          <Txt className="text-sub text-muted">{"Couldn't load these settings."}</Txt>
          <Button label="Try again" size="sm" variant="secondary" onPress={() => void refetch()} />
        </View>
      </Group>
    );
  }
  if (!saved || !flags || !boxes) return null;

  const setFlag = (k: BoolKey, v: boolean) => setFlags((f) => (f ? { ...f, [k]: v } : f));
  const setBox = (k: BoundKey, v: string) => {
    setBoxes((b) => (b ? { ...b, [k]: v } : b));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };

  const save = () => {
    if (demo.block()) return;
    // Only a changed box is checked: an unchanged stored value always saves.
    const errs: Record<string, string> = {};
    const draft: QuoteAutomation = { ...saved, ...flags };
    for (const k of Object.keys(boxes) as BoundKey[]) {
      if (boxes[k].trim() === boundText(saved[k])) continue;
      const err = boundError(k, boxes[k]);
      if (err) errs[k] = err;
      else draft[k] = boundValue(boxes[k]);
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const patch = automationPatch(saved, draft);
    const lines = automationChangeLines(saved, patch);
    if (!lines.length) {
      toast.info('Nothing changed');
      return;
    }
    Alert.alert('Save changes?', lines.join('\n'), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Save',
        onPress: async () => {
          setBusy(true);
          try {
            await patchQuoteAutomation(patch);
            invalidateFor(qc, 'company');
            setFlags(null);
            setBoxes(null);
            toast.success('Saved');
          } catch (e) {
            const fe = fieldErrors(e);
            setErrors(fe);
            toast.error(apiMessage(e, (e as Error).message || 'Could not save'));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const row = (key: BoolKey, label: string, helper: string, last: boolean, extra?: ReactNode) => (
    <View className={`gap-2 px-3.5 py-3.5 ${last ? '' : 'border-b border-line-row'}`}>
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <Txt className="text-callout text-fg">{label}</Txt>
          {helper ? <Txt className="mt-0.5 text-caption text-faint">{helper}</Txt> : null}
        </View>
        <Toggle
          value={flags[key]}
          onValueChange={(v) => setFlag(key, v)}
          disabled={!admin || busy}
        />
      </View>
      {extra}
    </View>
  );

  const box = (k: BoundKey, before: string, after: string, enabled: boolean) => (
    <View>
      <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
        <Txt className="text-sub text-muted">{before}</Txt>
        <TextInput
          value={boxes[k]}
          onChangeText={(v) => setBox(k, v)}
          editable={admin && enabled && !busy}
          keyboardType={k === 'fuel_surcharge_threshold_pct' ? 'decimal-pad' : 'number-pad'}
          accessibilityLabel={`${before} ${after}`.trim()}
          maxLength={5}
          className="rounded-control border px-2 text-center text-sub text-fg"
          style={{
            minWidth: 52,
            height: 36,
            borderColor: errors[k] ? colors.danger : colors.lineControl,
            backgroundColor: colors.inputBg,
            opacity: admin && enabled ? 1 : 0.6,
          }}
        />
        <Txt className="text-sub text-muted">{after}</Txt>
      </View>
      {errors[k] ? <Mono className="mt-1 text-caption text-danger">{errors[k]}</Mono> : null}
    </View>
  );

  const anyError = (keys: string[]) =>
    keys
      .map((k) => errors[k])
      .filter(Boolean)
      .map((m) => (
        <Mono key={m} className="text-caption text-danger">
          {m}
        </Mono>
      ));

  return (
    <View className="mb-5">
      <Label className="mb-2.5">Quote follow-ups</Label>
      <Card>
        {row(
          'fuel_surcharge_enabled',
          'Fuel price clause on quotes',
          'Your quotes say the diesel price they were priced on. If the official price moves more than this before the trip, the invoice adds or takes off the difference.',
          false,
          <>
            {box(
              'fuel_surcharge_threshold_pct',
              'Change the fuel part when the official price moves more than',
              '%',
              flags.fuel_surcharge_enabled,
            )}
            {anyError(['fuel_surcharge_enabled'])}
          </>,
        )}
        {row(
          'fuel_alerts_enabled',
          'Fuel price alerts',
          'Tell us when a new official price affects open quotes.',
          false,
          anyError(['fuel_alerts_enabled']),
        )}
        {row(
          'follow_ups_enabled',
          'Follow-up reminders',
          '',
          !admin,
          <>
            {box(
              'follow_up_after_days',
              'Remind me after',
              'days with no answer',
              flags.follow_ups_enabled,
            )}
            {box(
              'expiry_nudge_days',
              'and',
              'days before a quote expires',
              flags.follow_ups_enabled,
            )}
            {anyError(['follow_ups_enabled'])}
          </>,
        )}
        {admin &&
          row(
            'weekly_margin_email_enabled',
            'Weekly margin email',
            'Mondays at 07:00. Sent to admins.',
            true,
            anyError(['weekly_margin_email_enabled']),
          )}
      </Card>
      <View className="mt-3">
        {admin ? (
          <Button label="Save quote follow-ups" loading={busy} onPress={save} fullWidth />
        ) : (
          <Txt className="text-caption text-faint">Only a company admin can change these.</Txt>
        )}
      </View>
    </View>
  );
}
