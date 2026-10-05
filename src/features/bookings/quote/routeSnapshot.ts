// A quote's route_snapshot keeps the raw route request and response for later
// price modelling. The API caps the field at 200 KB and rejects the save above
// it. The app never adds map paths itself, but a quote made on the web can carry
// the route response with every alternative's full point list, and editing it
// here sends the stored snapshot back. Port of the web's compactRouteResponse
// (QuoteBuilder.tsx).
//
// The priced route's path is saved on its own as `route_geometry`, so dropping
// the paths here loses nothing the app uses. Distances, times, tolls, traffic
// and terrain all stay. Traffic `sections` go only if the snapshot would still
// be near the cap.

const SNAPSHOT_SOFT_MAX = 180_000;
// Hard stop under the 200 KB cap, for a snapshot that is still too big once the
// route response has been slimmed: better to lose the training copy than the save.
const SNAPSHOT_HARD_MAX = 195_000;

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

const strip = (route: unknown, dropSections: boolean): unknown => {
  if (!isObject(route)) return route;
  const { geometry, sections, ...rest } = route;
  return {
    ...rest,
    ...(Array.isArray(geometry) ? { geometry_points: geometry.length } : {}),
    ...(dropSections
      ? Array.isArray(sections)
        ? { sections_count: sections.length }
        : {}
      : { sections }),
  };
};

/** The route-calculate response without its map paths (and, if needed, sections). */
export function compactRouteResponse(data: unknown): unknown {
  if (!isObject(data)) return data;
  const build = (dropSections: boolean) => {
    const out = strip(data, dropSections) as Json;
    if (Array.isArray(data.routes)) out.routes = data.routes.map((r) => strip(r, dropSections));
    return out;
  };
  const full = build(false);
  return JSON.stringify(full).length > SNAPSHOT_SOFT_MAX ? build(true) : full;
}

/**
 * A stored snapshot made safe to send back: the route response is slimmed, and
 * if the whole thing is still over the cap the response is dropped.
 */
export function compactStoredSnapshot(snapshot: Json): Json {
  const out: Json = { ...snapshot };
  if ('response' in out) out.response = compactRouteResponse(out.response);
  if (JSON.stringify(out).length > SNAPSHOT_HARD_MAX) delete out.response;
  return out;
}
