import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Platform, View } from 'react-native';
import { Mono } from '@/components/ui';
import { RouteMap } from '@/components/RouteMap';
import { getMapLibreLib, getMapsLib, IS_EXPO_GO, MAPTILER_KEY } from '@/lib/mapNative';
import { decimate, regionFor, toLatLng, type GeoPoint } from '@/lib/routeGeometry';
import { status as statusHues } from '@/theme/tokens';
import { MapPin, NumberedMapPin } from './MapPin';
import { useTheme } from '@/theme/ThemeProvider';

export interface MapCanvasProps {
  geometry?: GeoPoint[];
  pickup?: GeoPoint | null;
  delivery?: GeoPoint | null;
  /** Intermediate points, in visit order, between pickup and delivery. */
  stops?: GeoPoint[];
  /** Keeps the route clear of the sheet overlapping the bottom of the map. */
  bottomInset?: number;
  /** While picking, the map reports its centre so the caller can resolve it. */
  onCentreSettled?: (point: GeoPoint) => void;
  picking?: boolean;
  width: number;
  height: number;
  /** Safe-area top, so the route isn't fitted under the floating back button. */
  topInset?: number;
}

/**
 * The map behind the quote builder.
 *
 * Three renderers behind one prop surface: react-native-maps (Apple Maps) on
 * iOS, MapLibre GL Native (MapTiler tiles) on Android, and the original
 * static tile map in Expo Go, where neither native module is compiled in.
 * Callers never branch on which — the only visible difference is that
 * picking is unavailable on the static one, and it says so.
 */
export function MapCanvas({
  geometry,
  pickup,
  delivery,
  stops = [],
  bottomInset = 0,
  onCentreSettled,
  picking = false,
  width,
  height,
  topInset = 0,
}: MapCanvasProps) {
  const maps = getMapsLib();
  const mapLibre = getMapLibreLib();
  const { colors } = useTheme();

  const route = useMemo(
    () => decimate((geometry ?? []).filter((p) => p?.lat && p?.lon)),
    [geometry],
  );
  const focus = useMemo(() => {
    // Stops fold into the fallback bbox too, so the map frames the whole
    // planned route even before /route/calculate/ has returned real geometry.
    const pts =
      route.length > 1 ? route : ([pickup, ...stops, delivery].filter(Boolean) as GeoPoint[]);
    return regionFor(pts);
  }, [route, pickup, delivery, stops]);

  // ── Expo Go, or Android with no MapTiler key: the static map, plus an
  // honest note ──────────────────────────────────────────────────────────
  if (!maps && !mapLibre) {
    return (
      <View style={{ width, height }} className="bg-surface">
        {/* Tiles render even with nothing picked yet — a map-first screen with a
            blank panel on it just looks broken. RouteMap falls back to a South
            Africa view when it has no points. */}
        <RouteMap
          geometry={geometry}
          pickup={pickup}
          delivery={delivery}
          stops={stops}
          width={width}
          height={height}
          bottomInset={bottomInset}
        />
        <View
          className="bg-bg-deep/85 absolute self-center rounded-pill border border-line px-2.5 py-1"
          style={{ bottom: bottomInset + 28 }}
        >
          <Mono className="text-nano text-faint">
            {IS_EXPO_GO
              ? 'STATIC MAP · PIN PICKING NEEDS A DEV BUILD'
              : Platform.OS === 'android' && !MAPTILER_KEY
                ? 'STATIC MAP · ANDROID NEEDS A MAPTILER KEY'
                : 'STATIC MAP'}
          </Mono>
        </View>
      </View>
    );
  }

  if (maps) {
    return (
      <InteractiveMap
        maps={maps}
        route={route}
        focus={focus}
        pickup={pickup}
        delivery={delivery}
        stops={stops}
        bottomInset={bottomInset}
        onCentreSettled={onCentreSettled}
        picking={picking}
        width={width}
        height={height}
        accent={colors.accent}
        topInset={topInset}
      />
    );
  }

  return (
    <InteractiveMapLibre
      maplibre={mapLibre!}
      route={route}
      focus={focus}
      pickup={pickup}
      delivery={delivery}
      stops={stops}
      bottomInset={bottomInset}
      onCentreSettled={onCentreSettled}
      picking={picking}
      width={width}
      height={height}
      accent={colors.accent}
      topInset={topInset}
    />
  );
}

type MapsModule = NonNullable<ReturnType<typeof getMapsLib>>;

/**
 * react-native-maps snapshots a Marker's custom child view into a bitmap and,
 * once tracksViewChanges is false, stops re-snapshotting it. If it goes false
 * before that first snapshot — which happens if a custom view starts out
 * false, as these did — the snapshot can capture the view mid-paint (blank,
 * for SVG content) and the marker never becomes visible. Track briefly after
 * every (re)mount so the first real paint gets captured, then stop.
 */
function useSettledTracking(lat: number, lon: number) {
  const [tracking, setTracking] = useState(true);
  useEffect(() => {
    setTracking(true);
    const t = setTimeout(() => setTracking(false), 300);
    return () => clearTimeout(t);
  }, [lat, lon]);
  return tracking;
}

// MapPin/NumberedMapPin's teardrop tip sits at (12, 29.6) of their 0..34
// viewBox (see the comment on MapPin's Path), not at y=34 — the box's
// bottom, which is padding for the cast shadow.
//
// react-native-maps' fractional `anchor` prop looks like the fix, but on iOS
// (Apple Maps, the only provider this app uses — see mapNative.ts) it is
// silently a no-op: AIRMapMarkerManager.m never registers it as a native
// prop, only `centerOffset` (a raw pixel offset from the view's own centre)
// actually moves anything on that platform. So this app has to compute the
// tip-to-centre offset itself instead of leaning on `anchor`.
const PIN_TIP_Y = 29.6;
const PIN_VIEWBOX_H = 34;
/** Rendered pixel height of a marker of `size` (viewBox is 24 wide, 34 tall). */
const pinHeight = (size: number) => size * (PIN_VIEWBOX_H / 24);
/** iOS: shift the view up so its tip — not its centre — lands on the coordinate. */
const pinCenterOffset = (size: number) => ({ x: 0, y: pinHeight(size) / 2 - (pinHeight(size) * PIN_TIP_Y) / PIN_VIEWBOX_H });
/** Android/MapLibre: bottom-anchor, then nudge down past the shadow padding below the tip. */
const pinBottomGap = (size: number) => pinHeight(size) - (pinHeight(size) * PIN_TIP_Y) / PIN_VIEWBOX_H;

function StopMarker({
  Marker,
  point,
  index,
}: {
  Marker: MapsModule['Marker'];
  point: GeoPoint;
  index: number;
}) {
  const tracking = useSettledTracking(point.lat, point.lon);
  return (
    <Marker
      coordinate={toLatLng(point)}
      title={`Stop ${index + 1}`}
      centerOffset={pinCenterOffset(30)}
      tracksViewChanges={tracking}
    >
      <NumberedMapPin index={index + 1} color={statusHues.info} size={30} />
    </Marker>
  );
}

function InteractiveMap({
  maps,
  route,
  focus,
  pickup,
  delivery,
  stops,
  bottomInset,
  onCentreSettled,
  picking,
  width,
  height,
  accent,
  topInset,
}: {
  maps: MapsModule;
  route: GeoPoint[];
  focus: ReturnType<typeof regionFor>;
  pickup?: GeoPoint | null;
  delivery?: GeoPoint | null;
  stops?: GeoPoint[];
  bottomInset: number;
  onCentreSettled?: (point: GeoPoint) => void;
  picking: boolean;
  width: number;
  height: number;
  accent: string;
  topInset: number;
}) {
  const MapView = maps.default;
  const { Marker, Polyline } = maps;
  const ref = useRef<InstanceType<typeof MapView> | null>(null);
  // Hooks can't be conditional on pickup/delivery being set, so these run
  // every render regardless of whether the marker they gate is drawn.
  const pickupTracking = useSettledTracking(pickup?.lat ?? 0, pickup?.lon ?? 0);
  const deliveryTracking = useSettledTracking(delivery?.lat ?? 0, delivery?.lon ?? 0);

  // The region MapKit reports here is the centre of the area *inside*
  // mapPadding, not necessarily the view's true geometric centre — where the
  // crosshair is actually drawn (CrosshairOverlay is padding-unaware, always
  // dead centre of the view). Rather than lean on that assumption, ask the
  // map directly what coordinate sits under that exact pixel. settleReq
  // guards against a slower lookup from an earlier drag landing after a
  // newer one — same pattern as reqId/pinReq in CreateQuoteScreen.
  const settleReq = useRef(0);
  const handleRegionChangeComplete = useCallback(async () => {
    const mine = ++settleReq.current;
    try {
      const coord = await ref.current?.coordinateForPoint({ x: width / 2, y: height / 2 });
      if (!coord || mine !== settleReq.current) return;
      onCentreSettled?.({ lat: coord.latitude, lon: coord.longitude });
    } catch {
      // Ignored — a missed settle just means the readout waits for the next one.
    }
  }, [width, height, onCentreSettled]);

  // Frame the route inside the part of the map that is actually visible, and
  // re-frame when that area changes — dragging the sheet up shrinks the window,
  // so the route has to be re-fitted smaller to stay wholly on screen. mapPadding
  // alone only shifts the centre; it never changes zoom, which is why the route
  // used to stay the same size as the window closed over it.
  //
  // Never while the user is placing a pin: moving the map under them mid-gesture
  // is the one thing that makes a map feel broken.
  const framed = useRef('');
  useEffect(() => {
    if (!focus || picking) return;
    const key = `${focus.latitude.toFixed(4)},${focus.longitude.toFixed(4)},${focus.latitudeDelta.toFixed(4)}:${Math.round(bottomInset)}`;
    if (framed.current === key) return;
    framed.current = key;

    const edgePadding = { top: topInset + 64, right: 40, bottom: bottomInset + 24, left: 40 };
    if (route.length > 1) {
      // fitToCoordinates honours edgePadding, so it zooms as well as pans.
      ref.current?.fitToCoordinates(route.map(toLatLng), { edgePadding, animated: true });
    } else {
      // One point can't define a span for fitToCoordinates.
      ref.current?.animateToRegion(focus, 450);
    }
  }, [focus, picking, bottomInset, topInset, route]);

  return (
    <View style={{ width, height }}>
      <MapView
        ref={ref}
        style={{ width, height }}
        // South Africa, so the first frame is never a grey world map.
        initialRegion={
          focus ?? { latitude: -28.48, longitude: 24.67, latitudeDelta: 14, longitudeDelta: 14 }
        }
        // Keeps markers and the route out from under the sheet.
        mapPadding={{ top: 0, right: 0, bottom: bottomInset, left: 0 }}
        showsCompass={false}
        showsScale={false}
        toolbarEnabled={false}
        // No location permission is requested anywhere in this app, and the
        // store listing says so — do not turn these on without updating both.
        showsUserLocation={false}
        onRegionChangeComplete={handleRegionChangeComplete}
      >
        {route.length > 1 && (
          <Polyline coordinates={route.map(toLatLng)} strokeWidth={4} strokeColor={accent} />
        )}
        {/* Hidden while picking that end, so the crosshair is the only pin.
            Custom children rather than pinColor: the platform default is a
            balloon that looks nothing like the rest of the app, and anchoring at
            the tip is what makes a marker sit on its point instead of near it. */}
        {pickup && !picking && (
          <Marker
            coordinate={toLatLng(pickup)}
            title="Collection"
            centerOffset={pinCenterOffset(34)}
            tracksViewChanges={pickupTracking}
          >
            <MapPin color={statusHues.success} size={34} />
          </Marker>
        )}
        {delivery && !picking && (
          <Marker
            coordinate={toLatLng(delivery)}
            title="Drop-off"
            centerOffset={pinCenterOffset(34)}
            tracksViewChanges={deliveryTracking}
          >
            <MapPin color={statusHues.danger} size={34} />
          </Marker>
        )}
        {!picking &&
          (stops ?? []).map((s, i) => (
            <StopMarker key={i} Marker={Marker} point={s} index={i} />
          ))}
      </MapView>
    </View>
  );
}

type MapLibreModule = NonNullable<ReturnType<typeof getMapLibreLib>>;
type CameraRef = ComponentRef<MapLibreModule['Camera']>;
type MapLibreViewRef = ComponentRef<MapLibreModule['Map']>;

// MapTiler's hosted vector style — same tile product RouteMap's raster
// fallback uses, but MapLibre renders it as a real vector map (crisp at any
// zoom, native pan/pinch) instead of stitched raster tile images.
const MAPTILER_STYLE_URL = `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`;

function InteractiveMapLibre({
  maplibre,
  route,
  focus,
  pickup,
  delivery,
  stops,
  bottomInset,
  onCentreSettled,
  picking,
  width,
  height,
  accent,
  topInset,
}: {
  maplibre: MapLibreModule;
  route: GeoPoint[];
  focus: ReturnType<typeof regionFor>;
  pickup?: GeoPoint | null;
  delivery?: GeoPoint | null;
  stops?: GeoPoint[];
  bottomInset: number;
  onCentreSettled?: (point: GeoPoint) => void;
  picking: boolean;
  width: number;
  height: number;
  accent: string;
  topInset: number;
}) {
  const { Map: MapLibreView, Camera, ViewAnnotation, GeoJSONSource, Layer } = maplibre;
  const cameraRef = useRef<CameraRef | null>(null);
  const mapViewRef = useRef<MapLibreViewRef | null>(null);

  // Same reasoning as InteractiveMap's handleRegionChangeComplete: ask the
  // map what coordinate sits under the crosshair's exact pixel (dead centre
  // of the view) instead of trusting the reported region centre, which is
  // not guaranteed to line up with where CrosshairOverlay is drawn.
  const settleReq = useRef(0);
  const handleRegionDidChange = useCallback(async () => {
    const mine = ++settleReq.current;
    try {
      const lngLat = await mapViewRef.current?.unproject([width / 2, height / 2]);
      if (!lngLat || mine !== settleReq.current) return;
      onCentreSettled?.({ lat: lngLat[1], lon: lngLat[0] });
    } catch {
      // Ignored — a missed settle just means the readout waits for the next one.
    }
  }, [width, height, onCentreSettled]);

  const routeGeoJSON = useMemo(
    () => ({
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'LineString' as const, coordinates: route.map((p) => [p.lon, p.lat]) },
    }),
    [route],
  );

  // Same bbox-fit-with-padding idea as InteractiveMap's effect above, but
  // driven off `focus` (already the bbox of the route, or of the two
  // endpoints) rather than react-native-maps' own fitToCoordinates — MapLibre
  // has no direct equivalent, and a region already carries the same bbox.
  const framed = useRef('');
  useEffect(() => {
    if (!focus || picking) return;
    const key = `${focus.latitude.toFixed(4)},${focus.longitude.toFixed(4)},${focus.latitudeDelta.toFixed(4)}:${Math.round(bottomInset)}`;
    if (framed.current === key) return;
    framed.current = key;

    const bounds: [number, number, number, number] = [
      focus.longitude - focus.longitudeDelta / 2,
      focus.latitude - focus.latitudeDelta / 2,
      focus.longitude + focus.longitudeDelta / 2,
      focus.latitude + focus.latitudeDelta / 2,
    ];
    const padding = { top: topInset + 64, right: 40, bottom: bottomInset + 24, left: 40 };
    cameraRef.current?.fitBounds(bounds, { padding, duration: 450 });
  }, [focus, picking, bottomInset, topInset]);

  return (
    <View style={{ width, height }}>
      <MapLibreView
        ref={mapViewRef}
        style={{ width, height }}
        mapStyle={MAPTILER_STYLE_URL}
        touchRotate={false}
        touchPitch={false}
        attribution={false}
        logo={false}
        onRegionDidChange={handleRegionDidChange}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{
            // South Africa, so the first frame is never a grey world map.
            center: focus ? [focus.longitude, focus.latitude] : [24.67, -28.48],
            zoom: focus ? 12 : 4,
          }}
        />

        {route.length > 1 && (
          <GeoJSONSource id="route" data={routeGeoJSON}>
            <Layer
              type="line"
              id="route-line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': accent, 'line-width': 4 }}
            />
          </GeoJSONSource>
        )}
        {/* Hidden while picking that end, so the crosshair is the only pin.
            MapLibre's anchor is a named edge (no fractional point like
            react-native-maps), so "bottom" pins the box's bottom edge — which
            is shadow padding below the pin's actual tip (see pinBottomGap
            above) — to the coordinate. offset nudges it down by that gap so
            the visual tip, not the box, lands on the exact point. */}
        {pickup && !picking && (
          <ViewAnnotation
            id="pickup"
            lngLat={[pickup.lon, pickup.lat]}
            anchor="bottom"
            offset={[0, pinBottomGap(34)]}
          >
            <MapPin color={statusHues.success} size={34} />
          </ViewAnnotation>
        )}
        {delivery && !picking && (
          <ViewAnnotation
            id="delivery"
            lngLat={[delivery.lon, delivery.lat]}
            anchor="bottom"
            offset={[0, pinBottomGap(34)]}
          >
            <MapPin color={statusHues.danger} size={34} />
          </ViewAnnotation>
        )}
        {!picking &&
          (stops ?? []).map((s, i) => (
            <ViewAnnotation
              key={i}
              id={`stop-${i}`}
              lngLat={[s.lon, s.lat]}
              anchor="bottom"
              offset={[0, pinBottomGap(30)]}
            >
              <NumberedMapPin index={i + 1} color={statusHues.info} size={30} />
            </ViewAnnotation>
          ))}
      </MapLibreView>

      {/* MapTiler's ToS and OSM's ODbL both require attribution. */}
      <View className="bg-bg-deep/85 absolute self-end" style={{ bottom: bottomInset }}>
        <Mono className="text-[6px] text-faint">© MapTiler © OpenStreetMap</Mono>
      </View>
    </View>
  );
}
