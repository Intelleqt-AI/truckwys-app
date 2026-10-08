import { memo } from 'react';
import { View } from 'react-native';
import { Label, Mono, Txt } from '@/components/ui';
import { num, pick, str } from '@/lib/api/list';
import { formatCurrency, formatDate, formatNumber } from '@/lib/formatters';
import { BreakdownModal, type BreakdownEdit, type BreakdownRow } from './BreakdownModal';
import type { CostBreakdown } from './costs';

/** "Mainline · SANRAL · from 1 Mar 2026" / "MZN 1 200 · no SA VAT · REVIMO". */
export function plazaDetail(b: Record<string, unknown>): string {
  const parts: string[] = [];
  const type = str(pick(b, ['plaza_type']));
  if (type) parts.push(type === 'ramp' ? 'Ramp' : type === 'mainline' ? 'Mainline' : type);
  const operator = str(pick(b, ['operator']));
  if (operator) parts.push(operator);
  const country = str(pick(b, ['country'])).toUpperCase();
  const currency = str(pick(b, ['currency'])).toUpperCase();
  if (currency && currency !== 'ZAR' && pick(b, ['tariff_foreign']) != null) {
    parts.push(`${currency} ${formatNumber(num(pick(b, ['tariff_foreign'])))}`);
  }
  if (country && country !== 'ZA') parts.push('no SA VAT');
  const from = str(pick(b, ['tariff_effective_from']));
  if (from) parts.push(`from ${formatDate(from)}`);
  const fx = pick(b, ['fx']) as Record<string, unknown> | undefined;
  if (fx && typeof fx === 'object' && fx.is_fallback === true && str(fx.as_of)) parts.push(`rate as of ${formatDate(str(fx.as_of))}`);
  if (b.class_mapping_verified === false) parts.push('class mapping unconfirmed');
  return parts.join(' · ');
}

// The backend lists plazas in driving order already (location_km is the
// road's own km marker, not distance along this trip): keep its order.
const inDrivingOrder = (items: Record<string, unknown>[]) => items;

function PlazaList({ title, items }: { title?: string; items: Record<string, unknown>[] }) {
  return (
    <View className={title ? 'mt-3' : ''}>
      {title ? <Label className="mb-1 text-faint">{title}</Label> : null}
      {inDrivingOrder(items).map((b, i) => {
        const road = str(pick(b, ['route']));
        const detail = plazaDetail(b);
        return (
          <View key={`${str(pick(b, ['plaza']))}-${i}`} className="min-h-[44px] flex-row items-center justify-between gap-3 border-b border-line-row py-1.5">
            <View className="shrink">
              <Txt className="text-sub text-fg" numberOfLines={2}>
                {str(pick(b, ['plaza']), 'Plaza')}
                {road ? ` (${road})` : ''}
              </Txt>
              {detail ? <Txt className="text-caption text-faint">{detail}</Txt> : null}
            </View>
            <Mono className="shrink-0 text-sub text-fg">{formatCurrency(num(pick(b, ['tariff'])))}</Mono>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Toll plazas in driving order with operator, mainline/ramp and the date the
 * tariff took effect. Costed excl. VAT, or incl. VAT for a company that
 * isn't VAT registered; foreign (e.g. Mozambique) plazas carry no SA VAT.
 * A round trip or empty return lists the way home's own plazas.
 */
function TollBreakdownModalImpl({
  visible,
  onClose,
  costs,
  edit,
}: {
  visible: boolean;
  onClose: () => void;
  costs: CostBreakdown;
  /** Tolls for all legs, typed on this quote. */
  edit?: BreakdownEdit | null;
}) {
  const vat = costs.tollsInclVat ? 'incl. VAT' : 'excl. VAT';
  const title = `Tolls${costs.tollClass ? ` · class ${costs.tollClass}` : ''} · ${vat}`;
  const rows: BreakdownRow[] = [];
  if (costs.tollsUnavailable) rows.push({ label: 'Route lookup', value: 'Failed', tone: 'danger' });
  else if (costs.tollBreakdown.length === 0) rows.push({ label: 'Plazas', value: 'None' });
  const hasReturn = costs.returnTollBreakdown.length > 0 && (costs.legs === 2 || costs.emptyReturnIncluded);
  if (costs.legs === 2 && costs.tollKnown && !hasReturn) rows.push({ label: 'Legs', value: '× 2' });
  return (
    <BreakdownModal
      visible={visible}
      onClose={onClose}
      title={title}
      rows={rows}
      total={{ label: 'Tolls', value: costs.tollKnown ? formatCurrency(costs.tollCost) : '—', tone: costs.tollKnown ? undefined : 'danger' }}
      note={costs.tollsEstimated && !costs.tollsUnavailable ? 'Estimated, not a plaza match.' : null}
      edit={edit}
    >
      {!costs.tollsUnavailable && costs.tollBreakdown.length > 0 && (
        <PlazaList title={hasReturn ? 'Out' : undefined} items={costs.tollBreakdown} />
      )}
      {hasReturn && (
        <PlazaList title={costs.legs === 2 ? 'Back' : 'Back, empty'} items={costs.returnTollBreakdown} />
      )}
    </BreakdownModal>
  );
}

export const TollBreakdownModal = memo(TollBreakdownModalImpl);
