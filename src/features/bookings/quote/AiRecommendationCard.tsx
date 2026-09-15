import { memo, useState } from 'react';
import { View, ActivityIndicator, Pressable } from 'react-native';
import { Group, Button, Icon, Txt, Mono, Label, Badge } from '@/components/ui';
import { Skeleton } from '@/components/feedback';
import { status as statusHues } from '@/theme/tokens';
import {
  formatCurrency,
  formatCurrencyCompact,
  formatConfidence,
  formatNumber,
  formatPercent,
} from '@/lib/formatters';
import type { WinModelTier } from '../api';
import type { AwaitingAiCopy } from './validation';

/** One tier's won/lost readout — {label: 'your quotes'|'platform', tier}. */
function TierRow({ label, tier }: { label: string; tier: WinModelTier | null | undefined }) {
  // Matches web's exact fallback chain (QuoteBuilder.tsx): accepted falls
  // back to outcomes_collected (an old/pre-two-tier payload can carry the
  // count without the won/lost split), rejected falls back to 0.
  const won = tier?.accepted ?? tier?.outcomes_collected ?? 0;
  const rejected = tier?.rejected ?? 0;
  const collected = tier?.outcomes_collected ?? 0;
  const needed = tier?.outcomes_needed ?? 0;
  // The N/needed sub-label only makes sense while the count gate is actually
  // what's blocking this tier — showing it once the count has passed (e.g.
  // the class-balance or retrain gate is what's left) is what made "45/40"
  // read next to "AI pricing isn't ready yet" as a self-contradiction.
  const showCount = tier?.blocker === 'insufficient_data';
  return (
    <View className="flex-1">
      <Mono className="text-micro text-fg" numberOfLines={1}>
        {formatNumber(won)} won
        <Txt className="text-micro text-faint"> · </Txt>
        <Txt className={`text-micro ${rejected === 0 ? 'text-warning' : 'text-faint'}`}>
          {formatNumber(rejected)} lost
        </Txt>
      </Mono>
      <Txt className="mt-0.5 text-micro text-faint" numberOfLines={1}>
        {showCount ? `${label} · ${formatNumber(collected)}/${formatNumber(needed)}` : label}
      </Txt>
    </View>
  );
}

/**
 * The AI recommendation card — moved out of CreateQuoteScreen.tsx's render
 * body (Phase 2) verbatim, wrapped in memo. All-primitive props so a
 * keystroke in an unrelated field — Notes, Cargo, an override — skips this
 * card entirely instead of re-running the skeleton/hero/banner logic.
 *
 * `statsTrusted` (== ai_prediction.available, modulo the markup-plausibility
 * guard) is the only thing that may label a price "AI" — see
 * quote/validation.ts's awaitingAiCopy for the reasoning behind each state.
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
  alreadyApplied,
  onApplyRecommended,
  onUseActualPrice,
  riskLevel,
  guardMsg,
  guardHint,
  modelScope,
  trainingSamples,
  awaitingVisible,
  awaitingCopy,
  hasVehicleType,
  vehicleType,
  hasWinModel,
  winUserTier,
  winGlobalTier,
}: {
  estimateLoading: boolean;
  statsTrusted: boolean;
  suggestedPrice: number | null;
  costsTotal: number;
  optMarkupPct: number | null;
  marginPct: number;
  expProfit: number;
  winProb: number;
  alreadyApplied: boolean;
  onApplyRecommended: () => void;
  onUseActualPrice: () => void;
  riskLevel: string;
  guardMsg: string;
  guardHint: string | null;
  /** null when statsTrusted is false — there's no trained model behind the price shown. */
  modelScope: 'user' | 'global' | null;
  trainingSamples: number | null;
  awaitingVisible: boolean;
  awaitingCopy: AwaitingAiCopy;
  hasVehicleType: boolean;
  vehicleType: string;
  /** pick(modelStats, ['win_model']) != null — see the tier-row guard below. */
  hasWinModel: boolean;
  winUserTier: WinModelTier | null | undefined;
  winGlobalTier: WinModelTier | null | undefined;
}) {
  // Web shows training_samples only in a hover `title` tooltip — secondary
  // info, not shown until asked for. Touch has no hover, so a tap on the
  // badge reveals the same line instead, hidden by default; an always-visible
  // caption would be further from web's actual behaviour than this is.
  const [showTrainingInfo, setShowTrainingInfo] = useState(false);
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
          <View className="flex-row items-center justify-between">
            <Label className="text-faint">
              {statsTrusted ? 'Recommended price' : 'Suggested price'}
            </Label>
            {/* A global (platform-wide) model is a fully functional result, not
                a degraded one — badged distinctly from Personal, not lesser.
                Tap to reveal the training-sample count below (web's hover
                tooltip equivalent). */}
            {statsTrusted && modelScope && (
              <Pressable onPress={() => setShowTrainingInfo((v) => !v)} hitSlop={8}>
                <Badge
                  label={modelScope === 'user' ? 'Personal AI' : 'Platform AI'}
                  tone={modelScope === 'user' ? 'accent' : 'neutral'}
                />
              </Pressable>
            )}
          </View>
          {statsTrusted && showTrainingInfo && trainingSamples != null && (
            <Txt className="mt-0.5 text-micro text-faint">
              Trained on {formatNumber(trainingSamples)}{' '}
              {modelScope === 'user' ? 'of your own' : 'platform-wide'} closed quotes
            </Txt>
          )}
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
                    {/* Truthy, not `!= null` — mirrors web's `opt?.optimal_margin_pct
                        ? … : marginPct` exactly, so an optimal_margin_pct of 0
                        falls back to marginPct the same way it does on web. */}
                    {optMarkupPct ? formatPercent(optMarkupPct, 0) : formatPercent(marginPct, 0)}
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
            </>
          ) : (
            /* One honest line instead of two "unlocks after training"
               placeholders — the client asked for less clutter, and
               empty tiles are clutter. */
            <Txt className="mt-3 text-caption text-faint">
              Margin and win probability unlock once the model is trained.
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

      {awaitingVisible && (
        <View className="gap-2.5 border-t border-line bg-warning-bg p-3">
          <View className="flex-row items-start gap-2.5">
            <Icon name="sparkle" size={16} color="#F59E0B" />
            <Txt className="flex-1 text-sub text-muted">
              <Txt className="text-sub font-semibold text-fg">{awaitingCopy.title} </Txt>
              Priced on true cost +{' '}
              {hasVehicleType ? `your ${vehicleType} base rate` : 'your company default base rate'}{' '}
              for now.
              {awaitingCopy.detail ? ` ${awaitingCopy.detail}` : ''}
            </Txt>
          </View>
          {/* Split by tier — a company can qualify on the platform total while
              still short on its own outcomes (or vice versa), so a single
              combined count can't say whose data is missing. Gated on
              hasWinModel (mirrors web's `{winModel && ...}`) because
              normalizeWinModelTier always returns a real object — without
              this guard the row would assert "0 won · 0 lost" before
              model-stats has resolved, or when model_progress errors and
              returns a null win_model, a claim web never makes. */}
          {hasWinModel && (
            <View className="flex-row gap-6 pl-6">
              <TierRow label="your quotes" tier={winUserTier} />
              <TierRow label="platform" tier={winGlobalTier} />
            </View>
          )}
        </View>
      )}
    </Group>
  );
}

export const AiRecommendationCard = memo(AiRecommendationCardImpl);
