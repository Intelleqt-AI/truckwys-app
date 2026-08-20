export interface GeoPoint {
  lat: number;
  lon: number;
}

/**
 * A long SA lane comes back from TomTom undecimated — 2 000 to 6 000 points, with
 * no server-side simplification available. Drawing that many vertices janks on
 * mid-range Android whether it goes into an SVG path or a native Polyline, and at
 * phone zoom the extra points are sub-pixel anyway.
 *
 * Shared by both map renderers so the static fallback and the interactive map
 * draw the same shape.
 */
export const MAX_ROUTE_POINTS = 300;

/** Keep every nth point, always preserving the first and last. */
export function decimate(pts: GeoPoint[], max: number = MAX_ROUTE_POINTS): GeoPoint[] {
  if (pts.length <= max) return pts;
  const step = Math.ceil(pts.length / max);
  const out: GeoPoint[] = [];
  for (let i = 0; i < pts.length; i += step) out.push(pts[i]!);
  const last = pts[pts.length - 1]!;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/** react-native-maps speaks latitude/longitude; the API speaks lat/lon. */
export const toLatLng = (p: GeoPoint) => ({ latitude: p.lat, longitude: p.lon });

/**
 * A region that frames every supplied point with a little breathing room.
 *
 * `pad` is a multiplier on the span rather than a fixed delta so it behaves the
 * same on a 40km city hop and a 1 400km trunk route. The floor stops a single
 * point resolving to a zero-span region, which renders as a fully zoomed-in map
 * showing one building.
 */
export function regionFor(points: GeoPoint[], pad = 0.35) {
  if (!points.length) return null;
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * (1 + pad), 0.02),
    longitudeDelta: Math.max((maxLon - minLon) * (1 + pad), 0.02),
  };
}
