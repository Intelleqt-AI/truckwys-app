import { View, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Mono } from '@/components/ui';
import { resolveNotificationLink } from '@/lib/notificationLink';
import type { NavAction } from '../types';

// The agent's suggested navigation, as chips under the reply.
//
// `route` is a WEB path from _ACTION_LIBRARY (core/services/agent.py:373), so it
// goes through the same resolver the notification deep links use — one table,
// kept honest by two callers. A route that doesn't resolve is dropped rather
// than rendered as a dead chip.

export function ActionChips({ actions }: { actions: NavAction[] }) {
  const navigation = useNavigation();

  const usable = actions
    .map((a) => ({ ...a, target: resolveNotificationLink(a.route) }))
    .filter((a) => a.target != null);

  if (!usable.length) return null;

  return (
    <View className="mt-2.5 flex-row flex-wrap gap-2">
      {usable.map((a) => (
        <Pressable
          key={`${a.label}:${a.route}`}
          accessibilityRole="button"
          accessibilityLabel={a.label}
          onPress={() =>
            (navigation.navigate as (screen: string, params?: Record<string, unknown>) => void)(
              a.target!.screen,
              a.target!.params,
            )
          }
          className="rounded-xs border border-accent px-2.5 py-1.5 active:opacity-60"
        >
          <Mono className="text-micro tracking-wide uppercase text-accent">{a.label} →</Mono>
        </Pressable>
      ))}
    </View>
  );
}
