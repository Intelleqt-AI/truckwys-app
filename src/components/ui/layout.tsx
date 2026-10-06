import { type ReactNode } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  type ScrollViewProps,
} from 'react-native';
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

// ── AppHeader: page title + optional one-line subtitle + live/trailing ─────
// v3 has no eyebrow row. The title is `display` (24/30) rather than the web's
// 28/34: the web itself drops to 24 on a phone when the head is crowded, and
// ours always carries trailing icons.
export function AppHeader({
  title,
  subtitle,
  right,
  live,
}: {
  title: string;
  /** One line, at most ~8 words, under the title (web page-head subtitle). */
  subtitle?: string;
  right?: ReactNode;
  live?: boolean;
}) {
  return (
    // items-center, not items-end: the title block and `right` rarely share a
    // height — Home/Fleet/Finance's title row is ~30px against a 44px bell/avatar
    // row, so bottom-aligning landed the title ~8px lower than the icons'
    // visual centre. Centring the row aligns them regardless of either side.
    <View className="flex-row items-center justify-between gap-3 pb-3.5 pt-2">
      <View className="flex-1">
        <View className="flex-row items-center gap-2.5">
          <Txt className="text-display font-semibold tracking-display">{title}</Txt>
          {live && <SubscriptionDot />}
        </View>
        {subtitle && (
          <Txt className="mt-0.5 text-callout text-faint" numberOfLines={1}>
            {subtitle}
          </Txt>
        )}
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
        <TouchableOpacity
          hitSlop={{ top: 14, bottom: 14, left: 10, right: 10 }}
          onPress={onAction}
          activeOpacity={0.6}
          accessibilityRole="button"
        >
          <Mono className="text-sub font-medium text-link">{action}</Mono>
        </TouchableOpacity>
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
          <TouchableOpacity
            key={t.value}
            onPress={() => onChange(t.value)}
            activeOpacity={0.6}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            className={`min-h-[44px] justify-center border-b-2 ${
              active ? 'border-fg' : 'border-transparent'
            }`}
          >
            <Mono className={`text-callout ${active ? 'font-medium text-fg' : 'text-muted'}`}>
              {t.label}
            </Mono>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── FilterChips: horizontal scrolling filter row ───────────────────────────
// v3: a selected filter is a neutral raised chip, never an ink or accent fill
// (web Segmented / `.bk-chip`). `count` is the web's "Sent 3" figure; pass it only
// when it is the real total, not the size of the page loaded so far.
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T; count?: number }[];
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
          <TouchableOpacity
            key={o.value}
            onPress={() => onChange(o.value)}
            activeOpacity={0.7}
            hitSlop={{ top: 4, bottom: 4 }}
            accessibilityRole="button"
            accessibilityLabel={o.count !== undefined ? `${o.label}, ${o.count}` : o.label}
            accessibilityState={{ selected: active }}
            className={`min-h-[36px] flex-row items-center justify-center gap-1.5 rounded-control border px-3 ${
              active ? 'border-line-strong bg-raised' : 'border-line bg-transparent'
            }`}
          >
            <Mono
              numberOfLines={1}
              className={`text-caption font-medium ${active ? 'text-fg' : 'text-muted'}`}
            >
              {o.label}
            </Mono>
            {o.count !== undefined && (
              <Mono numberOfLines={1} className="text-caption text-faint">
                {o.count}
              </Mono>
            )}
          </TouchableOpacity>
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
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Create"
      className="absolute right-4 h-14 w-14 items-center justify-center rounded-panel bg-btn-primary"
      style={{ bottom: insets.bottom + 96, boxShadow: colors.shadowPop }}
    >
      <Icon name={icon} size={24} color={colors.btnPrimaryFg} strokeWidth={2.2} />
    </TouchableOpacity>
  );
}
