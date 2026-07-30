import { useMemo, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Path, Circle } from 'react-native-svg';
import { Mono } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { status as statusHues } from '@/theme/tokens';

// Static route map: OpenStreetMap raster tiles under an SVG polyline.
//
// Deliberately non-interactive — no pan, no pinch, no tap-to-pick. That keeps it
// from fighting the surrounding ScrollView, and means the whole thing is a pure
// projection of a fixed viewport with no tile-eviction or gesture state. Tiles
// are images (data), so unlike a WebView + CDN Leaflet there is no remote script
// execution involved.
//
// Mirrors the web RouteMapView: same OSM tiles, same marker colours, same
// dashed-line fallback when only the endpoints are known.

const TILE = 256;
const MIN_ZOOM = 3;
// Web's MapLocationPicker caps fitBounds at 12; RouteMapView forgets to and
// over-zooms short lanes. Cap here.
const MAX_ZOOM = 12;
// A long SA lane comes back from TomTom undecimated (2000–6000 points). One SVG
// path that long janks on mid-range Android, and at this scale the extra points
// are sub-pixel anyway. The backend does the same thing (geometry[::10]).
const MAX_POINTS = 300;

// tile.openstreetmap.org blocks direct app traffic under its usage policy
// (no throttling, no descriptive User-Agent from a mobile client) — MapTiler
// is a paid/free-tier host that explicitly allows this traffic pattern.
const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_KEY ?? '';
const OSM_TILE = (z: number, x: number, y: number) =>
  `https://api.maptiler.com/maps/streets-v2/${z}/${x}/${y}.png?key=${MAPTILER_KEY}`;

export interface GeoPoint {
  lat: number;
  lon: number;
}

// ── Web Mercator ───────────────────────────────────────────────────────────
// World pixel coordinates at a given zoom (origin top-left, 256px tiles).
const lonToX = (lon: number, z: number) => ((lon + 180) / 360) * TILE * 2 ** z;

const latToY = (lat: number, z: number) => {
  const phi = (Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * TILE * 2 ** z;
};

/** Largest integer zoom at which the bbox still fits inside w×h pixels. */
function fitZoom(pts: GeoPoint[], w: number, h: number): number {
  const lats = pts.map((p) => p.lat);
  const lons = pts.map((p) => p.lon);
  const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)];
  const [minLon, maxLon] = [Math.min(...lons), Math.max(...lons)];

  for (let z = MAX_ZOOM; z > MIN_ZOOM; z--) {
    const spanX = lonToX(maxLon, z) - lonToX(minLon, z);
    // latToY grows downward, so maxLat gives the smaller y.
    const spanY = latToY(minLat, z) - latToY(maxLat, z);
    if (spanX <= w && spanY <= h) return z;
  }
  return MIN_ZOOM;
}

/** Keep every nth point, always preserving the first and last. */
function decimate(pts: GeoPoint[], max: number): GeoPoint[] {
  if (pts.length <= max) return pts;
  const step = Math.ceil(pts.length / max);
  const out: GeoPoint[] = [];
  for (let i = 0; i < pts.length; i += step) out.push(pts[i]!);
  const last = pts[pts.length - 1]!;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

export function RouteMap({
  geometry,
  pickup,
  delivery,
  height = 190,
}: {
  geometry?: GeoPoint[];
  pickup?: GeoPoint | null;
  delivery?: GeoPoint | null;
  height?: number;
}) {
  const { colors } = useTheme();
  const { width: screenW } = useWindowDimensions();
  // Card sits inside the screen's 16px gutters.
  const width = Math.max(0, screenW - 32);
  const [tilesFailed, setTilesFailed] = useState(false);

  const view = useMemo(() => {
    // Prefer the real route; fall back to just the endpoints (drawn dashed, as
    // web does when it has coords but no geometry yet).
    const hasRoute = !!geometry && geometry.length > 1;
    const endpoints = [pickup, delivery].filter(Boolean) as GeoPoint[];
    const source = hasRoute ? geometry! : endpoints;
    if (source.length === 0 || width <= 0) return null;

    const pts = hasRoute ? decimate(source, MAX_POINTS) : source;
    // A single known point can't define a span — show it at street-ish zoom.
    const zoom = pts.length > 1 ? fitZoom(pts, width, height) : 9;

    // Centre the viewport on the bbox midpoint, in world pixels.
    const xs = pts.map((p) => lonToX(p.lon, zoom));
    const ys = pts.map((p) => latToY(p.lat, zoom));
    const centreX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const centreY = (Math.min(...ys) + Math.max(...ys)) / 2;
    // World-pixel coords of the viewport's top-left corner.
    const originX = centreX - width / 2;
    const originY = centreY - height / 2;

    // Same projection drives the tile grid and the SVG, so they register exactly.
    const toLocal = (p: GeoPoint) => ({
      x: lonToX(p.lon, zoom) - originX,
      y: latToY(p.lat, zoom) - originY,
    });

    const local = pts.map(toLocal);
    const d = local.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

    // Tile grid covering the viewport, clamped to the world's tile range.
    const maxTile = 2 ** zoom - 1;
    const tiles: { key: string; url: string; left: number; top: number }[] = [];
    const firstCol = Math.floor(originX / TILE);
    const lastCol = Math.floor((originX + width) / TILE);
    const firstRow = Math.floor(originY / TILE);
    const lastRow = Math.floor((originY + height) / TILE);
    for (let col = firstCol; col <= lastCol; col++) {
      for (let row = firstRow; row <= lastRow; row++) {
        // Wrap horizontally (dateline), clamp vertically (no tiles past the poles).
        const x = ((col % (maxTile + 1)) + maxTile + 1) % (maxTile + 1);
        if (row < 0 || row > maxTile) continue;
        tiles.push({
          key: `${zoom}/${x}/${row}`,
          url: OSM_TILE(zoom, x, row),
          left: col * TILE - originX,
          top: row * TILE - originY,
        });
      }
    }

    return {
      d,
      tiles,
      dashed: !hasRoute,
      start: local[0],
      end: local.length > 1 ? local[local.length - 1] : undefined,
    };
  }, [geometry, pickup, delivery, width, height]);

  if (!view) return null;

  return (
    <View>
      <View
        className="overflow-hidden rounded-xs border border-line"
        style={{ width, height, backgroundColor: colors.surface }}
      >
        {!tilesFailed &&
          view.tiles.map((t) => (
            <Image
              key={t.key}
              source={{ uri: t.url }}
              // Offline or a blocked tile host: leave the surface colour behind
              // and keep drawing the route rather than showing a broken map.
              onError={() => setTilesFailed(true)}
              style={{ position: 'absolute', left: t.left, top: t.top, width: TILE, height: TILE }}
              contentFit="cover"
              transition={120}
            />
          ))}

        <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }}>
          {/* Casing under the route so it stays legible over dark map features. */}
          <Path d={view.d} stroke="rgba(0,0,0,0.35)" strokeWidth={6} fill="none" strokeLinejoin="round" />
          <Path
            d={view.d}
            stroke={colors.accent}
            strokeWidth={3}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={view.dashed ? '6 6' : undefined}
          />
          {view.start && (
            <Circle cx={view.start.x} cy={view.start.y} r={5} fill={statusHues.success} stroke="#fff" strokeWidth={2} />
          )}
          {view.end && (
            <Circle cx={view.end.x} cy={view.end.y} r={5} fill={statusHues.danger} stroke="#fff" strokeWidth={2} />
          )}
        </Svg>
      </View>

      {/* MapTiler's ToS and OSM's ODbL both require attribution. */}
      <Mono className="mt-1 text-right text-nano text-faint">© MapTiler © OpenStreetMap contributors</Mono>
    </View>
  );
}
