import { useEffect, useState } from 'react';
import { View, Pressable, Linking } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, SectionLabel, StatCard, Button, Badge, Mono, EmptyState } from '@/components/ui';
import { ListSkeleton, ErrorState } from '@/components/feedback';
import { useCapital } from './api';
import { loadAppliedIds, saveAppliedId, MERCHANT_CAPITAL_URL } from '@/features/finance/fastpay';
import { formatCurrency } from '@/lib/formatters';
import { useTheme } from '@/theme/ThemeProvider';
import { status as statusHues } from '@/theme/tokens';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'Capital'>;

// Same thresholds the web facility meter uses.
const meterColor = (utilization: number, accent: string) =>
  utilization > 90 ? statusHues.danger : utilization > 75 ? statusHues.warning : accent;

export function CapitalScreen({ navigation }: Props) {
  const { data, isLoading, isError, refetch } = useCapital();
  const { colors } = useTheme();
  const [showIneligible, setShowIneligible] = useState(false);
  const [applied, setApplied] = useState<Set<string>>(new Set());

  useEffect(() => {
    void loadAppliedIds().then(setApplied);
  }, []);

  // Applications happen on Merchant Capital's own site — there's nothing on
  // our backend to record, so this just flags the row and hands off.
  const applyForCapital = async (invoiceId: string) => {
    setApplied(await saveAppliedId(invoiceId));
    await Linking.openURL(MERCHANT_CAPITAL_URL);
  };

  return (
    <SheetScreen
      eyebrow="Working capital"
      title="Fast Pay Capital"
      onBack={() => navigation.goBack()}
      actionLabel="Risk scores"
      actionIcon="alert"
      onAction={() => navigation.navigate('RiskScores')}
    >
      {isLoading ? (
        <ListSkeleton />
      ) : isError || !data ? (
        <ErrorState onRetry={refetch} message="Couldn't load capital." />
      ) : (
        <View>
          {/* Same four tiles as the web Capital page. The first two need the
              facility, which mobile previously never fetched. */}
          <View className="mb-3 flex-row gap-3">
            <StatCard
              label="Available"
              value={formatCurrency(data.facility?.available ?? 0, { maximumFractionDigits: 0 })}
              sub={data.facility ? `of ${formatCurrency(data.facility.limit, { maximumFractionDigits: 0 })} limit` : 'no facility'}
            />
            <StatCard
              label="In use"
              value={formatCurrency(data.facility?.outstanding ?? 0, { maximumFractionDigits: 0 })}
              sub={data.facility ? `${Math.round(data.facility.utilization)}% utilization` : undefined}
            />
          </View>
          <View className="mb-5 flex-row gap-3">
            <StatCard label="Eligible invoices" value={String(data.eligibleCount || data.eligible.length)} sub="ready for Fast Pay" />
            <StatCard
              label="Eligible value"
              value={formatCurrency(data.eligibleValue, { maximumFractionDigits: 0 })}
              sub="total available"
            />
          </View>

          {data.facility && (
            <View className="mb-5 rounded-xs border border-line bg-surface p-4">
              <View className="mb-2.5 flex-row items-center justify-between">
                <Mono className="text-micro tracking-wide uppercase text-faint">Facility meter</Mono>
                <Mono className="text-micro tracking-wide uppercase text-muted">
                  {Math.round(data.facility.utilization)}% used
                </Mono>
              </View>
              <View className="h-2 overflow-hidden rounded-pill bg-surface-hover">
                <View
                  style={{
                    width: `${Math.min(100, Math.max(0, data.facility.utilization))}%`,
                    height: '100%',
                    backgroundColor: meterColor(data.facility.utilization, colors.accent),
                  }}
                />
              </View>
            </View>
          )}

          {/* Same partnership banner as web — Fast Pay hands off to Merchant
              Capital's own site rather than creating an in-app advance. */}
          <View
            className="mb-5 rounded-xs border border-line bg-surface p-4"
            style={{ borderLeftWidth: 3, borderLeftColor: colors.accent }}
          >
            <Mono className="text-caption font-medium text-fg">Fast Pay powered by Merchant Capital</Mono>
            <Mono className="mt-1 text-micro text-faint">
              Get paid faster on your eligible invoices. Apply via our trusted lending partner — approval in
              minutes.
            </Mono>
          </View>

          <SectionLabel>Eligible invoices</SectionLabel>
          {data.eligible.length === 0 ? (
            <EmptyState icon="dollar" title="Nothing eligible" body="Complete deliveries with a POD to unlock Fast Pay." />
          ) : (
            <View className="mb-5 gap-2.5">
              {data.eligible.map((e) => (
                <View key={e.id} className="rounded-xs border border-line bg-surface p-4">
                  <View className="flex-row items-center justify-between">
                    <Mono className="text-body font-medium text-fg">{e.customer}</Mono>
                    <Mono className="text-callout text-muted">{formatCurrency(e.amount, { maximumFractionDigits: 0 })}</Mono>
                  </View>
                  {(e.invoiceNumber || e.tier) && (
                    <View className="mt-1 flex-row items-center gap-2">
                      {!!e.invoiceNumber && <Mono className="text-micro text-faint">{e.invoiceNumber}</Mono>}
                      {!!e.tier && <Badge label={e.tier.toUpperCase()} tone="info" />}
                    </View>
                  )}
                  <View className="mt-3 flex-row items-center justify-between">
                    <Mono className="text-caption text-faint">
                      Advance {formatCurrency(e.advance, { maximumFractionDigits: 0 })}
                    </Mono>
                    {e.riskBlocked ? (
                      // Customer risk above the 70% limit — the backend will
                      // refuse this one, so don't offer the action.
                      <Badge label="High risk" tone="danger" />
                    ) : applied.has(String(e.id)) ? (
                      <Badge label="Applied" tone="success" dot />
                    ) : (
                      <Button label="Apply" size="sm" onPress={() => applyForCapital(String(e.id))} />
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Why the rest didn't qualify — reasons come from the risk engine. */}
          {data.ineligible.length > 0 && (
            <>
              <Pressable onPress={() => setShowIneligible((v) => !v)} hitSlop={8} className="mb-2.5">
                <Mono className="text-caption text-accent">
                  {showIneligible ? '▲ Hide reasons' : `▼ Show reasons (${data.ineligible.length})`}
                </Mono>
              </Pressable>
              {showIneligible && (
                <View className="mb-5 gap-2.5">
                  {data.ineligible.map((e) => (
                    <View key={e.id} className="rounded-xs border border-line bg-surface p-3.5">
                      <View className="flex-row items-center justify-between">
                        <Mono className="text-caption font-medium text-fg">{e.customer}</Mono>
                        <Mono className="text-caption text-muted">
                          {formatCurrency(e.amount, { maximumFractionDigits: 0 })}
                        </Mono>
                      </View>
                      <Mono className="mt-1.5 text-micro text-faint">{e.reason}</Mono>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </View>
      )}
    </SheetScreen>
  );
}
