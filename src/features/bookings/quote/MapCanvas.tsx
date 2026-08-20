import { useCallback, useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { runOnJS, useAnimatedReaction, type SharedValue } from 'react-native-reanimated';
import { Mono } from '@/components/ui';
import { RouteMap } from '@/components/RouteMap';
import { getMapsLib, IS_EXPO_GO, NEEDS_ANDROID_MAPS_KEY } from '@/lib/mapNative';
import { decimate, regionFor, toLatLng, type GeoPoint } from '@/lib/routeGeometry';
import { status as statusHues } from '@/theme/tokens';
import { MapPin } from './MapPin';
import { useTheme } from '@/theme/ThemeProvider';

export interface MapCanvasProps {
  geometry?: GeoPoint[];
  pickup?: GeoPoint | null;
  delivery?: GeoPoint | null;
  /** Keeps the route clear of the sheet overlapping the bottom of the map. */
  bottomInset?: number;
  /**
   * While picking, the map reports its centre so the caller can resolve it. The
   * span comes with it, because a pin dropped at city zoom is not a street
   * address and the caller has to be able to say so.
   */
  onCentreSettled?: (point: GeoPoint, span?: { latDelta: number }) => void;
  /** Fires as soon as the map starts moving, for the pin's lift animation. */
  onCentreMoving?: () => void;
  picking?: boolean;
  /**
   * Hide one end's marker — the one currently being placed, since the centre pin
   * is standing in for it. The other end stays visible, which is what makes
   * placing a drop-off relative to a known collection possible.
   */
  hideMarker?: 'pickup' | 'delivery';
  width: number;
  height: number;
  /** Safe-area top, so the route isn't fitted under the floating back button. */
  topInset?: number;
  /**
   * Frame this single point instead of fitting everything given.
   *
   * The pin-drop screen needs it: it shows both ends as markers, but opening
   * framed to *both* means a country-wide first frame when a route is already
   * set — a pin aimed at half a province, which is not an address.
   */
  focusPoint?: GeoPoint | null;
  /**
   * The live bottom inset, as a Reanimated shared value — the sheet's height
   * while the finger is still on it.
   *
   * `bottomInset` above is React state and only lands when the sheet settles, so
   * re-fitting from it alone meant the map sat still through the whole drag and
   * then cut to a new zoom. Sampling this on the UI thread lets the camera follow
   * the drawer frame by frame, which is what makes the two read as one gesture.
   */
  liveBottomInset?: SharedValue<number>;
}

/**
 * The map behind the quote builder.
 *
 * Two renderers behind one prop surface: react-native-maps where it exists, and
 * the original static tile map in Expo Go, where the native module isn't
 * compiled in. Callers never branch on which — the only visible difference is
 * that picking is unavailable on the static one, and it says so.
 */
export function MapCanvas({
  geometry,
  pickup,
  delivery,
  bottomInset = 0,
  onCentreSettled,
  onCentreMoving,
  picking = false,
  hideMarker,
  width,
  height,
  topInset = 0,
  focusPoint,
  liveBottomInset,
}: MapCanvasProps) {
  const maps = getMapsLib();
  const { colors } = useTheme();

  const route = useMemo(() => decimate((geometry ?? []).filter((p) => p?.lat && p?.lon)), [geometry]);
  const focus = useMemo(() => {
    if (focusPoint) return regionFor([focusPoint]);
    const pts = route.length > 1 ? route : ([pickup, delivery].filter(Boolean) as GeoPoint[]);
    return regionFor(pts);
  }, [route, pickup, delivery, focusPoint]);

  // ── Expo Go: the static map, plus an honest note ──────────────────────────
  if (!maps) {
    return (
      <View style={{ width, height }} className="bg-surface">
        {/* Tiles render even with nothing picked yet — a map-first screen with a
            blank panel on it just looks broken. RouteMap falls back to a South
            Africa view when it has no points. */}
        <RouteMap
          geometry={geometry}
          pickup={pickup}
          delivery={delivery}
          width={width}
          height={height}
          bottomInset={bottomInset}
          topInset={topInset}
        />
        <View
          className="absolute self-center rounded-pill border border-line bg-bg-deep/85 px-2.5 py-1"
          style={{ bottom: bottomInset + 28 }}
        >
          <Mono className="text-nano text-faint">
            {IS_EXPO_GO
              ? 'STATIC MAP · PIN PICKING NEEDS A DEV BUILD'
              : NEEDS_ANDROID_MAPS_KEY
                ? 'STATIC MAP · ANDROID NEEDS A GOOGLE MAPS KEY'
                : 'STATIC MAP'}
          </Mono>
        </View>
      </View>
    );
  }

  return (
    <InteractiveMap
      maps={maps}
      route={route}
      focus={focus}
      pickup={pickup}
      delivery={delivery}
      bottomInset={bottomInset}
      onCentreSettled={onCentreSettled}
      onCentreMoving={onCentreMoving}
      picking={picking}
      hideMarker={hideMarker}
      liveBottomInset={liveBottomInset}
      width={width}
      height={height}
      accent={colors.accent}
      topInset={topInset}
    />
  );
}

type MapsModule = NonNullable<ReturnType<typeof getMapsLib>>;

function InteractiveMap({
  maps,
  route,
  focus,
  pickup,
  delivery,
  bottomInset,
  onCentreSettled,
  onCentreMoving,
  picking,
  hideMarker,
  width,
  height,
  accent,
  topInset,
  liveBottomInset,
}: {
  maps: MapsModule;
  route: GeoPoint[];
  focus: ReturnType<typeof regionFor>;
  pickup?: GeoPoint | null;
  delivery?: GeoPoint | null;
  bottomInset: number;
  onCentreSettled?: (point: GeoPoint, span?: { latDelta: number }) => void;
  onCentreMoving?: () => void;
  picking: boolean;
  hideMarker?: 'pickup' | 'delivery';
  liveBottomInset?: SharedValue<number>;
  width: number;
  height: number;
  accent: string;
  topInset: number;
}) {
  const MapView = maps.default;
  const { Marker, Polyline } = maps;
  const ref = useRef<InstanceType<typeof MapView> | null>(null);

  // Frame the route inside the part of the map that is actually visible, and
  // re-frame when that area changes — dragging the sheet up shrinks the window,
  // so the route has to be re-fitted smaller to stay wholly on screen. mapPadding
  // alone only shifts the centre; it never changes zoom, which is why the route
  // used to stay the same size as the window closed over it.
  //
  // Never while the user is placing a pin: moving the map under them mid-gesture
  // is the one thing that makes a map feel broken.
  /** The points the camera should frame: the route, or failing that both ends. */
  const span = useMemo<GeoPoint[]>(() => {
    if (route.length > 1) return route;
    return [pickup, delivery].filter((p) => p?.lat != null && p?.lon != null) as GeoPoint[];
  }, [route, pickup, delivery]);

  /**
   * Re-frame for a bottom inset, without animating.
   *
   * Called repeatedly while the sheet is being dragged, so it must not start an
   * animation: each call would interrupt the last one and the result reads as
   * stutter rather than motion. Instant re-frames at drag rate *are* the motion.
   */
  const frameFor = useCallback(
    (inset: number) => {
      if (picking || span.length < 2) return;
      ref.current?.fitToCoordinates(span.map(toLatLng), {
        edgePadding: { top: topInset + 64, right: 40, bottom: Math.max(0, inset) + 24, left: 40 },
        animated: false,
      });
    },
    [picking, span, topInset],
  );

  // Sampled on the UI thread and only forwarded when the sheet has actually moved
  // a few pixels — a frame-perfect stream of identical values would just be bridge
  // traffic. 6px is under a frame of travel at drag speed, so nothing visible is
  // skipped.
  useAnimatedReaction(
    () => liveBottomInset?.value ?? -1,
    (current, previous) => {
      if (current < 0) return;
      if (previous != null && Math.abs(current - previous) < 6) return;
      runOnJS(frameFor)(current);
    },
    // liveBottomInset is in here too: it switches to undefined in pick mode, and a
    // reaction still holding the old shared value would keep re-framing the map
    // under a user who is aiming a pin.
    [frameFor, liveBottomInset],
  );

  const framed = useRef('');
  useEffect(() => {
    if (!focus || picking) return;
    const key = `${focus.latitude.toFixed(4)},${focus.longitude.toFixed(4)},${focus.latitudeDelta.toFixed(4)}:${Math.round(bottomInset)}`;
    if (framed.current === key) return;
    framed.current = key;

    const edgePadding = { top: topInset + 64, right: 40, bottom: bottomInset + 24, left: 40 };
    // Two distinct points are all fitToCoordinates needs, so prefer the endpoints
    // over animateToRegion whenever there's no geometry yet. That case used to
    // fall through to animateToRegion, which ignores edgePadding entirely — so
    // with both ends set but the route still loading (or failed), dragging the
    // sheet moved nothing.
    const span: GeoPoint[] =
      route.length > 1
        ? route
        : ([pickup, delivery].filter((p) => p?.lat != null && p?.lon != null) as GeoPoint[]);
    if (span.length > 1) {
      // fitToCoordinates honours edgePadding, so it zooms as well as pans.
      ref.current?.fitToCoordinates(span.map(toLatLng), { edgePadding, animated: true });
    } else {
      // One point can't define a span for fitToCoordinates.
      ref.current?.animateToRegion(focus, 450);
    }
  }, [focus, picking, bottomInset, topInset, route, pickup, delivery]);

  return (
    <View style={{ width, height }}>
      <MapView
        ref={ref}
        style={{ width, height }}
        // South Africa, so the first frame is never a grey world map.
        initialRegion={focus ?? { latitude: -28.48, longitude: 24.67, latitudeDelta: 14, longitudeDelta: 14 }}
        // Keeps markers and the route out from under the sheet.
        mapPadding={{ top: 0, right: 0, bottom: bottomInset, left: 0 }}
        showsCompass={false}
        showsScale={false}
        toolbarEnabled={false}
        // No location permission is requested anywhere in this app, and the
        // store listing says so — do not turn these on without updating both.
        showsUserLocation={false}
        // Fires continuously during a gesture — used only as "the map is moving",
        // never to do work, so the JS thread stays free while the pin animates.
        onRegionChange={onCentreMoving}
        onRegionChangeComplete={(r: { latitude: number; longitude: number; latitudeDelta?: number }) =>
          onCentreSettled?.({ lat: r.latitude, lon: r.longitude }, { latDelta: r.latitudeDelta ?? 0 })
        }
      >
        {route.length > 1 && (
          <Polyline coordinates={route.map(toLatLng)} strokeWidth={4} strokeColor={accent} />
        )}
        {/* Hidden while picking that end, so the crosshair is the only pin.
            Custom children rather than pinColor: the platform default is a
            balloon that looks nothing like the rest of the app, and anchoring at
            the tip is what makes a marker sit on its point instead of near it. */}
        {pickup && (picking ? hideMarker !== 'pickup' : true) && (
          <Marker coordinate={toLatLng(pickup)} title="Collection" anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false}>
            <MapPin color={statusHues.success} size={34} />
          </Marker>
        )}
        {delivery && (picking ? hideMarker !== 'delivery' : true) && (
          <Marker coordinate={toLatLng(delivery)} title="Drop-off" anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false}>
            <MapPin color={statusHues.danger} size={34} />
          </Marker>
        )}
      </MapView>
    </View>
  );
}
