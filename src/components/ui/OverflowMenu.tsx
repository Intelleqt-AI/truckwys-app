import { useRef, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { AppSheet } from './AppSheet';
import { Icon, type IconName } from './icons';
import { Mono, Txt } from './Text';
import { useTheme } from '@/theme/ThemeProvider';

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
  subtitle,
}: {
  actions: OverflowAction[];
  accessibilityLabel?: string;
  /** Names the record the actions act on; shown as a header above them. */
  title?: string;
  /** Detail line under `title` (category, amount, date…). */
  subtitle?: string;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const pending = useRef<(() => void) | null>(null);

  if (actions.length === 0) return null;
  const ordered = [...actions.filter((a) => !a.destructive), ...actions.filter((a) => a.destructive)];

  // The tapped action waits for the sheet to finish leaving (AppSheet's
  // onDismissed): iOS won't present an Alert or another Modal while this one is
  // still on its way out.
  const run = (a: OverflowAction) => {
    pending.current = a.onPress;
    setOpen(false);
  };
  const runPending = () => {
    const fn = pending.current;
    pending.current = null;
    fn?.();
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
      <AppSheet open={open} onClose={() => setOpen(false)} onDismissed={runPending}>
        <View className="px-3 pt-1">
          {title && (
            <>
              <View className="px-2.5 pb-2 pt-1">
                <Txt className="text-body font-medium text-fg" numberOfLines={1}>
                  {title}
                </Txt>
                {subtitle && (
                  <Mono className="mt-0.5 text-caption text-muted" numberOfLines={1}>
                    {subtitle}
                  </Mono>
                )}
              </View>
              <View className="mx-1.5 mb-1 h-px bg-line" />
            </>
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
        </View>
      </AppSheet>
    </>
  );
}
