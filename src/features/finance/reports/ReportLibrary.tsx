import { RefreshControl, ScrollView, TouchableOpacity, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Card, Icon, InfoTip, Mono, Txt } from '@/components/ui';
import { ErrorState, ListSkeleton } from '@/components/feedback';
import { useManualRefresh } from '@/hooks/useManualRefresh';
import { day } from '@/lib/ledger';
import { useLedger } from '@/lib/useLedger';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { useTheme } from '@/theme/ThemeProvider';
import { GROUPS, LIBRARY_NEEDS, REPORTS, keyFigure } from './library';
import { Partial } from './ui';

/**
 * Finance > Reports: a library of accountant-grade statements built from the
 * records TruckWys holds (invoices, payments, expenses, loads). Each row names
 * the report, says what it answers, and gives its headline for the last 12
 * months and the newest entry behind it. Port of the web's ReportLibrary.
 * Reports say what happened; forecasts and recommendations live in Insights.
 */
export function ReportLibrary() {
  const { colors } = useTheme();
  const { nav } = useAppNavigation();
  const ledger = useLedger([...LIBRARY_NEEDS]);
  const queryClient = useQueryClient();
  const { refreshing, onRefresh } = useManualRefresh(() =>
    Promise.all(LIBRARY_NEEDS.map((k) => queryClient.refetchQueries({ queryKey: [`ledger-${k}`] }))),
  );
  const d = ledger.data;

  if (ledger.error && !d) return <ErrorState onRetry={ledger.retry} message="Couldn't load reports." />;

  // The list is useful before the figures arrive: rows render at once with a
  // placeholder, and fill in when the ledgers have loaded.
  const list = GROUPS.flatMap((g) => REPORTS.filter((r) => r.group === g));

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 150 }}
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
      <View className="mb-3 flex-row items-center gap-2">
        <Txt className="flex-1 text-caption text-faint">Reconciled to your invoices, payments and expenses</Txt>
        <InfoTip
          label="About these figures"
          text={
            'Each figure is the report’s headline for its default period, the last 12 months. Open a report to change the period or basis.\n\nReports say what happened, reconciled to your invoices, payments and expenses. Forecasts are in Insights.'
          }
        />
      </View>
      {d && <Partial notes={d.partial} />}
      {ledger.loading && !d ? (
        <ListSkeleton rows={6} />
      ) : (
        <Card>
          {list.map((r, i) => {
            const latest = d ? r.latest(d) : undefined;
            const k = d ? keyFigure(r.id, d) : null;
            return (
              <TouchableOpacity
                key={r.id}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${r.title}. ${r.purpose}`}
                onPress={() => nav.navigate('FinanceReport', { report: r.id })}
                className={`min-h-[72px] flex-row items-center gap-3 px-4 py-3 ${
                  i === list.length - 1 ? '' : 'border-b border-line-row'
                }`}
              >
                <View className="flex-1">
                  <Txt className="text-body font-medium text-fg" numberOfLines={1}>
                    {r.title}
                  </Txt>
                  <Txt className="mt-0.5 text-caption text-muted" numberOfLines={2}>
                    {r.purpose}
                  </Txt>
                </View>
                <View className="items-end" style={{ maxWidth: 132 }}>
                  {k ? (
                    <>
                      <Mono className="text-body font-medium">{k.value}</Mono>
                      <Txt className="text-right text-micro text-faint" numberOfLines={2}>
                        {k.caption}
                      </Txt>
                    </>
                  ) : (
                    <Txt className="text-right text-micro text-faint" numberOfLines={2}>
                      {d ? 'Nothing in the last 12 months' : ''}
                    </Txt>
                  )}
                  {latest ? (
                    <Txt className="mt-0.5 text-right text-micro text-faint" numberOfLines={1}>
                      {`Latest ${day(latest)}`}
                    </Txt>
                  ) : null}
                </View>
                <Icon name="chevronRight" size={16} color={colors.faint} />
              </TouchableOpacity>
            );
          })}
        </Card>
      )}
    </ScrollView>
  );
}
