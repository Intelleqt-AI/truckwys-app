import { useState } from 'react';
import { Modal, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from './icons';
import { Txt } from './Text';
import { useTheme } from '@/theme/ThemeProvider';
import { motion } from '@/theme/tokens';

export interface OverflowAction {
  label: string;
  onPress: () => void;
  icon?: IconName;
  /** Danger text. Always drawn last, after a divider, whatever its position here. */
  destructive?: boolean;
  disabled?: boolean;
  /** Why it is disabled — shown under the label, as the web's disabled items do. */
  hint?: string;
}

/**
 * Web's "⋯" row/header menu as a bottom sheet: a 36pt bordered trigger (44pt hit
 * area) and rows 48pt tall. It exists so a detail screen can carry ONE primary
 * action and tuck the rest away instead of stacking four footer buttons.
 */
export function OverflowMenu({
  actions,
  accessibilityLabel = 'More actions',
  title,
}: {
  actions: OverflowAction[];
  accessibilityLabel?: string;
  title?: string;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  if (actions.length === 0) return null;
  const ordered = [...actions.filter((a) => !a.destructive), ...actions.filter((a) => a.destructive)];

  const run = (a: OverflowAction) => {
    setOpen(false);
    // Let the sheet finish dismissing first: iOS won't present an Alert or another
    // Modal while this one is still on its way out.
    setTimeout(a.onPress, 280);
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.6}
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        className="h-9 w-9 items-center justify-center rounded-control border border-line-active"
      >
        <Icon name="more" size={18} color={colors.fg} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <Animated.View
          entering={FadeIn.duration(motion.fast)}
          className="flex-1 justify-end bg-backdrop"
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close menu"
            className="flex-1"
          />
          <Animated.View
            entering={SlideInDown.duration(motion.smooth)}
            className="rounded-t-panel border border-b-0 border-line bg-elevated px-3 pt-2"
            style={{ paddingBottom: insets.bottom + 8, boxShadow: colors.shadowPop }}
          >
            {title && (
              <Txt className="px-2 pb-1 pt-2 text-caption font-medium text-faint">{title}</Txt>
            )}
            {ordered.map((a, i) => {
              const firstDestructive = !!a.destructive && !ordered[i - 1]?.destructive && i > 0;
              const tint = a.disabled ? colors.disabled : a.destructive ? colors.danger : colors.fg;
              return (
                <View key={a.label}>
                  {firstDestructive && <View className="mx-1.5 my-1 h-px bg-line" />}
                  <TouchableOpacity
                    onPress={() => run(a)}
                    disabled={a.disabled}
                    activeOpacity={0.6}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !!a.disabled }}
                    className="min-h-[48px] flex-row items-center gap-3 rounded-chip px-2.5 py-2"
                  >
                    {a.icon && <Icon name={a.icon} size={18} color={tint} />}
                    <View className="flex-1">
                      <Txt className="text-body" style={{ color: tint }}>
                        {a.label}
                      </Txt>
                      {a.disabled && a.hint && (
                        <Txt className="text-caption text-faint">{a.hint}</Txt>
                      )}
                    </View>
                  </TouchableOpacity>
                </View>
              );
            })}
          </Animated.View>
        </Animated.View>
      </Modal>
    </>
  );
}
