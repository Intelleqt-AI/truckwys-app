import { View, TouchableOpacity } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, Card, Txt, Mono, Badge, Icon, EmptyState } from '@/components/ui';
import { DetailSkeleton, NotFoundState } from '@/components/feedback';
import { useTheme } from '@/theme/ThemeProvider';
import { useManualRefresh } from '@/hooks/useManualRefresh';
import {
  alertPriceLine,
  apiMessage,
  marginChange,
  sortAlertQuotes,
  statusWord,
} from '@/lib/followups';
import type { AppStackParamList } from '@/navigation/types';
import { useFuelAlert } from './followupsApi';

type Props = NativeStackScreenProps<AppStackParamList, 'FuelAlert'>;

// A fuel price change alert (FOLLOWUPS-CLIENT-SPEC §3), opened from the push
// or the bell: the open quotes it affects, under-target ones first. A tap opens
// the quote, where the reopen notice offers Keep price / Re-price. No bulk
// re-price here.
export function FuelAlertScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const { id } = route.params;
  const { data, isPending, isError, error, refetch } = useFuelAlert(id);
  const { refreshing, onRefresh } = useManualRefresh(refetch);
  const close = () => navigation.goBack();

  if (isPending) {
    return (
      <SheetScreen title="Fuel price alert" variant="modal" onBack={close}>
        <DetailSkeleton />
      </SheetScreen>
    );
  }
  if (isError || !data) {
    const missing = (error as { status?: number } | null)?.status === 404;
    return (
      <SheetScreen title="Fuel price alert" variant="modal" onBack={close}>
        {missing ? (
          <NotFoundState what="Alert" onBack={close} />
        ) : (
          <EmptyState
            icon="alert"
            title="Couldn't load this alert"
            body={apiMessage(error, 'Pull to try again.')}
          />
        )}
      </SheetScreen>
    );
  }

  const rows = sortAlertQuotes(data.quotes ?? []);

  return (
    <SheetScreen
      title={data.title || 'Fuel price alert'}
      variant="modal"
      onBack={close}
      onRefresh={onRefresh}
      refreshing={refreshing}
    >
      <Txt className="text-callout text-fg">{data.message}</Txt>
      <Mono className="mb-5 mt-1.5 text-caption text-faint">{alertPriceLine(data)}</Mono>

      {rows.length === 0 ? (
        <Txt className="text-sub text-muted">No open quotes are affected.</Txt>
      ) : (
        <Card>
          {rows.map((q, i) => {
            const greyed = !q.still_open;
            return (
              <TouchableOpacity
                key={q.quote_id}
                onPress={() => navigation.navigate('QuoteDetail', { id: q.quote_id })}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${q.quote_number}, ${q.customer}, margin ${marginChange(q)}`}
                className={`min-h-[56px] flex-row items-center gap-3 px-3.5 py-3 ${
                  i === rows.length - 1 ? '' : 'border-b border-line-row'
                }`}
                style={greyed ? { opacity: 0.5 } : undefined}
              >
                <View className="flex-1">
                  <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
                    <Mono className="text-sub font-medium text-fg">{q.quote_number}</Mono>
                    {greyed ? (
                      <Badge label={statusWord(q.status_now || q.status)} />
                    ) : q.under_target ? (
                      <Badge label="Under target" tone="warning" dot />
                    ) : null}
                  </View>
                  {q.customer ? (
                    <Txt className="mt-0.5 text-caption text-muted" numberOfLines={1}>
                      {q.customer}
                    </Txt>
                  ) : null}
                  <Mono className="mt-0.5 text-caption text-faint">Margin {marginChange(q)}</Mono>
                </View>
                <Icon name="chevronRight" size={14} color={colors.faint} />
              </TouchableOpacity>
            );
          })}
        </Card>
      )}
    </SheetScreen>
  );
}
