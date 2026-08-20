import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Badge, Icon, Txt } from '@/components/ui';
import { num, str, pick, asArray } from '@/lib/api/list';
import { useTheme } from '@/theme/ThemeProvider';

import { suggestLocations } from '../api';
import type { QuoteLoc } from './locationStore';

// The address-search machinery, shared by the quote sheet's inline field and the
// picker screen's two stacked fields.
//
// Extracted rather than copied because it carries three fixes that each took a
// bug report to find, and a second copy would only regrow them:
//
//   • one ref per timer — search, clear and blur used to share a slot and cancel
//     each other at random;
//   • the `chosen` ref — without it, picking "Durban" set the text to "Durban",
//     which re-armed the debounce and reopened the dropdown on top of the
//     completed selection a couple of seconds later;
//   • the `reqId` sequence guard — a reply from the last keystroke landing after
//     the tap would otherwise refill the list behind the selection.
//
// A hook, not a component, because the two shells lay results out very
// differently: an inline dropdown under the field, versus the picker's full-height
// list. Only the behaviour is common.

export type LocSuggest = QuoteLoc & { foreign: boolean; country: string };

export const isForeignCc = (cc?: string) => {
  if (!cc) return false;
  const c = cc.replace(/\s/g, '').toUpperCase();
  return c !== '' && !['ZA', 'ZAF', 'SOUTHAFRICA'].includes(c);
};

/** Map one API row to a suggestion. The field names vary by geocoder backend. */
const toSuggest = (row: unknown): LocSuggest => {
  const o = row as Record<string, unknown>;
  const cc = str(pick(o, ['country_code', 'country'])) || undefined;
  return {
    label: str(pick(o, ['label', 'name', 'description', 'address'])),
    lat: num(pick(o, ['lat', 'latitude'])),
    lon: num(pick(o, ['lon', 'lng', 'longitude'])),
    cc,
    foreign: Boolean(pick(o, ['cross_border'])) || isForeignCc(cc),
    country: str(pick(o, ['country', 'country_name'])),
  };
};

const usable = (l: LocSuggest) => !!l.label && !!l.lat && !!l.lon;

export function useLocationSearch({
  value,
  onChange,
  /**
   * Suppress *typing* lookups — the shell is showing coordinate entry, or this is
   * the picker's unfocused field. Deliberately does not suppress resolveTyped:
   * a field being blurred is paused by the time its blur timer fires, and losing
   * focus is precisely when what was typed has to be committed.
   */
  paused = false,
}: {
  value: QuoteLoc | null;
  onChange: (l: QuoteLoc) => void;
  paused?: boolean;
}) {
  const [text, setText] = useState(value?.label ?? '');
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState<LocSuggest[]>([]);
  const [resolving, setResolving] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chosen = useRef<string | null>(value?.label ?? null);
  const reqId = useRef(0);

  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      if (clearTimer.current) clearTimeout(clearTimer.current);
      if (blurTimer.current) clearTimeout(blurTimer.current);
    },
    [],
  );

  // Reflect an externally-set value — edit-mode hydration, the AI/voice fill path,
  // a recent tapped in the picker, a pin dropped on the map. Marked as chosen so
  // an address we filled in ourselves doesn't trigger a lookup either.
  useEffect(() => {
    if (!value?.label || value.label === text) return;
    chosen.current = value.label;
    const t = setTimeout(() => setText(value.label), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.label]);

  // The other direction: a value cleared out from under the field — the picker's
  // ×, or reset() when a new quote starts — must clear the box too. Without this
  // a picker instance still in the navigation stack shows the previous quote's
  // addresses over an empty store. Skipped while the user is mid-type
  // (chosen.current === null), so this can never eat what they're typing.
  useEffect(() => {
    if (value || chosen.current === null) return;
    chosen.current = null;
    setText('');
  }, [value]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (paused || !focused || text.length < 2 || chosen.current === text) {
      clearTimer.current = setTimeout(() => setResults([]), 0);
      return () => {
        if (clearTimer.current) clearTimeout(clearTimer.current);
      };
    }
    searchTimer.current = setTimeout(async () => {
      const mine = ++reqId.current;
      try {
        const raw = await suggestLocations(text);
        if (mine !== reqId.current) return;
        setResults(asArray(raw).map(toSuggest).filter(usable).slice(0, 6));
      } catch {
        if (mine === reqId.current) setResults([]);
      }
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [text, focused, paused]);

  /** Commit a suggestion the user tapped. */
  const choose = (r: QuoteLoc) => {
    // Settle on this label and discard any reply still in flight, so nothing can
    // refill the list behind the selection.
    chosen.current = r.label;
    reqId.current++;
    setText(r.label);
    setResults([]);
    onChange(r);
  };

  /**
   * Commit what the user typed, without them having to tap a suggestion.
   *
   * Typing an address used to set nothing at all — the parent's onChange fired
   * only from a suggestion tap or a coordinate paste — so typing "Johannesburg"
   * and moving on left the location null: no pin, no route, no explanation.
   *
   * Writes the resolved label back into the field, so a wrong guess on something
   * vague like "Main Road" is visible and correctable rather than silent.
   * Returns the location if one was committed, so a caller can advance the flow.
   */
  const resolveTyped = async (): Promise<QuoteLoc | null> => {
    const q = text.trim();
    if (q.length < 2 || chosen.current === text) return null;
    const top = results.find(usable);
    if (top) {
      choose(top);
      return top;
    }
    setResolving(true);
    try {
      const mine = ++reqId.current;
      const raw = await suggestLocations(q);
      // Not the newest request any more: a later keystroke or tap owns the field.
      if (mine !== reqId.current) return null;
      const first = asArray(raw).map(toSuggest).find(usable);
      if (!first) return null;
      chosen.current = first.label;
      setText(first.label);
      setResults([]);
      onChange(first);
      return first;
    } catch {
      // Leave the text as typed; the caller's own validation will catch it.
      return null;
    } finally {
      setResolving(false);
    }
  };

  return {
    text,
    setText,
    focused,
    setFocused,
    results,
    resolving,
    /** Props for the TextInput itself, wired to all of the above. */
    inputProps: {
      value: text,
      onChangeText: (t: string) => {
        // A real keystroke means the settled value no longer applies, so
        // searching is wanted again.
        chosen.current = null;
        setText(t);
      },
      onFocus: () => setFocused(true),
      onBlur: () => {
        // Delayed so a tap on a suggestion row still registers before the list
        // unmounts — and before the resolve runs, so a tap always wins over the
        // auto-resolve. Tracked so it can't fire into an unmounted field.
        if (blurTimer.current) clearTimeout(blurTimer.current);
        blurTimer.current = setTimeout(() => {
          setFocused(false);
          void resolveTyped();
        }, 180);
      },
      returnKeyType: 'search' as const,
      onSubmitEditing: () => {
        void resolveTyped();
      },
    },
    choose,
    resolveTyped,
    /** Marks the field settled without a lookup — used when a pin sets it. */
    markChosen: (label: string) => {
      chosen.current = label;
      reqId.current++;
      setResults([]);
    },
  };
}

/**
 * Split a composed label into a name and where it is.
 *
 * The geocoder hands back "Darling Street, City Centre, Cape Town". On one line
 * that truncates to "Darling Street, City Cen…", losing the town — which is the
 * part that tells two Darling Streets apart. Every ride-hailing app puts the
 * name on top and the area underneath in grey, for exactly this reason.
 */
export function splitPlaceLabel(label: string): { title: string; subtitle?: string } {
  const i = (label ?? '').indexOf(', ');
  if (i < 1) return { title: label ?? '' };
  return { title: label.slice(0, i), subtitle: label.slice(i + 2) };
}

/** One suggestion row. Same shape in the dropdown and in the picker's list. */
export function SuggestionRow({
  suggestion,
  onPress,
  icon = 'pin',
  subtitle,
  last = false,
}: {
  suggestion: LocSuggest | QuoteLoc;
  onPress: () => void;
  icon?: 'pin' | 'clock';
  subtitle?: string;
  last?: boolean;
}) {
  const { colors } = useTheme();
  const foreign = 'foreign' in suggestion ? suggestion.foreign : isForeignCc(suggestion.cc);
  const country = 'country' in suggestion ? suggestion.country : '';
  const split = splitPlaceLabel(suggestion.label);
  const second = subtitle ?? split.subtitle;
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-2.5 px-3 py-3 active:bg-surface-hover ${last ? '' : 'border-b border-line-row'}`}
    >
      <Icon name={icon} size={15} color={foreign ? '#F59E0B' : colors.faint} />
      <View className="flex-1">
        <Txt className="text-sub text-fg" numberOfLines={1}>
          {split.title}
        </Txt>
        {!!second && (
          <Txt className="mt-0.5 text-nano text-faint" numberOfLines={1}>
            {second}
          </Txt>
        )}
      </View>
      {foreign && <Badge label={country || 'Cross-border'} tone="warning" />}
    </Pressable>
  );
}
