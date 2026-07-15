import { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  SheetScreen,
  SectionLabel,
  Group,
  ListRow,
  StatCard,
  StatusPill,
  Button,
  Mono,
  EmptyState,
} from '@/components/ui';
import { ListSkeleton, ErrorState } from '@/components/feedback';
import { useCapital, requestAdvance } from './api';
import { formatCurrency } from '@/lib/formatters';
import { toast } from '@/lib/toast';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'Capital'>;

export function CapitalScreen({ navigation }: Props) {
  const { data, isLoading, isError, refetch } = useCapital();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const request = async (invoiceId: string) => {
    setBusy(invoiceId);
    try {
      await requestAdvance(invoiceId);
      await qc.invalidateQueries({ queryKey: ['capital'] });
      toast.success('Advance requested');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not request advance');
    } finally {
      setBusy(null);
    }
  };

  return (
    <SheetScreen
      eyebrow="Working capital"
      title="Fast Pay Capital"
      onBack={() => navigation.goBack()}
      actionLabel="Risk scores"
      onAction={() => navigation.navigate('RiskScores')}
    >
      {isLoading ? (
        <ListSkeleton />
      ) : isError || !data ? (
        <ErrorState onRetry={refetch} message="Couldn't load capital." />
      ) : (
        <View>
          <View className="mb-5 flex-row gap-3">
            <StatCard label="Eligible" value={String(data.eligible.length)} />
            <StatCard label="Advances" value={String(data.advances.length)} />
          </View>

          <SectionLabel>Eligible invoices</SectionLabel>
          {data.eligible.length === 0 ? (
            <EmptyState icon="dollar" title="Nothing eligible" body="Delivered, unpaid invoices become eligible for Fast Pay." />
          ) : (
            <View className="mb-5 gap-2.5">
              {data.eligible.map((e) => (
                <View key={e.id} className="rounded-xs border border-line bg-surface p-4">
                  <View className="flex-row items-center justify-between">
                    <Mono className="text-body font-medium text-fg">{e.customer}</Mono>
                    <Mono className="text-callout text-muted">{formatCurrency(e.amount, { maximumFractionDigits: 0 })}</Mono>
                  </View>
                  <View className="mt-3 flex-row items-center justify-between">
                    <Mono className="text-caption text-faint">
                      Advance {formatCurrency(e.advance, { maximumFractionDigits: 0 })}
                    </Mono>
                    <View style={{ width: 140 }}>
                      <Button
                        label="Request advance"
                        loading={busy === e.id}
                        onPress={() => request(e.id)}
                        fullWidth
                      />
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          {data.advances.length > 0 && (
            <Group label="Your advances">
              {data.advances.map((a, i) => (
                <ListRow
                  key={a.id}
                  title={formatCurrency(a.amount, { maximumFractionDigits: 0 })}
                  trailing={<StatusPill status={a.status} />}
                  onPress={() => navigation.navigate('AdvanceDetail', { id: a.id })}
                  last={i === data.advances.length - 1}
                />
              ))}
            </Group>
          )}
        </View>
      )}
    </SheetScreen>
  );
}
