import { type ReactNode } from 'react';
import { View, ScrollView, Pressable, RefreshControl, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt, Mono, Label } from './Text';
import { Icon, type IconName } from './icons';
import { SubscriptionDot } from './SubscriptionDot';
import { useTheme } from '@/theme/ThemeProvider';

// ── Screen: deep canvas + safe area (v3: no ambient glow) ──────────────────
export function Screen({
  children,
  scroll = true,
  padded = true,
  className = '',
  contentClassName = '',
  onRefresh,
  refreshing = false,
  topInset = true,
  ...props
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  className?: string;
  contentClassName?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  // Set false when a native navigation header already owns the top inset.
  topInset?: boolean;
} & ScrollViewProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const pad = padded ? 'px-screen' : '';
  const contentPad = { paddingBottom: insets.bottom + 100 };

  const body = scroll ? (
    <ScrollView
      className={`flex-1 ${className}`}
      contentContainerStyle={contentPad}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.faint}
            colors={[colors.faint]}
            progressBackgroundColor={colors.surface}
          />
        ) : undefined
      }
      {...props}
    >
      <View className={`${pad} ${contentClassName}`}>{children}</View>
    </ScrollView>
  ) : (
    <View className={`flex-1 ${pad} ${className} ${contentClassName}`}>{children}</View>
  );

  return (
    <View className="flex-1 bg-bg-deep" style={{ paddingTop: topInset ? insets.top : 0 }}>
      {body}
    </View>
  );
}

// ── AppHeader: optional eyebrow + page title + optional live/trailing ──────
export function AppHeader({
  eyebrow,
  title,
  right,
  live,
}: {
  eyebrow?: string;
  title: string;
  right?: ReactNode;
  live?: boolean;
}) {
  return (
    // items-center, not items-end: the title block (with or without an
    // eyebrow) and `right` rarely share a height — e.g. Home/Fleet/Finance
    // pass no eyebrow, so the title's ~28px row was bottom-aligning against a
    // 44px bell/avatar row, landing its visual centre ~8px lower than the
    // icons'. Centring the row aligns them regardless of either side's height.
    <View className="flex-row items-center justify-between gap-3 pb-3.5 pt-2">
      <View className="flex-1">
        {eyebrow && <Label className="mb-1">{eyebrow}</Label>}
        <View className="flex-row items-center gap-2.5">
          <Txt className="text-display font-semibold">{title}</Txt>
          {live && <SubscriptionDot />}
        </View>
      </View>
      {right}
    </View>
  );
}

// ── SectionLabel: muted section caption, optional trailing link action ─────
export function SectionLabel({
  children,
  action,
  onAction,
}: {
  children: ReactNode;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View className="mb-2.5 flex-row items-center justify-between">
      <Label className="text-sub">{children as string}</Label>
      {action && (
        <Pressable hitSlop={8} onPress={onAction} accessibilityRole="button">
          <Mono className="text-sub font-medium text-link">{action}</Mono>
        </Pressable>
      )}
    </View>
  );
}

// ── UnderlineTabs: in-screen tabs (Bookings/Fleet/Finance) ─────────────────
export function UnderlineTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View className="flex-row gap-6 border-b border-line">
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <Pressable
            key={t.value}
            onPress={() => onChange(t.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            className={`min-h-[44px] justify-center border-b-2 ${
              active ? 'border-fg' : 'border-transparent'
            }`}
          >
            <Mono className={`text-callout ${active ? 'font-medium text-fg' : 'text-muted'}`}>
              {t.label}
            </Mono>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── FilterChips: horizontal scrolling filter row ───────────────────────────
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8 }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"

            accessibilityState={{ selected: active }}
            className={`min-h-[34px] justify-center rounded-pill border px-3.5 ${
              active ? 'border-btn-primary bg-btn-primary' : 'border-line-active bg-transparent'
            }`}
          >
            <Mono
              numberOfLines={1}
              className={`text-caption font-medium ${active ? '' : 'text-muted'}`}
              style={active ? { color: colors.btnPrimaryFg } : undefined}
            >
              {o.label}
            </Mono>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ── Fab: floating action button (create) ───────────────────────────────────
export function Fab({
  onPress,
  onLongPress,
  icon = 'plus',
}: {
  onPress: () => void;
  /** Optional secondary entry point (e.g. "New quote by voice") — undiscoverable
      on its own, so callers pair it with a more visible entry point too. */
  onLongPress?: () => void;
  icon?: IconName;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel="Create"
      className="absolute right-4 h-14 w-14 items-center justify-center rounded-panel bg-btn-primary active:opacity-90"
      style={{ bottom: insets.bottom + 96, boxShadow: colors.shadowPop }}
    >
      <Icon name={icon} size={24} color={colors.btnPrimaryFg} strokeWidth={2.2} />
    </Pressable>
  );
}
