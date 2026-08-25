import { type ReactNode } from 'react';
import { View, ScrollView, Pressable, RefreshControl, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt, Mono, Label } from './Text';
import { Icon, type IconName } from './icons';
import { LiveDot } from './primitives';
import { useTheme } from '@/theme/ThemeProvider';

// ── Ambient glow: one fixed, faint accent bloom behind the workspace ───────
export function AmbientGlow() {
  const { colors } = useTheme();
  return (
    <View pointerEvents="none" className="absolute inset-0 overflow-hidden">
      <View
        style={{
          position: 'absolute',
          top: -120,
          left: '18%',
          width: 320,
          height: 320,
          borderRadius: 320,
          backgroundColor: colors.glow,
        }}
      />
    </View>
  );
}

// ── Screen: deep canvas + safe area + ambient glow ─────────────────────────
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
            tintColor={colors.accent}
            colors={[colors.accent]}
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
      <AmbientGlow />
      {body}
    </View>
  );
}

// ── AppHeader: mono eyebrow + big title + optional live/trailing ───────────
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
    <View className="flex-row items-end justify-between gap-3 pb-3.5 pt-2">
      <View className="flex-1">
        {eyebrow && <Label className="mb-1">{eyebrow}</Label>}
        <View className="flex-row items-center gap-2.5">
          <Txt className="text-title font-semibold tracking-[-0.02em]" style={{ fontSize: 26 }}>
            {title}
          </Txt>
          {live && <LiveDot label="Live" />}
        </View>
      </View>
      {right}
    </View>
  );
}

// ── SectionLabel: mono caps row, optional trailing action ──────────────────
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
      <Label className="tracking-label">{children as string}</Label>
      {action && (
        <Pressable hitSlop={8} onPress={onAction} accessibilityRole="button">
          <Mono className="text-micro uppercase tracking-label text-accent">{action}</Mono>
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
            className={`border-b-2 py-3 ${active ? 'border-accent' : 'border-transparent'}`}
          >
            <Mono
              className={`text-caption uppercase tracking-wide ${
                active ? 'font-semibold text-fg' : 'text-muted'
              }`}
            >
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
            className={`min-h-[34px] justify-center rounded-xs border border-line px-3 ${
              active ? 'bg-accent' : 'bg-surface'
            }`}
          >
            <Mono
              numberOfLines={1}
              className={`text-micro uppercase tracking-wide ${
                active ? 'text-on-accent' : 'text-muted'
              }`}
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
export function Fab({ onPress, icon = 'plus' }: { onPress: () => void; icon?: IconName }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Create"
      className="absolute right-4 h-14 w-14 items-center justify-center rounded-sm bg-accent active:opacity-90"
      style={{
        bottom: insets.bottom + 96,
        shadowColor: colors.accent,
        shadowOpacity: 0.4,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 8 },
        elevation: 8,
      }}
    >
      <Icon name={icon} size={26} color={colors.onAccent} strokeWidth={2.4} />
    </Pressable>
  );
}
