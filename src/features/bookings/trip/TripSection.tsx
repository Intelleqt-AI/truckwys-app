// Job detail: the trip margin card and the return-load link. Hidden whole on a
// backend without trip economics (economics endpoint 404 / 405).
import { useRef, useState } from 'react';
import { Alert, View, TouchableOpacity } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Group, Icon, Txt, Mono } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { invalidateFor } from '@/lib/queryInvalidation';
import { toast } from '@/lib/toast';
import { linkReturnLoad, unlinkReturnLoad, useLoadEconomics, useReturnCandidates } from '../api';
import {
  candidateTitle,
  marginCardView,
  parseWarnings,
  partnerLeg,
  type Candidate,
  type CandidateDirection,
} from './economics';
import { CandidateRow, TripMarginCard } from './TripUi';

export function TripSection({
  loadId,
  status,
  tripType,
  onOpenLoad,
}: {
  loadId: number | string;
  status: string;
  tripType: string;
  onOpenLoad: (id: number | string) => void;
}) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const { data: economics, refetch: refetchEconomics, isFetching } = useLoadEconomics(loadId);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Synchronous guard against a double tap before `busyId` re-renders.
  const busyRef = useRef(false);

  const oneWay = tripType.toUpperCase() !== 'ROUND_TRIP';
  const linkable = !!economics && !economics.pair && oneWay && status !== 'CANCELLED';
  const { data: returns } = useReturnCandidates(loadId, 'return', linkable);
  const { data: outbounds } = useReturnCandidates(loadId, 'outbound', linkable);

  if (!economics) return null;
  const view = marginCardView(economics);
  const partner = partnerLeg(economics, loadId);
  const thisIsReturn = economics.pair && String(economics.returnId) === String(loadId);

  const refresh = () => invalidateFor(qc, 'load');

  const link = (c: Candidate, direction: CandidateDirection) => {
    if (busyId) return;
    const go = async () => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusyId(String(c.loadId));
      try {
        const res =
          direction === 'return' ? await linkReturnLoad(loadId, c.loadId) : await linkReturnLoad(c.loadId, loadId);
        refresh();
        const warning = parseWarnings((res ?? {}).warnings)[0];
        if (warning) toast.info(`Linked. ${warning.title}`);
        else toast.success('Return load linked');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't link that load");
      } finally {
        busyRef.current = false;
        setBusyId(null);
      }
    };
    const warning = c.warnings[0]?.title;
    Alert.alert(
      direction === 'return' ? 'Link return load' : 'Link as the return',
      `${c.loadNumber} · ${candidateTitle(c)}${warning ? `\n\n${warning}` : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Link', onPress: () => void go() },
      ],
    );
  };

  const unlink = () =>
    Alert.alert('Unlink return load', 'The empty return goes back into both jobs’ costs.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unlink',
        style: 'destructive',
        onPress: async () => {
          if (busyRef.current) return;
          busyRef.current = true;
          setBusyId('unlink');
          try {
            await unlinkReturnLoad(loadId);
            refresh();
            toast.success('Unlinked');
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Couldn't unlink");
          } finally {
            busyRef.current = false;
            setBusyId(null);
          }
        },
      },
    ]);

  const returnRows = (returns ?? []).slice(0, 3);
  const outboundRows = (outbounds ?? []).slice(0, 3);

  return (
    <>
      <TripMarginCard
        view={view}
        pair={economics.pair}
        onOpenLeg={(id) => String(id) !== String(loadId) && onOpenLoad(id)}
        onRefresh={() => void refetchEconomics()}
        refreshing={isFetching}
      />

      {economics.pair && partner && (
        <Group label="Return load" action={busyId === 'unlink' ? undefined : 'Unlink'} onAction={unlink}>
          <TouchableOpacity
            onPress={() => partner.loadId != null && onOpenLoad(partner.loadId)}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={`Open ${partner.loadNumber}`}
            className="min-h-[52px] flex-row items-center gap-3 px-3.5 py-3"
          >
            <View className="flex-1">
              <Txt className="text-callout text-fg" numberOfLines={1}>
                {thisIsReturn ? `Return of ${partner.loadNumber}` : partner.loadNumber}
              </Txt>
              {partner.lane ? (
                <Txt className="mt-0.5 text-caption text-muted" numberOfLines={1}>
                  {partner.lane}
                </Txt>
              ) : null}
            </View>
            <Icon name="chevronRight" size={14} color={colors.faint} />
          </TouchableOpacity>
        </Group>
      )}

      {linkable && returnRows.length > 0 && (
        <Group label="Coming back loaded?">
          {returnRows.map((c, i) => (
            <CandidateRow
              key={`r-${c.loadId}`}
              candidate={c}
              direction="return"
              busy={busyId === String(c.loadId)}
              disabled={!!busyId}
              onPress={() => link(c, 'return')}
              last={i === returnRows.length - 1}
            />
          ))}
        </Group>
      )}
      {linkable && outboundRows.length > 0 && (
        <Group label="Return of an earlier job?">
          {outboundRows.map((c, i) => (
            <CandidateRow
              key={`o-${c.loadId}`}
              candidate={c}
              direction="outbound"
              busy={busyId === String(c.loadId)}
              disabled={!!busyId}
              onPress={() => link(c, 'outbound')}
              last={i === outboundRows.length - 1}
            />
          ))}
        </Group>
      )}
      {linkable && economics.expectingReturn && returns != null && returnRows.length === 0 && (
        <Mono className="-mt-2 mb-5 text-caption text-faint">
          Expecting a return load. None near the drop yet.
        </Mono>
      )}
    </>
  );
}
