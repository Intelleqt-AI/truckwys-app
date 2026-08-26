import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { View, Pressable } from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { Icon, Badge, Button, TextField, Txt, Label, INPUT_TEXT } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { asArray, num, str, pick } from '@/lib/api/list';
import { reverseGeocode, parseCoordinates, looksSwapped } from '@/lib/geocode';
import { suggestLocations } from '../api';
import { roundCoord, isForeignCc, type Loc, type LocSuggest } from './types';

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
}: {
  label: string;
  value: Loc | null;
  onChange: (l: Loc) => void;
  placeholder: string;
  /** Hands control to the map's crosshair. Omitted where there is no map. */
  onPickOnMap?: () => void;
  /** Extra controls next to the label — used for a stop row's reorder/remove buttons. */
  headerRight?: ReactNode;
}) {
  const { colors } = useTheme();
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
    if (!focused || text.length < 2 || chosen.current === text) {
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
        const list = asArray(raw)
          .map((r) => {
            const o = r as Record<string, unknown>;
            const cc = str(pick(o, ['country_code', 'country'])) || undefined;
            const foreign = Boolean(pick(o, ['cross_border'])) || isForeignCc(cc);
            return {
              label: str(pick(o, ['label', 'name', 'description', 'address'])),
              lat: num(pick(o, ['lat', 'latitude'])),
              lon: num(pick(o, ['lon', 'lng', 'longitude'])),
              cc,
              foreign,
              country: str(pick(o, ['country', 'country_name'])),
            } as LocSuggest;
          })
          .filter((l) => l.label && l.lat && l.lon)
          .slice(0, 6);
        setResults(list);
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
      <View className="mb-1.5 flex-row items-center justify-between">
        <Label className="text-muted">{label}</Label>
        {headerRight}
      </View>
      {/* Shell matches TextField/SelectField exactly — min height rather than a
          fixed one, padding on the input rather than a stretched height, and a
          17px icon. It used to be h-12 with a 16px pin, which read a notch low
          against the Client and Vehicle-type rows directly above it. */}
      <View
        className={`min-h-[48px] flex-row items-center gap-2 rounded-xs border bg-surface px-3 ${focused ? 'border-accent' : 'border-line'}`}
      >
        <Icon name="pin" size={17} color={value ? colors.accent : colors.faint} />
        <BottomSheetTextInput
          className="flex-1 text-fg"
          placeholder={placeholder}
          placeholderTextColor={colors.faint}
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
          style={[INPUT_TEXT, { paddingVertical: 12 }]}
        />
      </View>
      {/* Two ways in besides typing: the map, and raw coordinates. */}
      <View className="mt-2 flex-row items-center gap-2">
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
        {value?.cc && isForeignCc(value.cc) ? (
          <View className="ml-auto">
            <Badge label="Cross-border" tone="warning" />
          </View>
        ) : null}
      </View>

      {coordMode && (
        <View className="mt-2 gap-2 rounded-xs border border-line bg-surface p-3">
          <TextField
            label="Latitude, longitude"
            placeholder="-33.9249, 18.4241"
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
        </View>
      )}
      {focused && results.length > 0 && (
        <View className="mt-2 overflow-hidden rounded-xs border border-line bg-surface">
          {results.map((r, i) => (
            <Pressable
              key={`${r.label}-${i}`}
              onPress={() => {
                // Settle on this label and discard any reply still in flight,
                // so nothing can refill the list behind the selection.
                chosen.current = r.label;
                reqId.current++;
                onChange(r);
                setText(r.label);
                setResults([]);
              }}
              className="flex-row items-center gap-2.5 border-b border-line-row px-3 py-3 active:bg-surface-hover"
            >
              <Icon name="pin" size={15} color={r.foreign ? '#F59E0B' : colors.faint} />
              <Txt className="flex-1 text-sub text-fg" numberOfLines={1}>
                {r.label}
              </Txt>
              {r.foreign && <Badge label={r.country || 'Cross-border'} tone="warning" />}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

export const LocationField = memo(LocationFieldImpl);
