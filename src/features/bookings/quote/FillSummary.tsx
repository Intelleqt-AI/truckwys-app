import { useEffect, useRef } from 'react';
import { AccessibilityInfo, TouchableOpacity, View } from 'react-native';
import { Txt } from '@/components/ui';
import { t, type FillChip, type UiLang } from './nlFill';

// What the last "Describe the load" Fill did, under the bar: one chip per
// thing it set, what it didn't understand, the suggestions it won't apply on
// its own, the Replace / Keep mine confirm, and Undo. Calm: muted ink, no
// colour as a signal — a low-confidence field gets a dotted underline AND
// the words "Check this".

const dotted = { textDecorationLine: 'underline', textDecorationStyle: 'dotted' } as const;

export interface FillSuggestion {
  id: string;
  label: string;
  onPress: () => void;
}

function Chip({
  label,
  a11y,
  low,
  lang,
  onPress,
}: {
  label: string;
  a11y: string;
  low?: boolean;
  lang: UiLang;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      className="min-h-[44px] flex-row items-center gap-1.5 rounded-control border border-line px-3"
    >
      <Txt className="text-callout text-fg" style={low ? dotted : undefined} numberOfLines={1}>
        {label}
      </Txt>
      {low ? <Txt className="text-caption text-muted">· {t(lang, 'check_this')}</Txt> : null}
    </TouchableOpacity>
  );
}

export function FillSummary({
  lang,
  chips,
  onChipPress,
  didntCatch,
  vehicleHint,
  onVehicleHint,
  suggestions,
  conflict,
  onReplace,
  onKeep,
  canUndo,
  onUndo,
}: {
  lang: UiLang;
  chips: FillChip[];
  onChipPress: (chip: FillChip) => void;
  didntCatch: string | null;
  /** "Superlink? Pick a truck". */
  vehicleHint: string | null;
  onVehicleHint: () => void;
  suggestions: FillSuggestion[];
  conflict: { title: string; detail: string } | null;
  onReplace: () => void;
  onKeep: () => void;
  canUndo: boolean;
  onUndo: () => void;
}) {
  const replaceRef = useRef<View>(null);

  // The confirm takes the screen reader's focus when it appears.
  useEffect(() => {
    if (!conflict) return;
    const id = setTimeout(() => {
      if (replaceRef.current) AccessibilityInfo.sendAccessibilityEvent(replaceRef.current, 'focus');
    }, 150);
    return () => clearTimeout(id);
  }, [conflict]);

  if (!chips.length && !didntCatch && !vehicleHint && !suggestions.length && !conflict && !canUndo)
    return null;

  return (
    <View className="mt-3 gap-2">
      {conflict ? (
        <View className="gap-2 rounded-control border border-line-active bg-raised p-3">
          <Txt className="text-callout font-semibold text-fg">{conflict.title}</Txt>
          <Txt className="text-sub text-muted">{conflict.detail}</Txt>
          <View className="flex-row gap-2">
            <TouchableOpacity
              ref={replaceRef}
              onPress={onReplace}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`${t(lang, 'replace')}. ${conflict.detail}`}
              className="min-h-[44px] flex-1 items-center justify-center rounded-control bg-btn-primary px-3"
            >
              <Txt className="text-callout font-medium text-btn-primary-fg">{t(lang, 'replace')}</Txt>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onKeep}
              activeOpacity={0.7}
              accessibilityRole="button"
              className="min-h-[44px] flex-1 items-center justify-center rounded-control border border-line-active px-3"
            >
              <Txt className="text-callout font-medium text-fg">{t(lang, 'keep')}</Txt>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {chips.length || canUndo ? (
        <View className="flex-row flex-wrap items-center gap-2">
          {chips.length ? <Txt className="text-caption text-faint">{t(lang, 'filled')}</Txt> : null}
          {chips.map((c) => (
            <Chip
              key={c.group}
              label={c.label}
              a11y={c.a11y}
              low={c.low}
              lang={lang}
              onPress={() => onChipPress(c)}
            />
          ))}
          {canUndo ? (
            <TouchableOpacity
              onPress={onUndo}
              activeOpacity={0.7}
              accessibilityRole="button"
              className="min-h-[44px] items-center justify-center px-3"
            >
              <Txt className="text-callout font-medium text-link">{t(lang, 'undo')}</Txt>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {vehicleHint || suggestions.length ? (
        <View className="flex-row flex-wrap gap-2">
          {vehicleHint ? (
            <Chip label={vehicleHint} a11y={vehicleHint} lang={lang} onPress={onVehicleHint} />
          ) : null}
          {suggestions.map((sg) => (
            <Chip key={sg.id} label={sg.label} a11y={sg.label} lang={lang} onPress={sg.onPress} />
          ))}
        </View>
      ) : null}

      {didntCatch ? <Txt className="text-sub text-muted">{didntCatch}</Txt> : null}
    </View>
  );
}

/** The "Check this" line under a field the last Fill was unsure about. */
export function CheckHint({ lang }: { lang: UiLang }) {
  return (
    <Txt className="mt-1 text-caption text-muted" style={dotted}>
      {t(lang, 'check_this')}
    </Txt>
  );
}
