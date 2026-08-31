import { memo } from 'react';
import { View, ActivityIndicator } from 'react-native';
import {
  Group,
  ProfitCurve,
  Button,
  Icon,
  Txt,
  Mono,
  Label,
  type CurvePoint,
} from '@/components/ui';
import { Skeleton } from '@/components/feedback';
import { status as statusHues } from '@/theme/tokens';
import {
  formatCurrency,
  formatCurrencyCompact,
  formatConfidence,
  formatNumber,
  formatPercent,
} from '@/lib/formatters';

/**
 * The AI recommendation card — moved out of CreateQuoteScreen.tsx's render
 * body (Phase 2) verbatim, wrapped in memo. All-primitive props (plus the
 * already-memoized curveData) so a keystroke in an unrelated field — Notes,
 * Cargo, an override — skips this card entirely instead of re-running the
 * skeleton/hero/curve/banner logic.
 */
function AiRecommendationCardImpl({
  estimateLoading,
  statsTrusted,
  suggestedPrice,
  costsTotal,
  optMarkupPct,
  marginPct,
  expProfit,
  winProb,
  curveData,
  alreadyApplied,
  onApplyRecommended,
  onUseActualPrice,
  riskLevel,
  guardMsg,
  guardHint,
  aiLearning,
  vehicleType,
  outcomesLogged,
  outcomesNeeded,
  learnPct,
}: {
  estimateLoading: boolean;
  statsTrusted: boolean;
  suggestedPrice: number | null;
  costsTotal: number;
  optMarkupPct: number | null;
  marginPct: number;
  expProfit: number;
  winProb: number;
  curveData: CurvePoint[];
  alreadyApplied: boolean;
  onApplyRecommended: () => void;
  onUseActualPrice: () => void;
  riskLevel: string;
  guardMsg: string;
  guardHint: string | null;
  aiLearning: boolean;
  vehicleType: string;
  outcomesLogged: number;
  outcomesNeeded: number;
  learnPct: number;
}) {
  return (
    <Group label="AI recommendation">
      {estimateLoading ? (
        /* One unified skeleton — no piecemeal spinners. */
        <View className="p-4">
          <View className="mb-3 flex-row items-center gap-2">
            <ActivityIndicator size="small" color="#4D9EFF" />
            <Mono className="text-caption text-muted">Analysing route & optimising price…</Mono>
          </View>
          <Skeleton width="55%" height={26} className="mb-4" />
          <View className="mb-4 flex-row gap-8">
            <View className="flex-1 gap-2">
              <Skeleton width="40%" height={10} />
              <Skeleton width="60%" height={18} />
            </View>
            <View className="flex-1 gap-2">
              <Skeleton width="55%" height={10} />
              <Skeleton width="45%" height={18} />
            </View>
          </View>
          <Skeleton height={56} />
        </View>
      ) : (
        <View className="p-4">
          {/* The price is the hero. Its label and caption say which
              basis it came from, so a cost-based figure is never
              mistaken for a trained recommendation. */}
          <Label className="text-faint">
            {statsTrusted ? 'Recommended price' : 'Suggested price'}
          </Label>
          {/* minimumFontScale is the point here: RN defaults it to 0.01, so
              adjustsFontSizeToFit would shrink a seven-figure total toward
              illegibility rather than clip it. Below 0.6 a tail ellipsis is the
              more honest failure. */}
          <Mono
            className={`mt-1 ${statsTrusted ? 'text-accent' : 'text-fg'}`}
            style={{ fontSize: 26, fontWeight: '700' }}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {formatCurrency(suggestedPrice ?? costsTotal)}
          </Mono>
          <Txt className="mt-0.5 text-caption text-faint">
            {statsTrusted ? 'to this client' : 'true cost + 25%'}
          </Txt>

          {statsTrusted ? (
            <>
              {/* One compact stat row rather than a tile grid. */}
              {/* gap-6, and numberOfLines on every figure: none of these had it,
                  so at larger text sizes they wrapped instead of clipping and
                  silently changed the card's height. gap-8 was also spending
                  32pt of a ~311pt row on empty space between two flex-1
                  columns. */}
              <View className="mt-4 flex-row gap-6">
                <View className="flex-1">
                  <Label className="text-faint">Margin</Label>
                  <Mono
                    className="mt-1 text-fg"
                    style={{ fontSize: 18, fontWeight: '600' }}
                    numberOfLines={1}
                  >
                    {optMarkupPct != null
                      ? formatPercent(optMarkupPct, 0)
                      : formatPercent(marginPct, 0)}
                  </Mono>
                  <Mono className="text-micro text-success" numberOfLines={1}>
                    {formatCurrencyCompact(expProfit)} profit
                  </Mono>
                </View>
                <View className="flex-1">
                  <Label className="text-faint">Win probability</Label>
                  <Mono
                    className="mt-1 text-fg"
                    style={{ fontSize: 18, fontWeight: '600' }}
                    numberOfLines={1}
                  >
                    {winProb > 0 ? formatConfidence(winProb) : '—'}
                  </Mono>
                  <View className="mt-2 h-1 overflow-hidden rounded-pill bg-surface-hover">
                    <View
                      style={{
                        width: `${Math.min(100, Math.round(winProb * 100))}%`,
                        height: '100%',
                      }}
                      className="bg-accent"
                    />
                  </View>
                </View>
              </View>

              {curveData.length > 1 && (
                <View className="mt-4">
                  <Label className="mb-1 text-faint">Profit sweet-spot · tap to inspect</Label>
                  <ProfitCurve
                    points={curveData}
                    optimalMargin={optMarkupPct != null ? Math.round(optMarkupPct) : undefined}
                    height={56}
                  />
                </View>
              )}
            </>
          ) : (
            /* One honest line instead of three "unlocks after training"
               placeholders — the client asked for less clutter, and
               empty tiles are clutter. */
            <Txt className="mt-3 text-caption text-faint">
              Margin, win probability and the profit curve unlock once the model is trained.
            </Txt>
          )}

          {alreadyApplied ? (
            <View className="mt-4 gap-2.5">
              <View className="flex-row items-center gap-1.5">
                <Icon name="check" size={15} color={statusHues.success} />
                <Txt className="text-sub text-success">AI price applied</Txt>
              </View>
              <Button
                label="Use actual price"
                variant="secondary"
                onPress={onUseActualPrice}
                fullWidth
              />
            </View>
          ) : (
            suggestedPrice != null &&
            suggestedPrice > 0 && (
              <Button
                label="Apply recommended"
                variant="secondary"
                icon="sparkle"
                onPress={onApplyRecommended}
                fullWidth
                className="mt-4"
              />
            )
          )}
        </View>
      )}

      {riskLevel !== 'SAFE' && (
        <View
          className={`flex-row gap-2.5 border-t border-line p-3 ${riskLevel === 'AT_RISK' ? 'bg-danger-bg' : 'bg-warning-bg'}`}
        >
          <Icon name="alert" size={16} color={riskLevel === 'AT_RISK' ? '#FF4949' : '#F59E0B'} />
          <Txt className="flex-1 text-sub text-muted">
            <Txt
              className={`text-sub font-semibold ${riskLevel === 'AT_RISK' ? 'text-danger' : 'text-warning'}`}
            >
              {riskLevel === 'AT_RISK' ? 'At risk' : 'Caution'}
            </Txt>
            {' · '}
            {guardMsg}
            {guardHint ? ` — ${guardHint}` : ''}
          </Txt>
        </View>
      )}

      {aiLearning && (
        <View className="flex-row items-center gap-2.5 border-t border-line bg-warning-bg p-3">
          <Icon name="sparkle" size={16} color="#F59E0B" />
          <Txt className="flex-1 text-sub text-muted">
            <Txt className="text-sub font-semibold text-fg">Still learning your fleet. </Txt>
            Priced on true cost + your {vehicleType} base rate for now.
          </Txt>
          <View className="items-end">
            <Mono className="text-micro text-fg">
              {formatNumber(outcomesLogged)}/{formatNumber(outcomesNeeded)} logged
            </Mono>
            <View className="mt-1 h-1 w-16 overflow-hidden rounded-pill bg-surface-hover">
              <View style={{ width: `${learnPct}%`, height: '100%', backgroundColor: '#F59E0B' }} />
            </View>
          </View>
        </View>
      )}
    </Group>
  );
}

export const AiRecommendationCard = memo(AiRecommendationCardImpl);
