import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  Badge,
  Button,
  EmptyState,
  Group,
  Icon,
  INPUT_TEXT,
  Label,
  ListRow,
  Mono,
  TextField,
  Txt,
} from '@/components/ui';
import { parseCoordinates, looksSwapped, reverseGeocode } from '@/lib/geocode';
import { useTheme } from '@/theme/ThemeProvider';
import { status as statusHues } from '@/theme/tokens';
import type { AppStackParamList } from '@/navigation/types';

import { VoiceQuoteSheet } from '../VoiceQuoteSheet';
import { useLocationSearch, SuggestionRow, isForeignCc, splitPlaceLabel } from './LocationSearch';
import { useLocationStore, type QuoteLoc } from './locationStore';
import { loadRecentPlaces, saveRecentPlace } from './recentPlaces';

type Props = NativeStackScreenProps<AppStackParamList, 'PickLocations'>;

type End = 'pickup' | 'delivery';

// Where a quote starts.
//
// The quote builder is map-first and dense — client, vehicle type, weight, dates,
// pricing. Opening there meant the two things every quote actually needs were two
// rows down a form. So this screen asks for them and nothing else, the way a
// ride-hailing app does: two fields, your recent places, one way through.
//
// The locations go into the shared store rather than route params, because the
// map's pin mode lives on the builder — "Set on map" has to hand off to it and
// get an answer back, and nothing in this app returns a value from a pushed
// screen. See `locationStore.ts`.
//
// The AI/voice bar deliberately stays on the builder. It looked self-contained,
// but submitNL there carries a whole conversation — history, a pending-entity
// question ("that client doesn't exist, create it?"), declined entities, and
// geocoding of whatever addresses come back. A second copy would be a second
// thing to keep correct, so this screen links to it instead.

export function LocationPickerScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const pickup = useLocationStore((s) => s.pickup);
  const delivery = useLocationStore((s) => s.delivery);
  const setPickup = useLocationStore((s) => s.setPickup);
  const setDelivery = useLocationStore((s) => s.setDelivery);
  const swapEnds = useLocationStore((s) => s.swap);
  const reset = useLocationStore((s) => s.reset);

  // A new quote must not inherit the last one's route — the failure mode of
  // holding this outside the screen. Skipped when we're being returned to while
  // holding a location (coming back from "Set on map").
  const cleared = useRef(false);
  useEffect(() => {
    if (cleared.current || route.params?.keep) return;
    cleared.current = true;
    reset();
  }, [reset, route.params?.keep]);

  const [active, setActive] = useState<End>(route.params?.focus ?? 'pickup');
  // Setting one end and being left with the caret on it is a dead end, so the
  // keyboard follows the flow rather than just the highlight moving.
  const pickupInput = useRef<TextInput | null>(null);
  const deliveryInput = useRef<TextInput | null>(null);
  const goTo = useCallback((end: End) => {
    setActive(end);
    // Deferred so the field is unpaused by the time it takes focus.
    setTimeout(() => (end === 'pickup' ? pickupInput : deliveryInput).current?.focus(), 60);
  }, []);
  const [recents, setRecents] = useState<QuoteLoc[]>([]);
  const [coordMode, setCoordMode] = useState(false);
  const [coordText, setCoordText] = useState('');
  const [coordBusy, setCoordBusy] = useState(false);
  const [coordError, setCoordError] = useState<string | null>(null);

  useEffect(() => {
    void loadRecentPlaces().then(setRecents);
  }, []);

  // Every confirmed location is remembered, wherever it came from.
  const commit = useCallback(
    (end: End, loc: QuoteLoc) => {
      (end === 'pickup' ? setPickup : setDelivery)(loc);
      void saveRecentPlace(loc).then(setRecents);
    },
    [setPickup, setDelivery],
  );

  // One search per field. Only the focused one runs lookups — two debounces
  // firing at once would race for the same list.
  const pickupSearch = useLocationSearch({
    value: pickup,
    onChange: (l) => {
      commit('pickup', l);
      if (!delivery) goTo('delivery');
    },
    paused: coordMode || active !== 'pickup',
  });
  const deliverySearch = useLocationSearch({
    value: delivery,
    onChange: (l) => {
      commit('delivery', l);
      if (!pickup) goTo('pickup');
    },
    paused: coordMode || active !== 'delivery',
  });

  const search = active === 'pickup' ? pickupSearch : deliverySearch;
  const showingResults = search.results.length > 0;

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
      const loc: QuoteLoc = { label: place.label, lat: point.lat, lon: point.lon, cc: place.cc || undefined };
      // Settle the field on the resolved label so leaving coordinate mode doesn't
      // send that address straight back through the geocoder.
      search.markChosen(loc.label);
      search.setText(loc.label);
      commit(active, loc);
      setCoordMode(false);
      setCoordText('');
    } catch (e) {
      setCoordError(e instanceof Error ? e.message : "Couldn't find that point");
    } finally {
      setCoordBusy(false);
    }
  };

  // Its own screen, not the builder's crosshair. Sending the user into the quote
  // form to place a pin means landing on a page full of pricing fields when all
  // they asked to do was point at a spot on a map.
  const setOnMap = () => navigation.navigate('PinDrop', { end: active });

  // Typed-but-not-tapped counts as filled, because pressing Continue resolves it.
  // Requiring a committed location here disabled the button in exactly the case
  // the resolve exists for: type both, press Continue, nothing happens — and then
  // it silently enabled itself 180 ms later when the blur landed.
  const filled = (end: End) =>
    end === 'pickup'
      ? !!pickup?.lat || pickupSearch.text.trim().length >= 2
      : !!delivery?.lat || deliverySearch.text.trim().length >= 2;
  const canContinue = filled('pickup') && filled('delivery');
  const [going, setGoing] = useState(false);
  const [goError, setGoError] = useState<string | null>(null);

  const continueOn = async () => {
    if (going) return;
    setGoError(null);
    setGoing(true);
    try {
      const p = pickup ?? (await pickupSearch.resolveTyped());
      const d = delivery ?? (await deliverySearch.resolveTyped());
      if (!p || !d) {
        // Say which end failed rather than navigating on with a null one and
        // leaving the builder showing an empty map.
        const missing = !p && !d ? 'either address' : !p ? 'that collection address' : 'that drop-off address';
        setGoError(`Couldn't find ${missing}. Pick one of the suggestions, or set it on the map.`);
        return;
      }
      navigation.navigate('CreateQuote', { fromPicker: true });
    } finally {
      setGoing(false);
    }
  };

  const takeRecent = (r: QuoteLoc) => {
    // Already geocoded, so this drops straight in — no lookup.
    search.markChosen(r.label);
    search.setText(r.label);
    commit(active, r);
    if (active === 'pickup' && !delivery) goTo('delivery');
    else if (active === 'delivery' && !pickup) goTo('pickup');
  };

  // The recorder. Only the capture happens here — transcription and the
  // entity conversation ("that client doesn't exist, create it?") stay on the
  // builder, which is the one place that knows how to hold that thread.
  const [voiceOpen, setVoiceOpen] = useState(false);
  const onVoiceCaptured = (uri: string) => {
    setVoiceOpen(false);
    navigation.navigate('CreateQuote', { voiceUri: uri, fromPicker: true });
  };

  const clearEnd = (end: End) => {
    setGoError(null);
    const s = end === 'pickup' ? pickupSearch : deliverySearch;
    s.setText('');
    s.markChosen('');
    (end === 'pickup' ? setPickup : setDelivery)(null);
    setActive(end);
  };

  const doSwap = () => {
    swapEnds();
    // The inputs hold their own text, so reversing the store alone would leave
    // the boxes reading the old way round.
    const a = pickupSearch.text;
    const b = deliverySearch.text;
    pickupSearch.setText(b);
    deliverySearch.setText(a);
    pickupSearch.markChosen(b);
    deliverySearch.markChosen(a);
  };

  // A function, not a component: `<Field/>` declared in here would be a new
  // component type every render, so React would unmount the TextInput on each
  // keystroke and the keyboard would close.
  const renderField = (end: End, label: string, placeholder: string) => {
    const s = end === 'pickup' ? pickupSearch : deliverySearch;
    const value = end === 'pickup' ? pickup : delivery;
    const on = active === end;
    return (
      <View>
        <Label className="mb-1 text-nano text-faint">{label}</Label>
        {/* No coloured focus ring. The active field is shown by its fill and its
            own label instead — a blue outline round a field that already has a
            green or red leader dot beside it is a third colour saying nothing. */}
        <View
          className={`min-h-[44px] flex-row items-center gap-2 rounded-xs border border-line px-3 ${on ? 'bg-surface' : 'bg-bg-deep'}`}
        >
          <TextInput
            ref={end === 'pickup' ? pickupInput : deliveryInput}
            className="flex-1 text-fg"
            placeholder={placeholder}
            placeholderTextColor={colors.faint}
            style={[INPUT_TEXT, { paddingVertical: 10 }]}
            {...s.inputProps}
            onFocus={() => {
              setActive(end);
              s.inputProps.onFocus();
            }}
          />
          {s.resolving && <ActivityIndicator size="small" color={colors.faint} />}
          {!s.resolving && !!s.text && (
            <Pressable hitSlop={10} accessibilityLabel={`Clear ${label}`} onPress={() => clearEnd(end)}>
              <Icon name="x" size={15} color={colors.faint} />
            </Pressable>
          )}
        </View>
        {value?.cc && isForeignCc(value.cc) ? (
          <View className="mt-1 flex-row">
            <Badge label="Cross-border" tone="warning" />
          </View>
        ) : null}
      </View>
    );
  };

  return (
    // The action bar is pinned to the bottom, so without this the keyboard covers
    // Continue and Set on map — the two controls a user is reaching for while
    // they type. `padding` on iOS shrinks the list rather than pushing the fields
    // off the top.
    <KeyboardAvoidingView
      className="flex-1 bg-bg"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Own chrome — the native header is off here, matching the builder this
          pushes to, so the two screens don't jump between headers. */}
      <View className="flex-row items-center gap-1 px-4 pb-2" style={{ paddingTop: insets.top + 6 }}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="h-10 w-10 items-center justify-center rounded-pill active:opacity-60"
        >
          <Icon name="chevronLeft" size={24} color="#FFFFFF" strokeWidth={2.4} />
        </Pressable>
        <Txt className="text-h3 text-fg">Where to?</Txt>
      </View>

      {/* The two ends with the leg drawn between them — a circle for collection,
          a square for drop-off, so which is which reads without the labels. */}
      <View className="mx-4 flex-row items-start gap-3 rounded-sm border border-line bg-surface p-3">
        <View className="items-center pt-7">
          <View className="h-2.5 w-2.5 rounded-pill" style={{ backgroundColor: statusHues.success }} />
          <View className="my-1 h-9 w-px" style={{ backgroundColor: colors.line }} />
          <View className="h-2.5 w-2.5" style={{ backgroundColor: statusHues.danger }} />
        </View>
        <View className="flex-1 gap-2.5">
          {renderField('pickup', 'COLLECTION', 'Search origin')}
          {renderField('delivery', 'DROP-OFF', 'Search destination')}
        </View>
        <Pressable
          onPress={doSwap}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Swap collection and drop-off"
          disabled={!pickup && !delivery}
          className={`mt-7 h-9 w-9 items-center justify-center rounded-pill border border-line bg-bg-deep active:opacity-60 ${
            !pickup && !delivery ? 'opacity-40' : ''
          }`}
        >
          <Icon name="swap" size={16} color={colors.muted} />
        </Pressable>
      </View>

      <ScrollView
        className="mt-3 flex-1"
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        // Dragging the list puts the keyboard away, so the recents underneath are
        // reachable without a separate tap to dismiss it.
        keyboardDismissMode="on-drag"
      >
        {coordMode && (
          <View className="mx-4 mb-3 gap-2 rounded-xs border border-line bg-surface p-3">
            <TextField
              label={`Latitude, longitude — ${active === 'pickup' ? 'collection' : 'drop-off'}`}
              placeholder="-33.9249, 18.4241"
              value={coordText}
              onChangeText={(t) => {
                setCoordText(t);
                setCoordError(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              error={coordError ?? undefined}
            />
            <View className="flex-row gap-2.5">
              {coordError?.startsWith('That looks like longitude') && (
                <View className="flex-1">
                  <Button label="Swap" variant="secondary" onPress={() => applyCoords(true)} fullWidth />
                </View>
              )}
              <View className="flex-[1.4]">
                <Button label="Use these" icon="check" loading={coordBusy} onPress={() => applyCoords()} fullWidth />
              </View>
            </View>
          </View>
        )}

        {showingResults ? (
          <View className="mx-4 overflow-hidden rounded-xs border border-line bg-surface">
            {search.results.map((r, i) => (
              <SuggestionRow
                key={`${r.label}-${i}`}
                suggestion={r}
                last={i === search.results.length - 1}
                onPress={() => search.choose(r)}
              />
            ))}
          </View>
        ) : (
          <View className="mx-4 gap-3">
            <Group label="Recent">
              {recents.length === 0 ? (
                <EmptyState icon="clock" title="No recent places" body="Places you use will show up here." />
              ) : (
                recents.map((r, i) => (
                  <ListRow
                    key={`${r.label}-${i}`}
                    title={splitPlaceLabel(r.label).title}
                    subtitle={splitPlaceLabel(r.label).subtitle}
                    leading={<Icon name="clock" size={16} color={colors.faint} />}
                    last={i === recents.length - 1}
                    onPress={() => takeRecent(r)}
                  />
                ))
              )}
            </Group>

            {/* Opens the recorder here, not the quote form: "describe the job"
                should start listening, not show a page of pricing fields. The
                recording is handed to the builder, which owns the conversation
                that turns it into a quote. */}
            <Group>
              <ListRow
                title="Describe the job instead"
                subtitle="Tap to speak — the quote fills itself in"
                leading={<Icon name="mic" size={16} color={colors.accent} />}
                last
                onPress={() => setVoiceOpen(true)}
              />
            </Group>
          </View>
        )}
      </ScrollView>

      {/* Sticky actions, same as the builder's. */}
      <View className="border-t border-line bg-bg-deep px-4 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
        <View className="flex-row gap-2.5">
          <View className="flex-1">
            <Button
              label={coordMode ? 'Search instead' : 'Coordinates'}
              icon={coordMode ? 'search' : 'gauge'}
              variant="secondary"
              onPress={() => {
                setCoordError(null);
                setCoordMode((m) => !m);
              }}
              fullWidth
            />
          </View>
          <View className="flex-1">
            <Button label="Set on map" icon="pin" variant="secondary" onPress={setOnMap} fullWidth />
          </View>
        </View>
        <View className="mt-2.5">
          <Button
            label="Continue"
            icon="arrowRight"
            loading={going}
            onPress={() => void continueOn()}
            disabled={!canContinue}
            fullWidth
          />
        </View>
        {goError ? (
          <Txt className="mt-2 text-center text-nano text-danger">{goError}</Txt>
        ) : !canContinue ? (
          <Mono className="mt-2 text-center text-nano text-faint">
            {!filled('pickup') && !filled('delivery')
              ? 'Set both ends to continue'
              : `Still need a ${filled('pickup') ? 'drop-off' : 'collection'}`}
          </Mono>
        ) : null}
      </View>

      {voiceOpen && (
        <VoiceQuoteSheet onCaptured={onVoiceCaptured} onClose={() => setVoiceOpen(false)} />
      )}
    </KeyboardAvoidingView>
  );
}
