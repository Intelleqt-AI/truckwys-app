import { View } from 'react-native';
import { Txt } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';
import { useTheme } from '@/theme/ThemeProvider';
import type { Market } from './analysis';

const money = (n: number) => formatCurrency(n, { maximumFractionDigits: 0 });

/**
 * The lane's market range as one horizontal bar: the middle half of quotes
 * (p25 to p75) as a band, the median as a tick, your cost floor below the bar
 * and the price in the bar above it. An estimate tier is outlined with a
 * dashed edge and no fill (never a solid "market" band), so it can't be
 * mistaken for real quotes.
 */
export function MarketRange({
  market,
  floor,
  price,
}: {
  market: Market;
  floor: number | null;
  price: number | null;
}) {
  const { colors } = useTheme();
  const { p25, median, p75 } = market;
  if (p25 == null || median == null || p75 == null) return null;

  const values = [p25, p75, median, ...(floor != null ? [floor] : []), ...(price != null ? [price] : [])];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max((hi - lo) * 0.08, hi * 0.02);
  const span = Math.max(hi + pad - (lo - pad), 1);
  // Percent along the bar, clamped so a marker never leaves it.
  const at = (v: number) => Math.max(0, Math.min(100, ((v - (lo - pad)) / span) * 100));
  const bandLeft = at(p25);
  const bandWidth = Math.max(1.5, at(p75) - bandLeft);
  const label =
    `Market range ${money(p25)} to ${money(p75)}, median ${money(median)}` +
    `${floor != null ? `, your cost floor ${money(floor)}` : ''}${price ? `, your price ${money(price)}` : ''}.`;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} className="mt-2">
      {/* The price marker sits above the bar. */}
      <View className="h-5">
        {price != null && (
          <View style={{ position: 'absolute', left: `${at(price)}%`, width: 0, alignItems: 'center' }}>
            <Txt className="w-16 text-center text-micro font-medium text-link" numberOfLines={1}>
              You
            </Txt>
          </View>
        )}
      </View>
      <View className="h-3.5 justify-center">
        <View style={{ height: 2, borderRadius: 1, backgroundColor: colors.line }} />
        <View
          style={{
            position: 'absolute',
            left: `${bandLeft}%`,
            width: `${bandWidth}%`,
            top: 0,
            bottom: 0,
            borderRadius: 3,
            borderWidth: 1,
            borderStyle: market.isEstimate ? 'dashed' : 'solid',
            borderColor: market.isEstimate ? colors.faint : colors.accent,
            backgroundColor: market.isEstimate ? 'transparent' : colors.accentDim,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: `${at(median)}%`,
            width: 2,
            top: -3,
            bottom: -3,
            marginLeft: -1,
            backgroundColor: colors.muted,
          }}
        />
        {price != null && (
          <View
            style={{
              position: 'absolute',
              left: `${at(price)}%`,
              width: 2,
              top: -8,
              bottom: 0,
              marginLeft: -1,
              backgroundColor: colors.accent,
            }}
          />
        )}
      </View>
      {/* The floor sits below the bar. */}
      <View className="h-5">
        {floor != null && (
          <View style={{ position: 'absolute', left: `${at(floor)}%`, width: 0, alignItems: 'center' }}>
            <View style={{ width: 1.5, height: 6, backgroundColor: colors.fg }} />
            <Txt className="w-16 text-center text-micro text-faint" numberOfLines={1}>
              Floor
            </Txt>
          </View>
        )}
      </View>
    </View>
  );
}
