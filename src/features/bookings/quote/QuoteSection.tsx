import { useCallback, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Icon, Mono, SectionLabel, Txt } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import type { SectionId } from './types';

/** Sections in the form; only used to say "step 2 of 5". */
const SECTION_COUNT = 5;

/**
 * One visible grouping of the form — a header plus its fields, still inside
 * the single continuous scroll (Phase 2: no accordion, no wizard — the user
 * already chose a sticky jump bar over folding). Reports its own top offset
 * via onLayout so QuoteJumpBar can scroll to it; not collapsible, so this is
 * purely a header + layout-reporting wrapper, never a source of unmounted
 * field state.
 *
 * Given an `index` it draws the step header: a numbered token that becomes a
 * tick once the section is complete (or a danger ring once a Send attempt has
 * found an issue in it), the title, and a one-line live summary at the right
 * ("562 km · 1 stop"). Without one it falls back to the plain section label.
 *
 * Keep this the root of the section and never put layout animations on it: the
 * jump bar scrolls to `layout.y`, which is only the scroll offset while the
 * sections are direct children of the form's first View.
 */
export function QuoteSection({
  id,
  label,
  index,
  complete,
  hasIssue,
  summary,
  onLayout,
  children,
}: {
  id: SectionId;
  label: string;
  /** 1-based position; turns on the step header. */
  index?: number;
  complete?: boolean;
  hasIssue?: boolean;
  /** What the section currently holds, in a few words. */
  summary?: string | null;
  /** Reports this section's y offset within the scroll content. */
  onLayout?: (id: SectionId, y: number) => void;
  children: ReactNode;
}) {
  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => onLayout?.(id, e.nativeEvent.layout.y),
    [id, onLayout],
  );
  const stepped = index != null;
  return (
    <View
      onLayout={onLayout ? handleLayout : undefined}
      // A hairline between chapters, so the scroll reads as sections. Not above
      // the first: nothing precedes it but the AI composer.
      className={`gap-4 ${stepped && index > 1 ? 'border-t border-line-row pt-4' : ''}`}
    >
      {stepped ? (
        <StepHeader
          label={label}
          index={index}
          complete={!!complete}
          hasIssue={!!hasIssue}
          summary={summary ?? null}
        />
      ) : (
        label && <SectionLabel>{label}</SectionLabel>
      )}
      {children}
    </View>
  );
}

function StepHeader({
  label,
  index,
  complete,
  hasIssue,
  summary,
}: {
  label: string;
  index: number;
  complete: boolean;
  hasIssue: boolean;
  summary: string | null;
}) {
  const { colors } = useTheme();
  const state = hasIssue ? 'needs attention' : complete ? 'complete' : 'incomplete';
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={`${label}, step ${index} of ${SECTION_COUNT}, ${state}${summary ? `, ${summary}` : ''}`}
      className="min-h-[28px] flex-row items-center gap-2.5"
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 20,
          borderWidth: 1.5,
          alignItems: 'center',
          justifyContent: 'center',
          borderColor: hasIssue ? colors.dangerDot : complete ? colors.successDot : colors.lineStrong,
          backgroundColor: complete && !hasIssue ? colors.successDot : 'transparent',
        }}
      >
        {complete && !hasIssue ? (
          <Icon name="check" size={12} color={colors.onAccent} strokeWidth={3} />
        ) : (
          <Mono
            className={`text-micro font-semibold ${hasIssue ? 'text-danger' : 'text-faint'}`}
            maxFontSizeMultiplier={1.1}
          >
            {index}
          </Mono>
        )}
      </View>
      <Txt className="text-heading font-semibold text-fg">{label}</Txt>
      {summary ? (
        <Mono className="ml-auto shrink text-caption text-faint" numberOfLines={1}>
          {summary}
        </Mono>
      ) : null}
    </View>
  );
}
