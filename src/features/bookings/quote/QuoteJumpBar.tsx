import { forwardRef, memo, useEffect, useImperativeHandle, useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Icon, Mono } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { EASE_OUT, motion } from '@/theme/tokens';
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
 * away. Each chip carries a small mark: danger once a Send attempt has found
 * an issue here, a tick once that section's required fields are complete,
 * a hollow ring otherwise.
 *
 * The ink hairline along the bar's lower edge is the quote's progress —
 * how many of the sections are complete — with the count at the right. It
 * sits on the bar's own bottom border, so the bar doesn't grow.
 */
export const QuoteJumpBar = memo(
  forwardRef<
    QuoteJumpBarHandle,
    {
      sections: QuoteJumpBarSection[];
      onPress: (id: SectionId) => void;
    }
  >(function QuoteJumpBar({ sections, onPress }, ref) {
    const { colors } = useTheme();
    const reduced = useReducedMotion();
    const [active, setActive] = useState<SectionId | null>(sections[0]?.id ?? null);
    useImperativeHandle(ref, () => ({ setActive }), []);

    const done = sections.filter((s) => s.complete).length;
    const progress = sections.length ? (done / sections.length) * 100 : 0;
    const width = useSharedValue(progress);
    useEffect(() => {
      width.value = reduced
        ? progress
        : withTiming(progress, { duration: motion.slow, easing: Easing.bezier(...EASE_OUT) });
    }, [progress, reduced, width]);
    const progressStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));

    return (
      <View className="border-b border-line bg-surface">
        <View className="flex-row items-center">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flex: 1 }}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingVertical: 8 }}
          >
            {sections.map((s) => {
              const isActive = s.id === active;
              return (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => onPress(s.id)}
                  activeOpacity={0.7}
                  // 32 drawn + 12 = a 44 hit area, still inside the bar's own padding.
                  hitSlop={{ top: 6, bottom: 6 }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={`${s.label}${s.hasIssue ? ', needs attention' : s.complete ? ', complete' : ', incomplete'}`}
                  className={`min-h-[32px] flex-row items-center gap-1.5 rounded-control border px-3 ${
                    isActive ? 'border-line-strong bg-raised' : 'border-line bg-surface'
                  }`}
                >
                  {s.hasIssue ? (
                    <View
                      style={{ width: 6, height: 6, borderRadius: 6 }}
                      className="bg-danger-dot"
                    />
                  ) : s.complete ? (
                    <Icon name="check" size={12} color={colors.successDot} strokeWidth={2.6} />
                  ) : (
                    <View
                      style={{ width: 8, height: 8, borderRadius: 8, borderWidth: 1.5 }}
                      className="border-line-strong"
                    />
                  )}
                  <Mono
                    className={`text-caption font-medium ${isActive ? 'text-fg' : 'text-muted'}`}
                  >
                    {s.label}
                  </Mono>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <Mono
            className="pr-4 text-caption text-faint"
            accessibilityLabel={`${done} of ${sections.length} sections complete`}
          >
            {done}/{sections.length}
          </Mono>
        </View>
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: 0,
              bottom: -1,
              height: 2,
              backgroundColor: colors.fg,
            },
            progressStyle,
          ]}
        />
      </View>
    );
  }),
);
