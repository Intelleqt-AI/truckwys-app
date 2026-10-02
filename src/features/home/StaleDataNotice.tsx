import { useEffect, useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Icon, Mono, Txt } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

// "HH:MM" in South African time, whatever zone the phone is set to.
function formatTime(ms: number): string {
  const d = new Date(ms);
  try {
    return new Intl.DateTimeFormat('en-ZA', {
      timeZone: 'Africa/Johannesburg',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
  } catch {
    // Hermes builds without full Intl timezone data.
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}

/**
 * Silent while the figures on screen are current. Shows only when they may be out
 * of date, so it never competes with the data itself. Any screen that shows it must
 * pair it with useAutoRefreshStale (hooks/useAutoRefreshStale.ts), which refreshes
 * stale figures on its own, so this is a fallback for when that can't happen:
 * offline, or a refresh that failed. Without the pairing the notice just appears
 * five minutes after every load. Port of the web's
 * StaleDataNotice; reusable on any screen that reads from the query cache.
 *
 *   fresh (loaded in the last `staleAfterMs`, no failed refresh)   nothing
 *   older, or no refresh since                                     "These figures may be out of date. Showing data from 14:05." [Refresh now]
 *   the latest refresh failed, older figures still shown           "Couldn't refresh. Showing data from 14:05." [Try again]
 *   a refresh the user asked for is running                        "Refreshing the figures…"
 *
 * `updatedAt` is the OLDEST load among everything shown (epoch ms, React Query's
 * `dataUpdatedAt`); 0 means nothing has loaded yet and shows nothing.
 */
export function StaleDataNotice({
  updatedAt,
  refreshFailed = false,
  refreshing = false,
  onRetry,
  staleAfterMs = 5 * 60_000,
  className = '',
}: {
  updatedAt: number;
  /** The most recent refresh failed while older data is still on screen. */
  refreshFailed?: boolean;
  /** A refresh the user asked for is running: the button says so and waits. */
  refreshing?: boolean;
  onRetry?: () => void;
  /** Data older than this is treated as stale even without an error. */
  staleAfterMs?: number;
  /** Extra classes on the root, e.g. a bottom margin that only exists while shown. */
  className?: string;
}) {
  const { colors } = useTheme();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!updatedAt) return null;
  const stale = now - updatedAt > staleAfterMs;
  if (!refreshing && !refreshFailed && !stale) return null;

  const lead = refreshing
    ? 'Refreshing the figures…'
    : refreshFailed
      ? "Couldn't refresh."
      : 'These figures may be out of date.';

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className={`flex-row items-center gap-2.5 rounded-control border border-line-active bg-warning-bg p-3 ${className}`}
    >
      <Icon name="alert" size={17} color={colors.warningDot} />
      <Txt className="flex-1 text-sub text-muted">
        {lead} Showing data from {formatTime(updatedAt)}.
      </Txt>
      {onRetry && (
        <TouchableOpacity
          onPress={onRetry}
          disabled={refreshing}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={refreshing ? 'Refreshing' : refreshFailed ? 'Try again' : 'Refresh now'}
          accessibilityState={{ disabled: refreshing }}
          className={`min-h-[28px] justify-center px-1 ${refreshing ? 'opacity-50' : ''}`}
        >
          <Mono className="text-caption font-medium text-link">
            {refreshing ? 'Refreshing…' : refreshFailed ? 'Try again' : 'Refresh now'}
          </Mono>
        </TouchableOpacity>
      )}
    </View>
  );
}
