import { View } from 'react-native';
import { Card, InfoTip, Label, Mono } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

// ── OwedTile: Home's one emphasis tile ("Owed to you", the only accent figure on
// the screen). The kit's StatCard has no slot under the figure, so this is the
// same tile anatomy with the thin past-due share strip added: the part of what is
// owed whose due date has passed, as a share of the whole.
export function OwedTile({
  value,
  owed,
  pastDue,
  note,
  noteTone,
  tip,
}: {
  value: string;
  owed: number;
  pastDue: number;
  note?: string;
  noteTone?: 'success' | 'danger';
  tip: string;
}) {
  const { colors } = useTheme();
  const share = owed > 0.005 ? Math.min(1, Math.max(0, pastDue / owed)) : 0;
  const noteColor = noteTone ? colors[noteTone] : undefined;

  return (
    <Card className="flex-1 p-3">
      <View className="flex-row items-center justify-between gap-1">
        <Label className="shrink text-faint" numberOfLines={1}>
          Owed to you
        </Label>
        <InfoTip text={tip} label="About owed to you" />
      </View>
      <Mono
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.55}
        className="mt-1.5 tracking-display text-accent"
        style={{ fontSize: 20, lineHeight: 26, fontWeight: '600' }}
      >
        {value}
      </Mono>
      {share > 0 && (
        <View
          accessibilityLabel={`${Math.round(share * 100)} percent of what is owed is past due`}
          className="mt-2 h-1 overflow-hidden rounded-pill bg-surface-hover"
        >
          <View
            style={{
              height: 4,
              width: `${Math.max(share * 100, 4)}%`,
              borderRadius: 2,
              backgroundColor: colors.danger,
            }}
          />
        </View>
      )}
      {note && (
        <Mono
          className={`mt-1 text-caption ${noteColor ? '' : 'text-faint'}`}
          style={noteColor ? { color: noteColor } : undefined}
        >
          {note}
        </Mono>
      )}
    </Card>
  );
}
