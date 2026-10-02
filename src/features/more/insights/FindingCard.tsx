import { useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Badge, Card, Icon, Mono, Txt, type Tone } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { plural } from '@/lib/ledger';
import { rand2, randWhole, type Finding, type Severity, type Target } from './findings';

const SEVERITY: Record<Severity, { label: string; tone: Tone; bar: string }> = {
  high: { label: 'High', tone: 'danger', bar: 'bg-danger-dot' },
  medium: { label: 'Medium', tone: 'warning', bar: 'bg-warning-dot' },
  low: { label: 'Low', tone: 'neutral', bar: 'bg-faint' },
};

const EVIDENCE_PREVIEW = 5;

/**
 * One finding: the rand figure and its short headline, one supporting line, ONE
 * action, and two quiet toggles for the records behind it and how it was worked
 * out. The thin bar is the same rand value the feed is ranked by, against the
 * largest finding.
 */
export function FindingCard({
  finding: f,
  scaleTo,
  onOpen,
}: {
  finding: Finding;
  scaleTo: number;
  onOpen: (t: Target) => void;
}) {
  const { colors } = useTheme();
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const [all, setAll] = useState(false);
  const sev = SEVERITY[f.severity];
  const n = f.evidence.length;
  const rows = all ? f.evidence : f.evidence.slice(0, EVIDENCE_PREVIEW);
  const pct = scaleTo > 0 ? Math.max(1.5, Math.min(100, (f.amount / scaleTo) * 100)) : 0;
  const noun = n === 1 ? f.evidenceNoun[0] : f.evidenceNoun[1];

  return (
    <Card className="mb-3 p-4">
      <View className="flex-row items-center gap-2">
        <Badge label={sev.label} tone={sev.tone} />
        <Txt className="flex-1 text-caption text-faint" numberOfLines={1}>
          {f.category} · {f.basis}
          {f.confidence !== 'high' ? `, ${f.confidence} confidence` : ''}
        </Txt>
      </View>

      <View className="mt-3">
        <Mono className="text-display font-semibold text-fg">
          {f.basis === 'Estimated' ? 'About ' : ''}
          {randWhole(f.amount)}
        </Mono>
        <Txt className="mt-0.5 text-callout font-medium text-fg">{f.headline}</Txt>
      </View>

      <View className="mt-2.5 h-[3px] overflow-hidden rounded-pill bg-surface-hover">
        <View className={`h-[3px] rounded-pill ${sev.bar}`} style={{ width: `${pct}%` }} />
      </View>

      <Txt className="mt-2.5 text-sub text-muted">{f.line}</Txt>

      <TouchableOpacity
        onPress={() => onOpen(f.action.target)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={f.action.label}
        className="mt-3.5 min-h-[44px] flex-row items-center justify-between rounded-control border border-line-active bg-surface-hover px-3.5"
      >
        <Txt className="flex-1 text-callout font-medium text-fg" numberOfLines={2}>
          {f.action.label}
        </Txt>
        <Icon name="chevronRight" size={16} color={colors.muted} />
      </TouchableOpacity>

      <View className="mt-3 flex-row flex-wrap items-center gap-x-5 gap-y-1 border-t border-line-row pt-3">
        <TouchableOpacity
          onPress={() => setEvidenceOpen((o) => !o)}
          activeOpacity={0.6}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 8 }}
          accessibilityRole="button"
          accessibilityState={{ expanded: evidenceOpen }}
          className="min-h-[36px] flex-row items-center gap-1"
        >
          <Mono className="text-caption font-medium text-link">
            {evidenceOpen ? 'Hide' : 'Show'} {plural(n, f.evidenceNoun[0], f.evidenceNoun[1])}
          </Mono>
          <Icon name={evidenceOpen ? 'chevronUp' : 'chevronDown'} size={12} color={colors.link} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setMethodOpen((o) => !o)}
          activeOpacity={0.6}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 8 }}
          accessibilityRole="button"
          accessibilityState={{ expanded: methodOpen }}
          className="min-h-[36px] flex-row items-center gap-1"
        >
          <Mono className="text-caption font-medium text-muted">How it is worked out</Mono>
          <Icon name={methodOpen ? 'chevronUp' : 'chevronDown'} size={12} color={colors.muted} />
        </TouchableOpacity>
      </View>

      {methodOpen && (
        <View className="mt-3 rounded-control border border-line-row bg-surface-hover p-3">
          <Txt className="text-sub text-muted">{f.method}</Txt>
        </View>
      )}

      {evidenceOpen && (
        <View className="mt-3 overflow-hidden rounded-control border border-line-row">
          {rows.map((r, idx) => (
            <TouchableOpacity
              key={r.id}
              onPress={() => onOpen(r.target)}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={`${noun}: ${r.ref}, ${r.label}`}
              className={`flex-row items-center gap-3 px-3 py-2.5 ${
                idx === rows.length - 1 && n <= EVIDENCE_PREVIEW ? '' : 'border-b border-line-row'
              }`}
            >
              <View className="flex-1">
                <Txt className="text-sub text-fg" numberOfLines={1}>
                  {r.label || r.ref}
                </Txt>
                <Txt className="mt-0.5 text-caption text-faint" numberOfLines={1}>
                  {[r.label ? r.ref : '', r.note].filter(Boolean).join(' · ')}
                </Txt>
              </View>
              <Mono className="text-sub text-fg" numberOfLines={1}>
                {rand2(r.amount)}
              </Mono>
            </TouchableOpacity>
          ))}
          {n > EVIDENCE_PREVIEW && (
            <TouchableOpacity
              onPress={() => setAll((a) => !a)}
              activeOpacity={0.6}
              accessibilityRole="button"
              className="min-h-[44px] items-center justify-center"
            >
              <Mono className="text-caption font-medium text-link">
                {all ? 'Show fewer' : `Show all ${n}`}
              </Mono>
            </TouchableOpacity>
          )}
        </View>
      )}
    </Card>
  );
}
