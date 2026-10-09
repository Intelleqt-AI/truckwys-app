// Trip economics building blocks shared by the Book job sheet and the job
// detail: a return-load candidate row, the trip margin card and the invoice
// preview. Figures come straight from trip/economics.ts.
import { View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Group, DetailRow, Icon, Txt, Mono } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import {
  candidateNote,
  candidateSub,
  candidateTitle,
  type Candidate,
  type CandidateDirection,
  type InvoicePreviewView,
  type MarginCardView,
} from './economics';

/** One suggested load. The whole row is the 44 pt+ target. */
export function CandidateRow({
  candidate,
  direction,
  onPress,
  busy,
  linked,
  disabled,
  last,
}: {
  candidate: Candidate;
  direction: CandidateDirection;
  onPress: () => void;
  busy?: boolean;
  linked?: boolean;
  disabled?: boolean;
  last?: boolean;
}) {
  const { colors } = useTheme();
  const note = candidateNote(candidate);
  const sub = candidateSub(candidate, direction);
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || busy || linked}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={`${linked ? 'Linked: ' : 'Link '}${candidate.loadNumber}, ${candidateTitle(candidate)}${
        sub ? `, ${sub}` : ''
      }`}
      accessibilityState={{ disabled: !!(disabled || busy), selected: !!linked }}
      className={`min-h-[56px] flex-row items-center gap-3 px-3.5 py-3 ${last ? '' : 'border-b border-line-row'}`}
    >
      <View className="flex-1">
        <Txt className="text-callout text-fg" numberOfLines={1}>
          {candidateTitle(candidate)}
        </Txt>
        {sub ? (
          <Txt className="mt-0.5 text-caption text-muted" numberOfLines={2}>
            {sub}
          </Txt>
        ) : null}
        {note ? (
          <Mono
            className={`mt-0.5 text-caption ${candidate.warnings.length ? 'text-warning' : 'text-faint'}`}
            numberOfLines={1}
          >
            {note}
          </Mono>
        ) : null}
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={colors.faint} />
      ) : linked ? (
        <Icon name="check" size={17} color={colors.accent} strokeWidth={2.4} />
      ) : (
        <Mono className="text-sub font-medium text-link">Link</Mono>
      )}
    </TouchableOpacity>
  );
}

/** Quoted against actual, per leg and for the pair combined. */
export function TripMarginCard({
  view,
  pair,
  onOpenLeg,
  onRefresh,
  refreshing,
}: {
  view: MarginCardView;
  pair: boolean;
  onOpenLeg?: (loadId: number | string) => void;
  /** Shown with the in-progress note (e.g. tolls being worked out). */
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Group label={pair ? 'Trip margin' : 'Job margin'}>
      {view.legs.map((leg, i) => (
        <View
          key={leg.key}
          className={
            i < view.legs.length - 1 || view.combined || view.emptyReturnNote || view.missing.length || view.pending
              ? 'border-b border-line-row'
              : ''
          }
        >
          {pair && (
            <TouchableOpacity
              disabled={!onOpenLeg || leg.loadId == null}
              onPress={() => leg.loadId != null && onOpenLeg?.(leg.loadId)}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={`${leg.title}, ${leg.lane}`}
              className="min-h-[44px] flex-row items-center justify-between gap-3 px-3.5 pt-3"
            >
              <View className="shrink">
                <Txt className="text-callout font-semibold text-fg">{leg.title}</Txt>
                {leg.lane ? (
                  <Txt className="text-caption text-muted" numberOfLines={1}>
                    {leg.lane}
                  </Txt>
                ) : null}
              </View>
              {onOpenLeg && leg.loadId != null && (
                <Icon name="chevronRight" size={14} color={colors.faint} />
              )}
            </TouchableOpacity>
          )}
          <DetailRow label="Revenue excl. VAT" hint={leg.revenueBasis ?? undefined} value={leg.revenue} />
          <DetailRow label={`${leg.costLabel} excl. VAT`} hint={leg.groups ?? undefined} value={leg.cost} />
          {leg.recorded ? (
            <View className="px-3.5 pb-2">
              <Txt className="text-caption text-muted">{leg.recorded}</Txt>
            </View>
          ) : null}
          {leg.fuelBurn ? (
            <View className="px-3.5 pb-2">
              <Txt className="text-caption text-muted">{leg.fuelBurn}</Txt>
            </View>
          ) : null}
          <DetailRow
            label="Margin"
            hint={[leg.basis, leg.quoted].filter(Boolean).join(' · ') || undefined}
            value={leg.margin}
            valueColor={leg.negative ? colors.danger : undefined}
            boldValue
            last={!leg.vsQuoted}
          />
          {leg.vsQuoted && (
            <View className="px-3.5 pb-3">
              <Mono className={`text-caption ${leg.below ? 'text-warning' : 'text-faint'}`}>{leg.vsQuoted}</Mono>
            </View>
          )}
        </View>
      ))}
      {view.combined && (
        <View className="bg-surface-hover px-3.5 py-3.5">
          <View className="flex-row items-center justify-between gap-4">
            <View className="shrink">
              <Txt className="text-callout font-semibold text-fg">Round trip</Txt>
              {(view.combined.basis || view.combined.quoted) && (
                <Txt className="text-caption text-muted">
                  {[view.combined.basis, view.combined.quoted].filter(Boolean).join(' · ')}
                </Txt>
              )}
            </View>
            <Mono
              className="text-heading font-semibold"
              style={{ color: view.combined.negative ? colors.danger : colors.fg }}
            >
              {view.combined.margin}
            </Mono>
          </View>
          {view.combined.vsQuoted && (
            <Mono className={`mt-1 text-caption ${view.combined.below ? 'text-warning' : 'text-faint'}`}>
              {view.combined.vsQuoted}
            </Mono>
          )}
        </View>
      )}
      {view.emptyReturnNote && (
        <View className="flex-row items-center gap-2 px-3.5 py-3">
          <Icon name="check" size={14} color={colors.successDot} />
          <Txt className="shrink text-caption text-muted">{view.emptyReturnNote}</Txt>
        </View>
      )}
      {view.missing.map((m, i) => (
        <View
          key={m}
          className={`flex-row items-center gap-2 px-3.5 py-3 ${
            i > 0 || view.combined || view.emptyReturnNote ? 'border-t border-line-row' : ''
          }`}
        >
          <Icon name="info" size={14} color={colors.warningDot} />
          <Txt className="shrink text-caption text-muted">{m}</Txt>
        </View>
      ))}
      {view.pending && (
        <View
          className={`min-h-[44px] flex-row items-center gap-2 px-3.5 py-2 ${
            view.combined || view.emptyReturnNote || view.missing.length ? 'border-t border-line-row' : ''
          }`}
        >
          <ActivityIndicator size="small" color={colors.faint} />
          <Txt className="flex-1 text-caption text-muted">{view.pending}</Txt>
          {onRefresh && (
            <TouchableOpacity
              onPress={onRefresh}
              disabled={refreshing}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Refresh the job margin"
              className="min-h-[44px] justify-center px-1"
            >
              <Mono className="text-sub font-medium text-link">{refreshing ? 'Checking…' : 'Refresh'}</Mono>
            </TouchableOpacity>
          )}
        </View>
      )}
    </Group>
  );
}

/** What delivery will raise, from the booking block. */
export function InvoicePreviewGroup({ preview }: { preview: InvoicePreviewView }) {
  const { colors } = useTheme();
  const rows = preview.lines;
  return (
    <Group label={preview.heading}>
      {rows.map((l, i) => (
        <DetailRow key={`${l.label}-${i}`} label={l.label} value={l.amount} mono />
      ))}
      {preview.subtotal && rows.length > 0 && <DetailRow label="Subtotal" value={preview.subtotal} />}
      {preview.vat && <DetailRow label="VAT" value={preview.vat} />}
      {preview.total && (
        <View className="flex-row items-center justify-between bg-surface-hover px-3.5 py-3.5">
          <Txt className="text-callout font-semibold text-fg">Total</Txt>
          <Mono className="text-heading font-semibold" style={{ color: colors.fg }}>
            {preview.total}
          </Mono>
        </View>
      )}
      {preview.note && (
        <View className="px-3.5 py-3">
          <Txt className="text-caption text-muted">{preview.note}</Txt>
        </View>
      )}
    </Group>
  );
}
