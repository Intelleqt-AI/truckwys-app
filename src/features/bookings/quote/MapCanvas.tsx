import { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
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
  /** While picking, the map reports its centre so the caller can resolve it. */
  onCentreSettled?: (point: GeoPoint) => void;
  picking?: boolean;
  width: number;
  height: number;
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
  picking = false,
  width,
  height,
}: MapCanvasProps) {
  const maps = getMapsLib();
  const { colors } = useTheme();

  const route = useMemo(() => decimate((geometry ?? []).filter((p) => p?.lat && p?.lon)), [geometry]);
  const focus = useMemo(() => {
    const pts = route.length > 1 ? route : ([pickup, delivery].filter(Boolean) as GeoPoint[]);
    return regionFor(pts);
  }, [route, pickup, delivery]);

  // ── Expo Go: the static map, plus an honest note ──────────────────────────
  if (!maps) {
    return (
      <View style={{ width, height }} className="bg-surface">
        {/* Tiles render even with nothing picked yet — a map-first screen with a
            blank panel on it just looks broken. RouteMap falls back to a South
            Africa view when it has no points. */}
        <RouteMap geometry={geometry} pickup={pickup} delivery={delivery} width={width} height={height} />
        <View className="absolute bottom-3 self-center rounded-pill border border-line bg-bg-deep/85 px-2.5 py-1">
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
      picking={picking}
      width={width}
      height={height}
      accent={colors.accent}
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
  picking,
  width,
  height,
  accent,
}: {
  maps: MapsModule;
  route: GeoPoint[];
  focus: ReturnType<typeof regionFor>;
  pickup?: GeoPoint | null;
  delivery?: GeoPoint | null;
  bottomInset: number;
  onCentreSettled?: (point: GeoPoint) => void;
  picking: boolean;
  width: number;
  height: number;
  accent: string;
}) {
  const MapView = maps.default;
  const { Marker, Polyline } = maps;
  const ref = useRef<InstanceType<typeof MapView> | null>(null);

  // Frame the route when it changes, but never while the user is dragging to
  // place a pin — moving the map under them mid-gesture is the one thing that
  // makes a map feel broken.
  const framed = useRef('');
  useEffect(() => {
    if (!focus || picking) return;
    const key = `${focus.latitude.toFixed(4)},${focus.longitude.toFixed(4)},${focus.latitudeDelta.toFixed(4)}`;
    if (framed.current === key) return;
    framed.current = key;
    ref.current?.animateToRegion(focus, 450);
  }, [focus, picking]);

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
        onRegionChangeComplete={(r: { latitude: number; longitude: number }) =>
          onCentreSettled?.({ lat: r.latitude, lon: r.longitude })
        }
      >
        {route.length > 1 && (
          <Polyline coordinates={route.map(toLatLng)} strokeWidth={4} strokeColor={accent} />
        )}
        {/* Hidden while picking that end, so the crosshair is the only pin.
            Custom children rather than pinColor: the platform default is a
            balloon that looks nothing like the rest of the app, and anchoring at
            the tip is what makes a marker sit on its point instead of near it. */}
        {pickup && !picking && (
          <Marker coordinate={toLatLng(pickup)} title="Collection" anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false}>
            <MapPin color={statusHues.success} size={34} />
          </Marker>
        )}
        {delivery && !picking && (
          <Marker coordinate={toLatLng(delivery)} title="Drop-off" anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false}>
            <MapPin color={statusHues.danger} size={34} />
          </Marker>
        )}
      </MapView>
    </View>
  );
}
