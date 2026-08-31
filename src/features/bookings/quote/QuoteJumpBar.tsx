import { forwardRef, memo, useImperativeHandle, useState } from 'react';
import { View, Pressable } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Mono } from '@/components/ui';
import type { SectionId } from './types';

export interface QuoteJumpBarHandle {
  /** Highlights a chip without going through parent state — called from the
      screen's scroll-end handler, so scrolling never re-renders the form. */
  setActive: (id: SectionId) => void;
}

export interface QuoteJumpBarSection {
  id: SectionId;
  label: string;
  complete: boolean;
  /** True once a Send attempt has surfaced a blocking issue in this section
      (Phase 3) — takes precedence over `complete` for the dot colour. */
  hasIssue?: boolean;
}

/**
 * Sticky chip bar above the scrollable form — rendered as a sibling of
 * BottomSheetScrollView (gorhom allows non-scrollable siblings inside
 * BottomSheet), so unlike everything else on this screen it never scrolls
 * away. Each chip carries a small dot: danger once a Send attempt has found
 * an issue here, filled once that section's required fields are complete,
 * hollow otherwise.
 */
export const QuoteJumpBar = memo(
  forwardRef<
    QuoteJumpBarHandle,
    {
      sections: QuoteJumpBarSection[];
      onPress: (id: SectionId) => void;
    }
  >(function QuoteJumpBar({ sections, onPress }, ref) {
    const [active, setActive] = useState<SectionId | null>(sections[0]?.id ?? null);
    useImperativeHandle(ref, () => ({ setActive }), []);

    return (
      <View className="border-b border-line bg-surface">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingVertical: 8 }}
        >
          {sections.map((s) => {
            const isActive = s.id === active;
            return (
              <Pressable
                key={s.id}
                onPress={() => onPress(s.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={`${s.label}${s.hasIssue ? ', needs attention' : s.complete ? ', complete' : ', incomplete'}`}
                className={`min-h-[32px] flex-row items-center gap-1.5 rounded-pill border px-3 ${
                  isActive ? 'border-accent bg-accent-dim' : 'border-line bg-surface'
                }`}
              >
                <View
                  style={{ width: 6, height: 6, borderRadius: 6 }}
                  className={
                    s.hasIssue ? 'bg-danger' : s.complete ? 'bg-success' : 'bg-line-active'
                  }
                />
                <Mono
                  className={`text-micro uppercase tracking-wide ${isActive ? 'text-accent' : 'text-muted'}`}
                >
                  {s.label}
                </Mono>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  }),
);
