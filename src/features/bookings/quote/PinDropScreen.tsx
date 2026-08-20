import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, Icon, Label, Mono, Txt } from '@/components/ui';
import { Skeleton } from '@/components/feedback';
import { reverseGeocodeCandidates } from '@/lib/geocode';
import { IS_EXPO_GO, NEEDS_ANDROID_MAPS_KEY } from '@/lib/mapNative';
import type { GeoPoint } from '@/lib/routeGeometry';
import { useTheme } from '@/theme/ThemeProvider';
import { status as statusHues } from '@/theme/tokens';
import type { AppStackParamList } from '@/navigation/types';

import { MapCanvas } from './MapCanvas';
import { CentrePin, PIN_TOP_ABOVE_TIP } from './MapPin';
import { useLocationStore, type QuoteLoc } from './locationStore';
import { loadRecentPlaces, saveRecentPlace } from './recentPlaces';

type Props = NativeStackScreenProps<AppStackParamList, 'PinDrop'>;

/** Below this the pin is aiming at a district, not an address. */
const MAX_PRECISE_DELTA = 0.06;

const PIN_SIZE = 46;
/**
 * The address area's height, fixed across every state it can be in.
 *
 * Not cosmetic — it closes a feedback loop. The panel drives the map's
 * `mapPadding`, so a panel that grew when the addresses arrived shifted the
 * camera, which reported a new centre, which fired another lookup at a point ~45px
 * away from the one the user actually aimed at. With enough variation between
 * states that oscillates instead of settling. A fixed height means the panel is
 * measured once and the camera is only ever moved by the user.
 */
const LIST_H = 156;
/**
 * The callout's centre, above the pin's head. Derived from the pin's own
 * proportions rather than a magic number, so resizing the pin can't slide the
 * bubble down over it: pin top, an 8px gap, then half the bubble.
 */
const CALLOUT_Y = -(PIN_SIZE * PIN_TOP_ABOVE_TIP + 8 + 14);

// Dropping a pin.
//
// The map moves under a pin fixed to the centre — never a draggable marker. Two
// reasons that only show up in the hand: a thumb never covers the target, and the
// pin cannot be lost off-screen. The aim point is always exactly where the user
// is looking.
//
// The order things happen in is what makes this feel finished:
//
//   1. the map starts moving       → the pin lifts, the address goes stale
//   2. the map settles             → a light haptic, the pin drops, the lookup
//                                    starts behind a skeleton
//   3. the addresses come back     → nearest first, the top one pre-selected
//   4. the user taps one, or confirms the top
//
// Step 3 is deliberately a skeleton and not a spinner: the panel keeps its height,
// so the Confirm button never moves under a thumb already travelling towards it.

export function PinDropScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();

  const end = route.params.end;
  const isPickup = end === 'pickup';
  const tint = isPickup ? statusHues.success : statusHues.danger;

  const pickup = useLocationStore((s) => s.pickup);
  const delivery = useLocationStore((s) => s.delivery);
  const setPickup = useLocationStore((s) => s.setPickup);
  const setDelivery = useLocationStore((s) => s.setDelivery);

  const existing = isPickup ? pickup : delivery;
  const other = isPickup ? delivery : pickup;

  /**
   * Where the camera opens.
   *
   * In order: where this end already is, then near the other end (a drop-off is
   * looked for relative to a known collection), then the most recent place this
   * device used. Only if all three are empty does it fall back to the country
   * view — which is honest but useless for aiming, so it's the last resort rather
   * than the default.
   *
   * There is no location permission anywhere in this app (the store listing says
   * so), which is exactly why the recents fallback earns its keep: it is the
   * closest thing to "near me" that doesn't ask for anything.
   *
   * Resolved before the map mounts. `initialRegion` only applies on mount, so a
   * seed arriving later couldn't move the camera anyway — and re-centring after
   * the user has started panning would fight their hand.
   */
  const [seed, setSeed] = useState<GeoPoint | null>(null);
  const [seedReady, setSeedReady] = useState(false);
  useEffect(() => {
    const known = existing ?? other;
    if (known) {
      setSeed({ lat: known.lat, lon: known.lon });
      setSeedReady(true);
      return;
    }
    let live = true;
    void loadRecentPlaces().then((list) => {
      if (!live) return;
      const last = list[0];
      if (last) setSeed({ lat: last.lat, lon: last.lon });
      setSeedReady(true);
    });
    return () => {
      live = false;
    };
    // Once, on mount. Deliberately not reacting to the store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [moving, setMoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tooCoarse, setTooCoarse] = useState(false);
  const [options, setOptions] = useState<QuoteLoc[]>([]);
  const [chosen, setChosen] = useState(0);
  const [panelH, setPanelH] = useState(240);
  // Whether the map can be panned at all. Expo Go has no native map module, and
  // neither does Android without a Maps key — both fall back to the static tile
  // renderer, where a centre pin would be a control that does nothing.
  const canPan = !IS_EXPO_GO && !NEEDS_ANDROID_MAPS_KEY;

  const centre = useRef<GeoPoint | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic, so a slow lookup for a point the user has already dragged away
  // from can never overwrite a newer one.
  const reqId = useRef(0);
  const settled = useRef(false);
  // The map reports a settle as soon as it lays out. That first one is the screen
  // opening, not the user placing anything, so it must not buzz in their hand.
  const userMoved = useRef(false);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onMoving = useCallback(() => {
    // Cheap and called on every frame of a gesture: no work beyond a flag, and
    // only on the first frame of a movement.
    if (!settled.current) return;
    settled.current = false;
    userMoved.current = true;
    setMoving(true);
    setError(null);
  }, []);

  const onSettled = useCallback((point: GeoPoint, span?: { latDelta: number }) => {
    settled.current = true;
    centre.current = point;
    setMoving(false);
    // The pin landing is a physical event, and the cue that the address below is
    // about to change — so it gets a tap, but only when the user caused it.
    if (userMoved.current)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    const coarse = (span?.latDelta ?? 0) > MAX_PRECISE_DELTA;
    setTooCoarse(coarse);
    if (coarse) {
      // Don't burn a lookup on a pin that's aiming at half a province.
      setOptions([]);
      setBusy(false);
      if (timer.current) clearTimeout(timer.current);
      return;
    }

    if (timer.current) clearTimeout(timer.current);
    setBusy(true);
    timer.current = setTimeout(async () => {
      const mine = ++reqId.current;
      try {
        const places = await reverseGeocodeCandidates(point);
        if (mine !== reqId.current) return;
        setOptions(
          places.map((p) => ({
            label: p.label,
            lat: point.lat,
            lon: point.lon,
            cc: p.cc || undefined,
          })),
        );
        setChosen(0);
        setError(null);
      } catch (e) {
        if (mine !== reqId.current) return;
        setOptions([]);
        setError(e instanceof Error ? e.message : "Couldn't find that address");
      } finally {
        if (mine === reqId.current) setBusy(false);
      }
    }, 350);
  }, []);

  const selected = options[chosen];

  const confirm = () => {
    if (!selected) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    (isPickup ? setPickup : setDelivery)(selected);
    void saveRecentPlace(selected);
    navigation.goBack();
  };

  return (
    <View className="flex-1 bg-bg-deep">
      {/* Held back until the opening camera position is known — see `seed`. */}
      {seedReady && (
        <MapCanvas
          pickup={pickup ? { lat: pickup.lat, lon: pickup.lon } : seed && isPickup ? seed : null}
          delivery={
            delivery ? { lat: delivery.lat, lon: delivery.lon } : seed && !isPickup ? seed : null
          }
          // Open on the end being placed, at street scale — not fitted to both ends.
          focusPoint={seed}
          bottomInset={panelH}
          topInset={insets.top}
          onCentreMoving={onMoving}
          onCentreSettled={onSettled}
          // Suppresses the auto re-fit: nothing may move the camera while the user
          // is aiming. Also hides this end's own marker, since the centre pin is
          // standing in for it — the other end stays on screen as a reference.
          picking
          hideMarker={end}
          width={screenW}
          height={screenH}
        />
      )}

      {/* Pin and callout, centred on the visible map — the band above the panel,
          which is also the point the camera reports because mapPadding insets it
          by exactly the same amount. */}
      {canPan && (
        <View
          className="absolute left-0 right-0 items-center justify-center"
          style={{ top: 0, bottom: 0, marginBottom: panelH }}
          pointerEvents="none"
        >
          <CentrePin color={tint} lifted={moving} size={PIN_SIZE} />
          {/* Says what the pin is pointing at, and admits when it doesn't know. */}
          <View className="absolute" style={{ transform: [{ translateY: CALLOUT_Y }] }}>
            <View className="bg-bg-deep/90 max-w-[280px] rounded-pill px-3 py-1.5">
              <Mono className="text-nano text-fg" numberOfLines={1}>
                {moving
                  ? 'Move the map to aim'
                  : tooCoarse
                    ? 'Zoom in to place the pin'
                    : busy
                      ? 'Finding the address…'
                      : (selected?.label ?? error ?? 'Move the map to aim')}
              </Mono>
            </View>
          </View>
        </View>
      )}

      {/* Floating back control, matching the builder's. */}
      <View
        className="absolute left-0 right-0 flex-row items-center px-4"
        style={{ top: insets.top + 6 }}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="h-10 w-10 items-center justify-center rounded-pill bg-black/45 active:opacity-60"
        >
          <Icon name="chevronLeft" size={24} color="#FFFFFF" strokeWidth={2.4} />
        </Pressable>
        <View className="ml-2 rounded-pill bg-black/45 px-3 py-1.5">
          <Mono className="text-micro uppercase tracking-wide" style={{ color: tint }}>
            {isPickup ? 'Set collection' : 'Set drop-off'}
          </Mono>
        </View>
      </View>

      {/* The panel. Fixed, not a draggable sheet: there is one decision here and
          a sheet to wrestle with would only get between the user and it. */}
      <View
        className="bg-bg absolute bottom-0 left-0 right-0 rounded-t-lg border-t border-line"
        onLayout={(e) => setPanelH(Math.round(e.nativeEvent.layout.height))}
      >
        <View className="px-4 pt-4" style={{ paddingBottom: insets.bottom + 12 }}>
          <Txt className="text-h3 text-fg">{isPickup ? 'Collection point' : 'Drop-off point'}</Txt>

          {!canPan ? (
            <View className="mt-3 gap-1 rounded-xs border border-line bg-surface p-3">
              <Txt className="text-sub text-fg">
                {IS_EXPO_GO
                  ? "The map can't be panned in Expo Go"
                  : 'The interactive map is unavailable'}
              </Txt>
              <Txt className="text-nano text-muted">
                Placing a pin needs the native map. Go back and use Coordinates, or search for the
                address instead.
              </Txt>
            </View>
          ) : (
            <>
              <Label className="mb-2 mt-3 text-muted">Suggested addresses</Label>

              {/* Dimmed while the map is in motion: these describe where the pin
                  *was*, and a list that looks current while the pin moves is how
                  a user ends up confirming the wrong address. */}
              <View style={{ height: LIST_H, opacity: moving ? 0.4 : 1 }}>
                {busy && options.length === 0 ? (
                  // Skeletons, not a spinner: the rows keep their shape so Confirm
                  // never jumps out from under a thumb already on its way.
                  <View className="gap-2">
                    <Skeleton height={46} radius={6} />
                    <Skeleton height={46} radius={6} />
                    <Skeleton height={46} radius={6} />
                  </View>
                ) : tooCoarse ? (
                  <View className="flex-row items-center gap-2.5 rounded-xs border border-line bg-surface p-3">
                    <Icon name="alert" size={16} color={colors.faint} />
                    <Txt className="flex-1 text-sub text-muted">
                      Zoom in until you can see the streets — a pin this far out isn&apos;t an
                      address.
                    </Txt>
                  </View>
                ) : error ? (
                  <View className="flex-row items-center gap-2.5 rounded-xs border border-line bg-surface p-3">
                    <Icon name="alert" size={16} color={statusHues.danger} />
                    <Txt className="flex-1 text-sub text-danger">{error}</Txt>
                  </View>
                ) : options.length === 0 ? (
                  <View className="rounded-xs border border-line bg-surface p-3">
                    <Txt className="text-sub text-muted">Move the map to place the pin.</Txt>
                  </View>
                ) : (
                  <ScrollView
                    className="flex-1"
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
                  >
                    {options.map((o, i) => {
                      const on = i === chosen;
                      return (
                        <Pressable
                          key={`${o.label}-${i}`}
                          onPress={() => {
                            setChosen(i);
                            void Haptics.selectionAsync().catch(() => {});
                          }}
                          className={`flex-row items-center gap-2.5 rounded-xs border px-3 py-3 active:opacity-70 ${
                            on ? 'bg-surface' : 'bg-surface/60 border-line'
                          }`}
                          style={on ? { borderColor: tint } : undefined}
                        >
                          <Icon name="pin" size={16} color={on ? tint : colors.faint} />
                          <Txt className="flex-1 text-sub text-fg" numberOfLines={2}>
                            {o.label}
                          </Txt>
                          {on && <Icon name="check" size={15} color={tint} />}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            </>
          )}

          <View className="mt-3 flex-row items-center gap-2.5">
            <View className="flex-1">
              <Button
                label={isPickup ? 'Confirm collection' : 'Confirm drop-off'}
                icon="check"
                onPress={confirm}
                disabled={!selected || busy || moving}
                fullWidth
              />
            </View>
            {busy && <ActivityIndicator size="small" color={colors.faint} />}
          </View>
        </View>
      </View>
    </View>
  );
}
