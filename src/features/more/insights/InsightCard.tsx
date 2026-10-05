import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Card, InfoTip, Mono, Txt } from '@/components/ui';
import { useManualRefresh } from '@/hooks/useManualRefresh';
import type { SourceName } from '@/lib/useLedger';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * One question, one card: a short title, a one-line subtitle, the method behind an
 * info icon, and an optional link. The web's InsightCard (components/insights/
 * InsightCard.tsx), so an Insights tab reads the same on both.
 */
export function InsightCard({
  title,
  description,
  info,
  action,
  children,
}: {
  title: string;
  description?: string;
  /** How the figures are worked out, behind the info icon. */
  info?: string;
  action?: { label: string; onPress: () => void };
  children: ReactNode;
}) {
  return (
    <Card className="mb-3 p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Txt className="shrink text-callout font-semibold text-fg">{title}</Txt>
            {info ? <InfoTip text={info} label={`How ${title.toLowerCase()} is worked out`} /> : null}
          </View>
          {description ? <Txt className="mt-0.5 text-caption text-faint">{description}</Txt> : null}
        </View>
        {action ? (
          <TouchableOpacity
            onPress={action.onPress}
            activeOpacity={0.6}
            accessibilityRole="button"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="min-h-[36px] justify-center"
          >
            <Mono className="text-caption font-medium text-link">{action.label}</Mono>
          </TouchableOpacity>
        ) : null}
      </View>
      <View className="mt-3">{children}</View>
    </Card>
  );
}

/** A tab's one-line question (the web's tab subtitle), first thing on the page. */
export function TabIntro({ text }: { text: string }) {
  return <Txt className="mb-3 text-caption text-faint">{text}</Txt>;
}

/** A tab's empty or no-data message with an optional link to the screen that fills it. */
export function InsightEmpty({
  text,
  action,
}: {
  text: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View>
      <Txt className="text-callout text-muted">{text}</Txt>
      {action ? (
        <TouchableOpacity
          onPress={action.onPress}
          activeOpacity={0.6}
          accessibilityRole="button"
          className="mt-1 min-h-[44px] justify-center self-start"
        >
          <Mono className="text-caption font-medium text-link">{action.label}</Mono>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/**
 * A tab's scroll view with pull to refresh. `keys` are the ledgers it reads, so
 * pulling refetches exactly those (`ledger-<name>`, see lib/useLedger.ts).
 */
export function TabScroll({ keys, children }: { keys: readonly SourceName[]; children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { refreshing, onRefresh } = useManualRefresh(() =>
    Promise.all(keys.map((k) => queryClient.refetchQueries({ queryKey: [`ledger-${k}`] }))),
  );
  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 24 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.faint}
          colors={[colors.faint]}
          progressBackgroundColor={colors.surface}
        />
      }
    >
      {children}
    </ScrollView>
  );
}
