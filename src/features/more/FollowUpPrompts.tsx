import { useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { AppSheet, Button, Card, Icon, Txt, Mono } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { useRole } from '@/lib/access';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import { dieselInputFromApi } from '@/features/bookings/quote/rules';
import { useFuelPrice } from '@/features/bookings/api';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import {
  apiMessage,
  confirmBody,
  promptExample,
  promptReference,
  unsetItems,
} from '@/lib/followups';
import {
  patchQuoteAutomation,
  postPricingSetup,
  usePricingSetup,
  useQuoteAutomation,
} from '@/features/bookings/followupsApi';

// Quote follow-ups prompts for admins (FOLLOWUPS-CLIENT-SPEC §1, §6).

const useIsRealAdmin = () => {
  const role = useRole();
  const demo = useAuthStore((s) => !!s.user?.is_demo);
  return role === 'ADMIN' && !demo;
};

/**
 * §1 one-time prompt for existing companies: a sheet on the next app open
 * while `fuel_surcharge_prompt_pending` is true. Either answer clears it;
 * swiping it away asks again on a later open.
 */
export function FuelClausePrompt() {
  const admin = useIsRealAdmin();
  const qc = useQueryClient();
  const { data } = useQuoteAutomation(admin);
  const pending = admin && !!data?.fuel_surcharge_prompt_pending;
  const { data: live } = useFuelPrice();
  const [closed, setClosed] = useState(false);
  const [busy, setBusy] = useState(false);

  const diesel = pending ? dieselInputFromApi(null, live ?? null) : null;
  const reference = diesel
    ? promptReference(diesel.official_price, diesel.zone, diesel.official_effective_from)
    : '';

  const decide = async (on: boolean) => {
    setBusy(true);
    try {
      await patchQuoteAutomation({ fuel_surcharge_enabled: on });
      invalidateFor(qc, 'company');
      toast.success(on ? 'Fuel price clause turned on' : 'Saved. You can turn it on in Settings.');
      setClosed(true);
    } catch (e) {
      toast.error(apiMessage(e, 'Saving failed. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppSheet open={pending && !closed} onClose={() => setClosed(true)}>
      <View className="gap-3 px-5 pb-2 pt-2">
        <Txt className="text-heading font-semibold text-fg">
          Add a fuel price clause to your quotes?
        </Txt>
        <Txt className="text-sub text-muted">
          {`Quotes would say: "${reference}${promptExample(data?.fuel_surcharge_threshold_pct)}"`}{' '}
        </Txt>
        <View className="mt-2 gap-2.5">
          <Button label="Turn on" loading={busy} onPress={() => void decide(true)} fullWidth />
          <Button
            label="Not now"
            variant="secondary"
            disabled={busy}
            onPress={() => void decide(false)}
            fullWidth
          />
        </View>
      </View>
    </AppSheet>
  );
}

/**
 * §6 first-run card: "Check your pricing basics" while setup is needed. One
 * row per unset item (label, what we use, why) with Change, which opens the
 * setting. "These look right" confirms the shown values; "Later" hides the
 * card for good (Settings still shows "Not set yet").
 */
export function PricingSetupCard() {
  const admin = useIsRealAdmin();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const { nav } = useAppNavigation();
  const { data } = usePricingSetup(admin);
  const [busy, setBusy] = useState<'confirm' | 'dismiss' | null>(null);
  const rows = unsetItems(data);
  if (!admin || !data?.needs_setup || rows.length === 0) return null;

  const run = async (kind: 'confirm' | 'dismiss') => {
    setBusy(kind);
    try {
      await postPricingSetup(kind === 'confirm' ? confirmBody(data) : { action: 'dismiss' });
      invalidateFor(qc, 'company');
      toast.success(kind === 'confirm' ? 'Saved' : undefined);
    } catch (e) {
      toast.error(apiMessage(e, 'Saving failed. Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  const change = (key: string) =>
    key === 'fuel_mode'
      ? nav.navigate('Settings', { section: 'company' })
      : nav.navigate('Settings', { section: 'pricing', focus: key });

  return (
    <View className="mb-5">
      <Card>
        <View className="px-4 pb-1 pt-3.5">
          <Txt className="text-callout font-semibold text-fg">
            Check your pricing basics{' '}
            <Txt className="text-sub font-normal text-faint">(2 minutes)</Txt>
          </Txt>
        </View>
        {rows.map((r, i) => (
          <View
            key={r.key}
            className={`flex-row items-start gap-3 px-4 py-3 ${i === rows.length - 1 ? '' : 'border-b border-line-row'}`}
          >
            <View className="flex-1">
              <Txt className="text-sub text-muted">{r.label}</Txt>
              <Mono className="mt-0.5 text-sub font-medium text-fg">{r.display}</Mono>
              <Txt className="mt-1 text-caption text-faint">{r.default_text}</Txt>
            </View>
            <TouchableOpacity
              onPress={() => change(r.key)}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={`Change ${r.label.toLowerCase()}`}
              hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
              className="flex-row items-center gap-0.5 pt-0.5"
            >
              <Mono className="text-sub font-medium text-link">Change</Mono>
              <Icon name="chevronRight" size={12} color={colors.link} />
            </TouchableOpacity>
          </View>
        ))}
        <View className="flex-row gap-2.5 border-t border-line-row px-4 py-3.5">
          <View className="flex-1">
            <Button
              label="These look right"
              loading={busy === 'confirm'}
              disabled={busy !== null}
              onPress={() => void run('confirm')}
              fullWidth
            />
          </View>
          <View className="flex-1">
            <Button
              label="Later"
              variant="secondary"
              loading={busy === 'dismiss'}
              disabled={busy !== null}
              onPress={() => void run('dismiss')}
              fullWidth
            />
          </View>
        </View>
      </Card>
    </View>
  );
}
