import { useCallback, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { SectionLabel } from '@/components/ui';
import type { SectionId } from './types';

/**
 * One visible grouping of the form — a label plus its fields, still inside
 * the single continuous scroll (Phase 2: no accordion, no wizard — the user
 * already chose a sticky jump bar over folding). Reports its own top offset
 * via onLayout so QuoteJumpBar can scroll to it; not collapsible, so this is
 * purely a label + layout-reporting wrapper, never a source of unmounted
 * field state.
 */
export function QuoteSection({
  id,
  label,
  onLayout,
  children,
}: {
  id: SectionId;
  label: string;
  /** Reports this section's y offset within the scroll content. */
  onLayout?: (id: SectionId, y: number) => void;
  children: ReactNode;
}) {
  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => onLayout?.(id, e.nativeEvent.layout.y),
    [id, onLayout],
  );
  return (
    <View onLayout={onLayout ? handleLayout : undefined} className="gap-4">
      <SectionLabel>{label}</SectionLabel>
      {children}
    </View>
  );
}
