import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Label } from '@/components/ui';
import { formatOperationalDate, formatOperationalTime } from '@/lib/formatters';

// ── HeaderClock: the header's eyebrow slot, two lines, self-ticking ───────
// Date + "HH:mm:ss SAST" (matching web's live clock) don't fit on one line
// next to the "Overview" title and the header's own right-side icons, so
// this wraps onto a second line instead of trimming content. Seconds mean it
// has to actually tick — that tick is isolated to this one small component
// (its own state, its own interval) so HomeScreen itself doesn't re-render
// every second the way CommandBar's old clock avoided the same problem.
export function HeaderClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <View>
      <Label>{formatOperationalDate(now)}</Label>
      <Label className="mt-0.5">{formatOperationalTime(now)}</Label>
    </View>
  );
}
