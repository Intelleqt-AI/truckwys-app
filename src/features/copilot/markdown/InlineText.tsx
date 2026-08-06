import { Text, Linking } from 'react-native';
import { MONO_FONT } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { resolveNotificationLink } from '@/lib/notificationLink';
import type { Inline } from './types';

// Inline spans as nested <Text>.
//
// Bare react-native Text, NOT the repo's <Txt>/<Mono>: those hard-code
// `text-body text-fg` and `fontFamily`, so nesting one inside a heading would
// reset the size and colour instead of inheriting them. Each span here carries
// only its own delta.
//
// Two RN limits shape this. Padding, margin, border and borderRadius do NOT
// render on a nested Text on either platform, so inline code gets a background
// and the mono face rather than the rounded pill the web app uses. And a
// Pressable cannot nest inside Text, so links are <Text onPress>.

/** Only these schemes are opened. Anything else renders as inert text. */
const SAFE_SCHEME = /^(https?|mailto|tel):/i;

export function renderInline(
  nodes: Inline[],
  colors: ReturnType<typeof useTheme>['colors'],
  onNavigate?: (route: string) => void,
  keyPrefix = '',
): React.ReactNode[] {
  return nodes.map((n, i) => {
    const key = `${keyPrefix}${i}`;
    switch (n.t) {
      case 'text':
        return <Text key={key}>{n.v}</Text>;
      case 'b':
        return (
          <Text key={key} style={{ fontWeight: '600' }}>
            {renderInline(n.kids, colors, onNavigate, `${key}.`)}
          </Text>
        );
      case 'i':
        return (
          <Text key={key} style={{ fontStyle: 'italic' }}>
            {renderInline(n.kids, colors, onNavigate, `${key}.`)}
          </Text>
        );
      case 'code':
        return (
          <Text
            key={key}
            // Same fontSize as the surrounding body on purpose: a different one
            // on a nested Text gives uneven baselines and clipping on Android.
            // Thin spaces stand in for the padding a nested Text can't have.
            style={{
              fontFamily: MONO_FONT,
              color: colors.accent,
              backgroundColor: colors.surfaceHover,
            }}
          >
            {` ${n.v} `}
          </Text>
        );
      case 'link': {
        const label = renderInline(n.kids, colors, onNavigate, `${key}.`);
        return (
          <Text
            key={key}
            style={{ color: colors.accent, textDecorationLine: 'underline' }}
            suppressHighlighting
            accessibilityRole="link"
            onPress={() => openHref(n.href, onNavigate)}
          >
            {label}
          </Text>
        );
      }
    }
  });
}

function openHref(href: string, onNavigate?: (route: string) => void) {
  // An in-app path ("/finance/invoices/3") should navigate, not open a browser.
  if (href.startsWith('/')) {
    if (resolveNotificationLink(href)) onNavigate?.(href);
    return;
  }
  if (SAFE_SCHEME.test(href)) void Linking.openURL(href);
}
