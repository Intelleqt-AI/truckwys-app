import type { ReactNode } from 'react';
import { View, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Badge, Banner, Button, Card, Icon, Txt, type IconName } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import type { StatusTone } from '../copy';

// Small building blocks shared by the accounting tabs.

/** A status chip from a (tone, label) pair, as the copy helpers return them. */
export function ToneBadge({ tone, label }: { tone: StatusTone; label: string }) {
  return <Badge label={label} tone={tone} dot />;
}

/** A card with a title, an optional description, optional actions under it, and a body. */
export function AcctCard({
  title,
  description,
  actions,
  children,
  flush = false,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  /** No body padding: the children draw their own rows. */
  flush?: boolean;
}) {
  return (
    <Card className="mb-4 overflow-hidden">
      {(title || description || actions) && (
        <View className={`gap-1.5 p-4 ${children != null && children !== false ? 'border-b border-line-row' : ''}`}>
          {typeof title === 'string' ? <Txt className="text-body font-semibold text-fg">{title}</Txt> : title}
          {typeof description === 'string' ? (
            <Txt className="text-sub text-muted">{description}</Txt>
          ) : (
            description
          )}
          {actions && <View className="mt-1.5 flex-row flex-wrap gap-2.5">{actions}</View>}
        </View>
      )}
      {children != null && children !== false && <View className={flush ? '' : 'p-4'}>{children}</View>}
    </Card>
  );
}

export type StepLook = 'done' | 'todo' | 'busy' | 'bad' | 'skip' | 'warn';

/** One 22pt marker for every state, so a list of steps reads as one component. */
export function StepMarker({ look, n }: { look: StepLook; n?: number }) {
  const { colors } = useTheme();
  const box = { width: 22, height: 22, borderRadius: 11 } as const;
  if (look === 'done') {
    return (
      <View className="items-center justify-center" style={{ ...box, backgroundColor: colors.successDot }}>
        <Icon name="check" size={13} color={colors.bgDeep} strokeWidth={3} />
      </View>
    );
  }
  if (look === 'busy') {
    return (
      <View className="items-center justify-center" style={box}>
        <ActivityIndicator size="small" color={colors.muted} />
      </View>
    );
  }
  if (look === 'bad') {
    return (
      <View className="items-center justify-center" style={{ ...box, backgroundColor: colors.dangerDot }}>
        <Icon name="x" size={13} color={colors.bgDeep} strokeWidth={3} />
      </View>
    );
  }
  const border = look === 'warn' ? colors.warningDot : colors.faint;
  return (
    <View className="items-center justify-center" style={{ ...box, borderWidth: 1.5, borderColor: border }}>
      {n != null && <Txt className="text-micro font-medium text-muted">{n}</Txt>}
    </View>
  );
}

/** A step: marker, title and description, and an optional action on its own line. */
export function StepRow({
  look,
  n,
  title,
  desc,
  action,
  last,
  trailing,
}: {
  look: StepLook;
  n?: number;
  title: string;
  desc?: ReactNode;
  action?: ReactNode;
  last?: boolean;
  trailing?: string;
}) {
  return (
    <View className={`flex-row gap-3 px-4 py-3.5 ${last ? '' : 'border-b border-line-row'}`}>
      <StepMarker look={look} n={n} />
      <View className="flex-1 gap-1">
        <View className="flex-row items-start justify-between gap-3">
          <Txt className="flex-1 text-callout font-medium text-fg">{title}</Txt>
          {!!trailing && <Txt className="text-caption text-muted">{trailing}</Txt>}
        </View>
        {typeof desc === 'string' ? <Txt className="text-sub text-muted">{desc}</Txt> : desc}
        {action && <View className="mt-1.5 flex-row flex-wrap gap-2.5">{action}</View>}
      </View>
    </View>
  );
}

/** A tappable text link (never a bare label: it has a real hit area). */
export function LinkButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.6}
      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
      accessibilityRole="button"
      className="min-h-[32px] justify-center self-start"
    >
      <Txt className={`text-sub font-medium ${disabled ? 'text-faint' : 'text-link'}`}>{label}</Txt>
    </TouchableOpacity>
  );
}

/** A small count tile ("Waiting to send 3"). */
export function CountTile({ label, value, muted }: { label: string; value: number | string; muted?: boolean }) {
  return (
    <View className="min-w-[44%] flex-1 rounded-control border border-line bg-surface px-3 py-2.5">
      <Txt className="text-caption text-muted">{label}</Txt>
      <Txt className={`mt-0.5 text-heading font-semibold ${muted ? 'text-faint' : 'text-fg'}`}>
        {typeof value === 'number' ? value.toLocaleString('en-ZA') : value}
      </Txt>
    </View>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View className="items-start gap-3 p-4">
      <Banner tone="danger" message={message} />
      {onRetry && <Button label="Try again" variant="secondary" size="sm" onPress={onRetry} />}
    </View>
  );
}

export type { IconName };
export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-ZA')} ${n === 1 ? one : many}`;
