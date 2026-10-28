import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import Animated from 'react-native-reanimated';
import { Icon, Badge, Button, Card, TextField, Txt, Label, Mono, INPUT_TEXT } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { asArray, num, str, pick } from '@/lib/api/list';
import { reverseGeocode, parseCoordinates, looksSwapped } from '@/lib/geocode';
import { countryNear } from '@/lib/locationCountry';
import { suggestLocations, fetchRecentLocations, recordLocationPick } from '../api';
import { roundCoord, isForeignCc, type Loc, type LocSuggest } from './types';
import { useQuoteMotion } from './motion';

function toLocSuggest(raw: unknown, forceRecent?: boolean): LocSuggest {
  const o = raw as Record<string, unknown>;
  const cc = str(pick(o, ['country_code', 'country'])) || undefined;
  const foreign = Boolean(pick(o, ['cross_border'])) || isForeignCc(cc);
  return {
    label: str(pick(o, ['label', 'name', 'description', 'address'])),
    lat: num(pick(o, ['lat', 'latitude'])),
    lon: num(pick(o, ['lon', 'lng', 'longitude'])),
    cc,
    foreign,
    country: str(pick(o, ['country', 'country_name'])),
    isRecent: forceRecent ?? Boolean(pick(o, ['is_recent'])),
  };
}

// Recent-first, deduped by label (mirrors web's mergeSuggestions).
function mergeSuggestions(recent: LocSuggest[], live: LocSuggest[]): LocSuggest[] {
  const seen = new Set(recent.map((s) => s.label.toLowerCase()));
  return [...recent, ...live.filter((s) => !seen.has(s.label.toLowerCase()))];
}

// ── Location autocomplete with coordinates ──────────────────────────────────
// Moved out of CreateQuoteScreen.tsx verbatim (Phase 0 extraction), now
// memoized — every comment below documents a real past bug; keep them.
function LocationFieldImpl({
  label,
  value,
  onChange,
  placeholder,
  onPickOnMap,
  headerRight,
  error,
}: {
  label: string;
  value: Loc | null;
  onChange: (l: Loc) => void;
  placeholder: string;
  /** Hands control to the map's crosshair. Omitted where there is no map. */
  onPickOnMap?: () => void;
  /** Extra controls next to the label — used for a stop row's reorder/remove buttons. */
  headerRight?: ReactNode;
  error?: string;
}) {
  const { colors } = useTheme();
  const motion = useQuoteMotion();
  const [text, setText] = useState(value?.label ?? '');
  // Coordinate entry, matching what the web builder offers — but as one
  // paste-friendly field rather than two number boxes, because the useful case
  // is a pin someone shared over WhatsApp, and because a browser number input
  // silently rejects the comma in "-33.9249, 18.4241".
  const [coordMode, setCoordMode] = useState(false);
  const [coordText, setCoordText] = useState('');
  const [coordBusy, setCoordBusy] = useState(false);
  const [coordError, setCoordError] = useState<string | null>(null);

  const applyCoords = async (swap = false) => {
    setCoordError(null);
    const parsed = parseCoordinates(coordText);
    if (!parsed) {
      setCoordError('Enter coordinates as "-33.9249, 18.4241", or paste a map link');
      return;
    }
    const point = swap ? { lat: parsed.lon, lon: parsed.lat } : parsed;
    if (!swap && looksSwapped(point)) {
      setCoordError('That looks like longitude first. Tap Swap if you meant the other way round.');
      return;
    }
    setCoordBusy(true);
    try {
      const place = await reverseGeocode(point);
      onChange({
        label: place.label,
        lat: roundCoord(point.lat),
        lon: roundCoord(point.lon),
        cc: place.cc || undefined,
      });
      setText(place.label);
      setCoordMode(false);
      setCoordText('');
    } catch (e) {
      setCoordError(e instanceof Error ? e.message : "Couldn't find that point");
    } finally {
      setCoordBusy(false);
    }
  };
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState<LocSuggest[]>([]);
  // One ref per timer. These used to share a slot, so the clear-results timeout
  // and the search timeout cancelled each other at random.
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The label the field is already settled on — either tapped from the list or
  // filled in from outside. While text still equals it, the user isn't
  // searching, so we must not look it up. Without this, picking "Durban" set
  // the text to "Durban…", which re-armed the debounce below and reopened the
  // dropdown a couple of seconds later on top of the completed selection.
  const chosen = useRef<string | null>(value?.label ?? null);
  // Monotonic request id, same pattern as routeReq/aiReq above: a reply that is
  // no longer the newest must not write results. Covers the other half of the
  // reopen — the in-flight lookup from the last keystroke landing after the tap.
  const reqId = useRef(0);

  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      if (clearTimer.current) clearTimeout(clearTimer.current);
      if (blurTimer.current) clearTimeout(blurTimer.current);
    },
    [],
  );

  // Reflect an externally-set value (edit-mode hydration, or the AI/voice fill
  // path via geocode → setPickup) into the input. Marked as chosen so an
  // address we filled in ourselves doesn't trigger a lookup either.
  useEffect(() => {
    if (!value?.label || value.label === text) return;
    chosen.current = value.label;
    const t = setTimeout(() => setText(value.label), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.label]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);

    if (!focused) {
      clearTimer.current = setTimeout(() => setResults([]), 0);
      return () => {
        if (clearTimer.current) clearTimeout(clearTimer.current);
      };
    }

    // Empty, focused field: show frequent/recent picks immediately, no
    // debounce (there's nothing to type-ahead against yet).
    if (text.length === 0) {
      const mine = ++reqId.current;
      (async () => {
        try {
          const raw = await fetchRecentLocations();
          if (mine !== reqId.current) return;
          const list = asArray(raw)
            .map((r) => toLocSuggest(r, true))
            .filter((l) => l.label && l.lat && l.lon)
            .slice(0, 6);
          setResults(list);
        } catch {
          if (mine === reqId.current) setResults([]);
        }
      })();
      return;
    }

    if (text.length < 2 || chosen.current === text) {
      clearTimer.current = setTimeout(() => setResults([]), 0);
      return () => {
        if (clearTimer.current) clearTimeout(clearTimer.current);
      };
    }

    searchTimer.current = setTimeout(async () => {
      const mine = ++reqId.current;
      try {
        const [recentRaw, liveRaw] = await Promise.all([
          fetchRecentLocations(text).catch(() => []),
          suggestLocations(text).catch(() => []),
        ]);
        if (mine !== reqId.current) return;
        const recentList = asArray(recentRaw)
          .map((r) => toLocSuggest(r))
          .filter((l) => l.label && l.lat && l.lon);
        const liveList = asArray(liveRaw)
          .map((r) => toLocSuggest(r))
          .filter((l) => l.label && l.lat && l.lon);
        setResults(mergeSuggestions(recentList, liveList).slice(0, 6));
      } catch {
        if (mine === reqId.current) setResults([]);
      }
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [text, focused]);

  return (
    <View>
      {/* A row on the route rail (RouteTimeline), so it carries no box of its
          own: the caption, an underlined input, and the two ways in besides
          typing. The underline (accent while focused, danger on an error) is
          what marks the input as an input without a full border; the pin icon
          the old box carried is now the rail's marker. */}
      <View className="min-h-[20px] flex-row items-center gap-2">
        <Label className={error ? 'text-danger' : focused ? 'text-fg' : 'text-muted'}>
          {label}
        </Label>
        {value?.cc && isForeignCc(value.cc) ? <Badge label="Cross-border" tone="warning" /> : null}
        {headerRight ? <View className="-my-0.5 ml-auto">{headerRight}</View> : null}
      </View>
      <View
        className={`border-b ${error ? 'border-danger' : focused ? 'border-accent' : 'border-line-active'}`}
      >
        <BottomSheetTextInput
          className="text-fg"
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          accessibilityLabel={label}
          value={text}
          onChangeText={(t) => {
            // A real keystroke means the settled value no longer applies, so
            // searching is wanted again.
            chosen.current = null;
            setText(t);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            // Delayed so a tap on a suggestion row still registers before the
            // list unmounts. Tracked so it can't fire into an unmounted field.
            if (blurTimer.current) clearTimeout(blurTimer.current);
            blurTimer.current = setTimeout(() => setFocused(false), 150);
          }}
          style={[INPUT_TEXT, { paddingVertical: 10 }]}
        />
      </View>
      {error && <Mono className="mt-1 text-caption text-danger">{error}</Mono>}
      {/* Two ways in besides typing: the map, and raw coordinates. Real
          buttons (a border and a fill), not bare labels — see Button's `sm`. */}
      <View className="mt-2.5 flex-row items-center gap-2">
        {onPickOnMap && (
          <Button
            label="Set on map"
            icon="pin"
            variant="secondary"
            size="sm"
            onPress={onPickOnMap}
          />
        )}
        <Button
          label={coordMode ? 'Search instead' : 'Coordinates'}
          icon={coordMode ? 'search' : 'gauge'}
          variant="secondary"
          size="sm"
          onPress={() => {
            setCoordError(null);
            setCoordMode((m) => !m);
          }}
        />
      </View>

      {coordMode && (
        <Animated.View
          entering={motion.enterDown}
          exiting={motion.exit}
          className="mt-2 gap-2 overflow-hidden rounded-card border border-line bg-surface-hover p-3"
        >
          <TextField
            label="Latitude, longitude"
            placeholder="e.g. -33.9249, 18.4241"
            value={coordText}
            onChangeText={(t) => {
              setCoordText(t);
              setCoordError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            error={coordError ?? undefined}
            bottomSheet
          />
          <View className="flex-row gap-2.5">
            {coordError?.startsWith('That looks like longitude') && (
              <View className="flex-1">
                <Button
                  label="Swap"
                  variant="secondary"
                  onPress={() => applyCoords(true)}
                  fullWidth
                />
              </View>
            )}
            <View className="flex-[1.4]">
              <Button
                label="Use these"
                icon="check"
                loading={coordBusy}
                onPress={() => applyCoords()}
                fullWidth
              />
            </View>
          </View>
        </Animated.View>
      )}
      {focused && results.length > 0 && (
        <Card className="mt-2">
          {results.map((r, i) => (
            <TouchableOpacity
              key={`${r.label}-${i}`}
              activeOpacity={0.7}
              onPress={() => {
                // Settle on this label and discard any reply still in flight,
                // so nothing can refill the list behind the selection.
                chosen.current = r.label;
                reqId.current++;
                onChange(r);
                setText(r.label);
                setResults([]);
                if (r.cc) {
                  recordLocationPick(r.label, r.lat, r.lon, r.cc);
                  return;
                }
                // A "used before" pick is stored without its country, which drives
                // cross-border detection before the route is in. Look it up from
                // the geocoder (the result nearest the saved point), apply it if
                // this is still the pick, and record it for next time (web e4389e3).
                const picked = r;
                suggestLocations(picked.label)
                  .then((raw) => {
                    const cc = countryNear(
                      asArray(raw).map((x) => {
                        const s = toLocSuggest(x);
                        return { lat: s.lat, lon: s.lon, country_code: s.cc };
                      }),
                      picked.lat,
                      picked.lon,
                    );
                    if (cc && chosen.current === picked.label) {
                      onChange({ ...picked, cc });
                    }
                    recordLocationPick(picked.label, picked.lat, picked.lon, cc);
                  })
                  .catch(() => recordLocationPick(picked.label, picked.lat, picked.lon));
              }}
              className="flex-row items-center gap-2.5 border-b border-line-row px-3 py-3"
            >
              {r.isRecent && <Icon name="clock" size={13} color={colors.faint} />}
              <Icon name="pin" size={15} color={r.foreign ? colors.warningDot : colors.faint} />
              <Txt className="flex-1 text-sub text-fg" numberOfLines={1}>
                {r.label}
              </Txt>
              {r.foreign && <Badge label={r.country || 'Cross-border'} tone="warning" />}
            </TouchableOpacity>
          ))}
        </Card>
      )}
    </View>
  );
}

export const LocationField = memo(LocationFieldImpl);
