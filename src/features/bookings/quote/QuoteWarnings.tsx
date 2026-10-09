import { memo, useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Icon, Mono, Txt } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import type { QuoteWarning } from './rules';

/**
 * Structured quote warnings (QUOTE-RULES §10): one compact row each — a dot,
 * the ≤ 8-word title and one action. The detail sentence (and a second action,
 * if any) shows on tap. Blocking rows are red; they also disable Send.
 */
function QuoteWarningsImpl({
  warnings,
  onAction,
}: {
  warnings: QuoteWarning[];
  onAction: (actionId: string, w: QuoteWarning) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (!warnings.length) return null;
  return (
    <View className="overflow-hidden rounded-control border border-line">
      {warnings.map((w, i) => (
        <WarningRow
          key={`${w.code}-${i}`}
          w={w}
          first={i === 0}
          open={open === `${w.code}-${i}`}
          onToggle={() => setOpen((o) => (o === `${w.code}-${i}` ? null : `${w.code}-${i}`))}
          onAction={onAction}
        />
      ))}
    </View>
  );
}

function WarningRow({
  w,
  first,
  open,
  onToggle,
  onAction,
}: {
  w: QuoteWarning;
  first: boolean;
  open: boolean;
  onToggle: () => void;
  onAction: (actionId: string, w: QuoteWarning) => void;
}) {
  const { colors } = useTheme();
  const block = w.severity === 'block';
  const [primary, ...rest] = w.actions;
  return (
    <View className={`${first ? '' : 'border-t border-line-row'} ${block ? 'bg-danger-bg' : 'bg-warning-bg'}`}>
      <View className="min-h-[52px] flex-row items-center gap-2 pl-3 pr-2">
        <TouchableOpacity
          onPress={onToggle}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${w.title}. ${w.detail}`}
          className="min-h-[52px] flex-1 flex-row items-center gap-2"
        >
          <Icon name="alert" size={15} color={block ? colors.dangerDot : colors.warningDot} />
          <Txt
            className={`shrink text-sub font-medium ${block ? 'text-danger' : 'text-warning'}`}
            numberOfLines={open ? 3 : 2}
          >
            {w.title}
          </Txt>
        </TouchableOpacity>
        {primary && (
          <TouchableOpacity
            onPress={() => onAction(primary.id, w)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={primary.label}
            hitSlop={{ top: 4, bottom: 4 }}
            className="min-h-[44px] shrink-0 items-center justify-center rounded-control border border-line-active bg-surface px-3"
          >
            <Mono className="text-caption font-medium text-fg" numberOfLines={1}>
              {primary.label}
            </Mono>
          </TouchableOpacity>
        )}
      </View>
      {open && (
        <View className="gap-2 px-3 pb-3">
          <Txt className="text-sub text-muted">{w.detail}</Txt>
          {rest.map((a) => (
            <TouchableOpacity
              key={a.id}
              onPress={() => onAction(a.id, w)}
              activeOpacity={0.6}
              accessibilityRole="button"
              className="min-h-[44px] flex-row items-center gap-1 self-start"
            >
              <Mono className="text-sub text-link">{a.label}</Mono>
              <Icon name="chevronRight" size={13} color={colors.link} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

export const QuoteWarnings = memo(QuoteWarningsImpl);
