import { useState } from 'react';
import { RefreshControl, ScrollView, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, Button, Card, EmptyState, Icon, Mono, SectionLabel, Txt } from '@/components/ui';
import { ErrorState, ListSkeleton } from '@/components/feedback';
import { useManualRefresh } from '@/hooks/useManualRefresh';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { useTheme } from '@/theme/ThemeProvider';
import { FindingCard } from './FindingCard';
import { SummaryTiles } from './SummaryTiles';
import { useFindings } from './useFindings';
import { useOpenTarget } from './useOpenTarget';

/**
 * Insights > Findings: a ranked feed of what to change and what it is worth,
 * worked out on the device from the full ledgers. Each finding has a rand
 * figure and one action. Reads only.
 */
export function FindingsTab() {
  const f = useFindings();
  const { refreshing, onRefresh } = useManualRefresh(f.refetch);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const open = useOpenTarget();
  const { nav } = useAppNavigation();
  const [checkingOpen, setCheckingOpen] = useState(false);

  if (f.loading) {
    return (
      <View className="p-screen">
        <ListSkeleton rows={4} />
      </View>
    );
  }
  if (f.error || !f.result) return <ErrorState onRetry={f.retry} message="Couldn't load your findings." />;

  const { findings, summary, hasRecords } = f.result;
  const main = findings.filter((x) => x.confidence !== 'low');
  const checking = findings.filter((x) => x.confidence === 'low');
  const scaleTo = Math.max(0, ...findings.map((x) => x.amount));

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: insets.bottom + 24,
        flexGrow: 1,
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.faint}
          colors={[colors.faint]}
          progressBackgroundColor={colors.surface}
        />
      }
    >
      {!hasRecords ? (
        <EmptyState
          icon="sparkle"
          title="No findings yet"
          body="Findings appear once you invoice your first load."
          action={<Button label="Create an invoice" onPress={() => nav.navigate('CreateInvoice')} />}
        />
      ) : (
        <>
          {main.length > 0 && <SummaryTiles findings={main} summary={summary} />}

          {main.length === 0 ? (
            <Card className="items-center px-6 py-8">
              <Icon name="checkCircle" size={26} color={colors.faint} />
              <Txt className="mt-3 text-center text-callout text-muted">
                {f.notes.length > 0
                  ? 'Nothing needs you in the records we could check.'
                  : 'Nothing needs you. Every invoice is sent, chased and on time.'}
              </Txt>
              <TouchableOpacity
                onPress={() => open({ kind: 'invoices' })}
                activeOpacity={0.7}
                accessibilityRole="button"
                className="mt-4 min-h-[44px] justify-center px-3"
              >
                <Mono className="text-caption font-medium text-link">See invoices</Mono>
              </TouchableOpacity>
            </Card>
          ) : (
            <>
              <SectionLabel>Ranked by value</SectionLabel>
              <Txt className="-mt-1 mb-3 text-caption text-faint">
                Largest rand value first. Each finding needs at least R 1 000 and a clear trigger in
                your records. Findings can share an invoice, so card values are not added together.
              </Txt>
              {main.map((x) => (
                <FindingCard key={x.id} finding={x} scaleTo={scaleTo} onOpen={open} />
              ))}
            </>
          )}

          {checking.length > 0 && (
            <View className="mt-2">
              <TouchableOpacity
                onPress={() => setCheckingOpen((o) => !o)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ expanded: checkingOpen }}
                className="mb-3 min-h-[44px] flex-row items-center gap-2"
              >
                <Mono className="text-caption font-medium text-faint">Worth checking</Mono>
                <Badge label={String(checking.length)} tone="neutral" />
                <View className="flex-1" />
                <Icon name={checkingOpen ? 'chevronUp' : 'chevronDown'} size={14} color={colors.faint} />
              </TouchableOpacity>
              {checkingOpen &&
                checking.map((x) => (
                  <FindingCard key={x.id} finding={x} scaleTo={scaleTo} onOpen={open} />
                ))}
            </View>
          )}

          {f.notes.map((n) => (
            <Txt key={n} className="mt-2 text-caption text-faint">
              {n}
            </Txt>
          ))}
        </>
      )}
    </ScrollView>
  );
}
