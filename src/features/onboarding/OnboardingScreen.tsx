import { useEffect, useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AmbientGlow, Txt, Mono, TextField, SelectField, Button } from '@/components/ui';
import { ListSkeleton } from '@/components/feedback';
import { useCompanyProfile, updateCompanyProfile } from '@/features/more/api';
import { INDUSTRY_OPTIONS } from '@/lib/companyOptions';
import { pick, str } from '@/lib/api/list';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { useAuthStore } from '@/stores/authStore';
import type { AppStackParamList } from '@/navigation/types';
import { ImportPanel } from '@/features/import/ImportPanel';
import { companyIdOf, markOnboardingDone } from './onboardingStorage';

type Props = NativeStackScreenProps<AppStackParamList, 'Onboarding'>;
type Step = 1 | 2 | 3 | 4;

export function OnboardingScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { createQuote } = useAppNavigation();
  const user = useAuthStore((s) => s.user);
  const { data: profile, isLoading: loadingProfile } = useCompanyProfile();

  const [step, setStep] = useState<Step>(1);
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('general_freight');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [customersImported, setCustomersImported] = useState(0);
  const [vehiclesImported, setVehiclesImported] = useState(0);

  useEffect(() => {
    if (!profile) return;
    setCompanyName(str(pick(profile, ['company_name', 'name'])));
    setIndustry(str(pick(profile, ['industry']), 'general_freight'));
    const contact = (pick(profile, ['contact']) ?? {}) as Record<string, unknown>;
    setPhone(str(pick(contact, ['phone'])));
  }, [profile]);

  // Finishing and skipping both end the wizard the same way: mark it done —
  // server-side so it stays done everywhere, and locally so a slow or failed
  // PATCH can't reopen it on this device — then land on the tabs.
  const finish = () => {
    const companyId = companyIdOf(user);
    void markOnboardingDone(companyId);
    updateCompanyProfile({ onboarding_completed_at: new Date().toISOString() })
      .then(() => invalidateFor(qc, 'company'))
      .catch(() => {
        // The local flag above still covers this device for this session.
      });
    navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
  };

  const handleStep1Submit = async () => {
    if (!companyName.trim()) {
      toast.error('Please enter a company name');
      return;
    }
    setSubmitting(true);
    try {
      await updateCompanyProfile({
        company_name: companyName.trim(),
        industry,
        contact: { phone: phone.trim() },
      });
      invalidateFor(qc, 'company');
      setStep(2);
    } catch {
      toast.error('Failed to save company details');
    } finally {
      setSubmitting(false);
    }
  };

  const totalImported = customersImported + vehiclesImported;
  const summaryBits = [
    customersImported > 0 ? `${customersImported} customer${customersImported === 1 ? '' : 's'}` : null,
    vehiclesImported > 0 ? `${vehiclesImported} vehicle${vehiclesImported === 1 ? '' : 's'}` : null,
  ].filter(Boolean);

  return (
    <View className="flex-1 bg-bg-deep">
      <AmbientGlow />

      {/* A grid, not space-between: the step count stays centred whether or
          not Back is showing, instead of shifting as it appears. */}
      <View className="px-screen" style={{ paddingTop: insets.top + 12 }}>
        <View className="mb-2 flex-row items-center justify-between">
          <View style={{ minWidth: 64 }}>
            {step > 1 && step < 4 && (
              <TouchableOpacity onPress={() => setStep((s) => (s - 1) as Step)} hitSlop={8}>
                <Mono className="text-micro uppercase tracking-wide text-faint">← Back</Mono>
              </TouchableOpacity>
            )}
          </View>
          <Mono className="text-micro uppercase tracking-wide text-faint">STEP {step} OF 4</Mono>
          {/* Kept empty (not removed) so "STEP n OF 4" stays centred against
              the Back slot on the left. Every step's own way to skip lives
              in its body now, as a real button, instead of up here. */}
          <View style={{ minWidth: 64, alignItems: 'flex-end' }} />
        </View>
        <View className="h-1 overflow-hidden rounded-full bg-line">
          <View className="h-full rounded-full bg-accent" style={{ width: `${(step / 4) * 100}%` }} />
        </View>
      </View>

      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={40}
        showsVerticalScrollIndicator={false}
      >
        {step === 1 && (
          <View className="gap-4">
            <View className="mb-1">
              <Txt className="text-heading font-semibold text-fg">Welcome to Truckwys</Txt>
              <Txt className="mt-1 text-callout text-muted">Let&apos;s get your company set up</Txt>
            </View>
            {loadingProfile ? (
              <ListSkeleton rows={3} />
            ) : (
              <>
                <TextField
                  label="Company name"
                  required
                  value={companyName}
                  onChangeText={setCompanyName}
                  placeholder="ACME Logistics (Pty) Ltd"
                  autoFocus
                />
                <SelectField label="Industry" options={INDUSTRY_OPTIONS} value={industry} onSelect={setIndustry} />
                <TextField
                  label="Phone"
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+27 11 123 4567"
                  keyboardType="phone-pad"
                />
                <Button label="Continue" onPress={handleStep1Submit} loading={submitting} fullWidth />
                <Button
                  label="Set up later"
                  variant="secondary"
                  fullWidth
                  onPress={finish}
                  disabled={submitting}
                />
              </>
            )}
          </View>
        )}

        {step === 2 && (
          <ImportStep
            title="Import your customers"
            blurb="Already have them in a spreadsheet? Paste the list straight in — we work out which column is which. You can always add them later instead."
            entity="customers"
            onImported={(n) => {
              setCustomersImported((c) => c + n);
              setStep(3);
            }}
            onSkip={() => setStep(3)}
          />
        )}

        {step === 3 && (
          <ImportStep
            title="Import your fleet"
            blurb="Paste your vehicle list the same way. Registration, type and capacity are what a quote needs; anything else you have is a bonus."
            entity="vehicles"
            onImported={(n) => {
              setVehiclesImported((c) => c + n);
              setStep(4);
            }}
            onSkip={() => setStep(4)}
          />
        )}

        {step === 4 && (
          <View className="items-center">
            <Txt style={{ fontSize: 56 }}>🚛</Txt>
            <Txt className="mt-4 text-heading font-semibold text-fg">You&apos;re all set!</Txt>
            <Txt className="mb-8 mt-2 text-center text-callout text-muted">
              {totalImported > 0
                ? `${summaryBits.join(' and ')} imported. Jump in and price your first load — you can add more any time from the app.`
                : 'Your business is ready. Jump in and create your first quote — you can import your customers and fleet any time from the app.'}
            </Txt>
            <Button label="Go to dashboard" onPress={finish} fullWidth />
            {/* Vehicles were just offered as their own step, so pointing back
                at Fleet here asked again for something already answered. */}
            <View className="mt-3 w-full">
              <Button
                label="+ Create a quote"
                variant="secondary"
                fullWidth
                onPress={() => {
                  finish();
                  createQuote();
                }}
              />
            </View>
          </View>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

function ImportStep({
  title,
  blurb,
  entity,
  onImported,
  onSkip,
}: {
  title: string;
  blurb: string;
  entity: 'customers' | 'vehicles';
  onImported: (imported: number) => void;
  /** The only way past this step besides importing — there's no header skip
   *  on steps 2/3, so this bordered button carries the whole affordance. */
  onSkip: () => void;
}) {
  return (
    <ImportPanel entity={entity} blurb={blurb} onImported={(res) => onImported(res.imported)}>
      {({ body, footer }) => (
        <View className="gap-4">
          <Txt className="text-heading font-semibold text-fg">{title}</Txt>
          {body}
          <View>{footer}</View>
          <Button label="Skip for now" variant="secondary" fullWidth onPress={onSkip} />
        </View>
      )}
    </ImportPanel>
  );
}
