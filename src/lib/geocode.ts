import { parseNum } from '@/lib/formatters';

// Turning a dropped pin into something a quote can actually carry.
//
// This matters more than it looks: Quote.pickup_location is a required non-blank
// CharField, that string is copied onto the Load at conversion and printed on the
// customer's quote PDF, and extractCode() derives the 3-letter lane codes from it
// — which are what the AI pricing and lane benchmark key off. A pin that resolves
// to "-26.204, 28.047" would leak coordinates into customer documents AND quietly
// downgrade pricing to a cost anchor. So a real address is load-bearing.
//
// MapTiler rather than the backend: the key is already in the app for map tiles,
// so there is nothing to deploy and no second provider to hold keys for.

const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_KEY ?? '';

export interface GeoPlace {
  label: string;
  /** Upper-case ISO2, matching what location/suggest/ returns. Empty if unknown. */
  cc: string;
  /** Town or city on its own, for lane-code derivation and display. */
  city: string;
}

/**
 * Plausible bounds for the region this product serves — South Africa plus the
 * seven cross-border neighbours location/suggest/ allows. Used only to catch a
 * lat/lon pair entered the wrong way round, which is the single most common
 * coordinate mistake and puts the pin in the Atlantic.
 */
const REGION = { minLat: -35, maxLat: -8, minLon: 11, maxLon: 41 };

export interface Coordinates {
  lat: number;
  lon: number;
}

/**
 * Read a coordinate pair a human pasted or typed.
 *
 * Accepts `-33.9249, 18.4241`, whitespace separation, and a shared map link —
 * Google's `@lat,lon` and `?q=lat,lon`, and Apple's `?ll=lat,lon`. That last
 * case earns its keep: freight pickups get shared as map pins over WhatsApp.
 *
 * Returns null rather than a partial result, so a half-typed value can't be
 * mistaken for a location.
 */
export function parseCoordinates(input: string): Coordinates | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;

  // A pasted map URL: pull the pair out of @lat,lon / q= / ll= / center=.
  const fromUrl = raw.match(/(?:@|[?&](?:q|ll|center|daddr|sll)=)(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  const pair = fromUrl
    ? [fromUrl[1], fromUrl[2]]
    : // Otherwise a bare pair, comma- or whitespace-separated. parseNum handles a
      // comma decimal, so split on comma only when it isn't acting as one.
      raw.split(/\s*[,;]\s*|\s+/).filter(Boolean);

  if (pair.length !== 2) return null;
  const lat = parseNum(pair[0]);
  const lon = parseNum(pair[1]);
  if (lat == null || lon == null) return null;
  if (lat < -90 || lat > 90) return null;
  if (lon < -180 || lon > 180) return null;
  return { lat, lon };
}

/** True when the pair is almost certainly lat and lon the wrong way round. */
export function looksSwapped({ lat, lon }: Coordinates): boolean {
  const inRegion = (c: Coordinates) =>
    c.lat >= REGION.minLat && c.lat <= REGION.maxLat && c.lon >= REGION.minLon && c.lon <= REGION.maxLon;
  return !inRegion({ lat, lon }) && inRegion({ lat: lon, lon: lat });
}

/**
 * South African metros are named after their municipality, not their city, and
 * the geocoder returns the municipality. Left alone, a pin on Church Square
 * comes back as "Tshwane" — which reads oddly on a quote and, worse, misses
 * extractCode's `/pretoria|pta/` match, so the lane code falls through to the
 * first three letters of the street ("ARC") and the quote drops out of the lane
 * benchmark entirely. Verified against the live geocoder, not assumed.
 */
const MUNICIPALITY_TO_CITY: Record<string, string> = {
  tshwane: 'Pretoria',
  ethekwini: 'Durban',
  'nelson mandela bay': 'Gqeberha',
  mangaung: 'Bloemfontein',
  'buffalo city': 'East London',
};

/**
 * Municipality names are administrative; a quote wants the town.
 *
 * The two kinds of municipality have to be treated as opposites. A *metropolitan*
 * municipality is named after its city, so its name is the answer once aliased —
 * "City of Tshwane Metropolitan Municipality" is Pretoria. A *district*
 * municipality is named after a region and says nothing about the town: a pin in
 * Heidelberg sits in "Sedibeng District Municipality", and calling that the city
 * is simply wrong. There the settlement name is in the place/locality context.
 */
function townFrom(county: string, locality: string, place: string): string {
  const raw = (county || '').trim();
  // Locality often reads "Johannesburg Ward 60" — the ward number is noise.
  const fromLocality = (locality || '').replace(/\s+Ward\s+\d+$/i, '').trim();
  const settlement = place || fromLocality || '';

  if (/\s+District(\s+Municipality)?$/i.test(raw) && settlement) return settlement;

  const cleaned = raw
    .replace(/^City of\s+/i, '')
    .replace(/\s+(Metropolitan|District|Local)\s+Municipality$/i, '')
    .replace(/\s+Municipality$/i, '')
    .replace(/\s+District$/i, '')
    .trim();
  if (cleaned) return MUNICIPALITY_TO_CITY[cleaned.toLowerCase()] ?? cleaned;
  return settlement;
}

/**
 * Coordinates to a human address.
 *
 * MapTiler's own `place_name` is too thin to use directly — a pin on a
 * Johannesburg road comes back as literally "M11, South Africa", which would
 * both read badly on a quote and defeat extractCode's city matching. So the
 * label is composed from the context chain instead, deliberately including the
 * town so the lane code still resolves.
 *
 * Throws on a failed lookup rather than returning coordinates as a label —
 * callers must decide what to do, because silently saving numbers is the
 * failure this whole module exists to prevent.
 */
interface MapTilerFeature {
  text?: string;
  place_type?: string[];
  properties?: { country_code?: string };
  context?: { id?: string; text?: string; country_code?: string }[];
}

/** One MapTiler feature to a place. Null when it has no usable label. */
function placeFrom(feature: MapTilerFeature): GeoPlace | null {
  const ctx: Record<string, string> = {};
  for (const c of feature.context ?? []) {
    const kind = String(c.id ?? '').split('.')[0];
    if (kind && c.text) ctx[kind] = c.text;
  }

  const town = townFrom(ctx.county ?? '', ctx.locality ?? '', ctx.place ?? '');
  // A ward number is administrative noise on a customer's quote, and it turns up
  // in the feature's own name out in open country ("Beaufort West Ward 7"), not
  // just in the locality context.
  const name = (feature.text ?? '').replace(/\s+Ward\s+\d+$/i, '').trim();
  const parts = [name, ctx.place, town, ctx.region]
    .map((p) => (p ?? '').trim())
    // MapTiler returns unnamed POIs with the text "-". Dropped here rather than
    // by checking the finished label, which reads as fine because the *context*
    // supplied the letters: "-, Church Square, Pretoria".
    .filter((p) => p && /[a-z0-9]/i.test(p));

  // Drop repeats and anything already contained in an earlier part, then keep it
  // to three so the label stays readable on a quote.
  const label: string[] = [];
  for (const p of parts) {
    if (label.length >= 3) break;
    if (label.some((existing) => existing.toLowerCase().includes(p.toLowerCase()))) continue;
    label.push(p);
  }
  if (!label.length) return null;

  const cc = (
    feature.properties?.country_code ??
    (feature.context ?? []).find((c) => String(c.id ?? '').startsWith('country.'))?.country_code ??
    ''
  ).toUpperCase();

  return { label: label.join(', '), cc, city: town };
}

/** A label MapTiler returned but no human would accept. POIs yield "-". */
const junkLabel = (label: string) => !/[a-z0-9]/i.test(label);

async function lookup(lon: number, lat: number, query: string): Promise<MapTilerFeature[]> {
  const res = await fetch(
    // Note the order: MapTiler takes lon,lat — the opposite of how it's written.
    `https://api.maptiler.com/geocoding/${lon},${lat}.json?key=${MAPTILER_KEY}&${query}`,
  );
  if (!res.ok) throw new Error("Couldn't look up that location");
  const body = (await res.json()) as { features?: MapTilerFeature[] };
  return body.features ?? [];
}

/**
 * Everything the geocoder knows about a point, nearest first.
 *
 * The pin-drop screen offers these as "suggested addresses" — a pin near a
 * junction is genuinely ambiguous (the road, the bus stop, the depot on the
 * corner), and picking from a short list beats nudging the map until one label
 * happens to appear.
 *
 * Two requests, not one. MapTiler refuses `limit` above 1 on a reverse geocode
 * unless exactly one `types` is given ("Parameter limit must be combined with a
 * single type parameter when reverse geocoding", HTTP 400 — verified against the
 * live API), so the addresses and the named places have to be asked for
 * separately. They come back genuinely different: `address` gives the street
 * ("Church Square", "Paul Kruger Street 255"), `poi` gives what's actually there
 * ("Paul Kruger Statue", "Standard Bank Chambers").
 */
export async function reverseGeocodeCandidates({ lat, lon }: Coordinates, limit = 3): Promise<GeoPlace[]> {
  if (!MAPTILER_KEY) throw new Error('Map lookup is not configured');

  const [addresses, pois] = await Promise.all([
    lookup(lon, lat, `limit=${limit}&types=address`),
    // A failed POI lookup must not lose the addresses — it's the nice-to-have half.
    lookup(lon, lat, `limit=${limit}&types=poi`).catch(() => [] as MapTilerFeature[]),
  ]);
  // Open country has neither: a farm road in the Karoo returns nothing for
  // `types=address`, and SA freight genuinely collects from farms. The untyped
  // lookup still resolves those, so fall back to it rather than refusing.
  const seeds = addresses.length || pois.length ? addresses : await lookup(lon, lat, 'limit=1');

  const out: GeoPlace[] = [];
  let sawLabel = false;
  const add = (place: GeoPlace | null) => {
    if (!place || junkLabel(place.label)) return;
    sawLabel = true;
    // No country means the point isn't in one — open water returns a perfectly
    // real-looking "South Atlantic Ocean" with no country_code, and that would
    // sail through as a pickup address. A freight collection is on land.
    if (!place.cc) return;
    if (out.some((e) => e.label.toLowerCase() === place.label.toLowerCase())) return;
    out.push(place);
  };

  for (const f of seeds) add(placeFrom(f));

  // A POI's context chain is thin — "Paul Kruger Statue, South Africa" — so on
  // its own it would lose the town, which is both worse to read on a quote and
  // enough to break extractCode's lane matching. Borrow the town the address
  // lookup already resolved.
  const town = out.find((p) => p.city)?.city ?? '';
  for (const f of pois) {
    const place = placeFrom(f);
    if (!place) continue;
    const needsTown = town && !place.label.toLowerCase().includes(town.toLowerCase());
    add(needsTown ? { ...place, label: `${place.label}, ${town}`, city: town } : place);
  }

  if (!out.length) throw new Error(sawLabel ? 'Drop the pin on a road or place' : 'No address found at that point');
  return out;
}

export async function reverseGeocode(coords: Coordinates): Promise<GeoPlace> {
  if (!MAPTILER_KEY) throw new Error('Map lookup is not configured');
  // Deliberately the plain single-result lookup, not the first candidate: this is
  // the path every *saved* location goes through, and it must not depend on the
  // two-request merge above or on `types=address` being the right filter for a
  // pasted coordinate that might be a farm gate.
  const features = await lookup(coords.lon, coords.lat, 'limit=1');
  if (!features.length) throw new Error('No address found at that point');
  const place = placeFrom(features[0]!);
  if (!place || junkLabel(place.label)) throw new Error('No address found at that point');
  if (!place.cc) throw new Error('Drop the pin on a road or place');
  return place;
}
