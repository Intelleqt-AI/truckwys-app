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

/** Municipality names are administrative; a quote wants the town. */
function townFrom(county: string, locality: string, place: string): string {
  const cleaned = (county || '')
    .replace(/^City of\s+/i, '')
    .replace(/\s+(Metropolitan|District|Local)\s+Municipality$/i, '')
    .replace(/\s+Municipality$/i, '')
    .replace(/\s+District$/i, '')
    .trim();
  if (cleaned) return MUNICIPALITY_TO_CITY[cleaned.toLowerCase()] ?? cleaned;
  // Locality often reads "Johannesburg Ward 60" — the ward number is noise.
  const fromLocality = (locality || '').replace(/\s+Ward\s+\d+$/i, '').trim();
  return fromLocality || place || '';
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
export async function reverseGeocode({ lat, lon }: Coordinates): Promise<GeoPlace> {
  if (!MAPTILER_KEY) throw new Error('Map lookup is not configured');

  // Note the order: MapTiler takes lon,lat — the opposite of how it's written.
  const url = `https://api.maptiler.com/geocoding/${lon},${lat}.json?key=${MAPTILER_KEY}&limit=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Couldn't look up that location");

  const body = (await res.json()) as {
    features?: {
      text?: string;
      properties?: { country_code?: string };
      context?: { id?: string; text?: string; country_code?: string }[];
    }[];
  };
  const feature = body.features?.[0];
  if (!feature) throw new Error('No address found at that point');

  const ctx: Record<string, string> = {};
  for (const c of feature.context ?? []) {
    const kind = String(c.id ?? '').split('.')[0];
    if (kind && c.text) ctx[kind] = c.text;
  }

  const town = townFrom(ctx.county ?? '', ctx.locality ?? '', ctx.place ?? '');
  const parts = [feature.text, ctx.place, town, ctx.region]
    .map((p) => (p ?? '').trim())
    .filter(Boolean);

  // Drop repeats and anything already contained in an earlier part, then keep it
  // to three so the label stays readable on a quote.
  const label: string[] = [];
  for (const p of parts) {
    if (label.length >= 3) break;
    if (label.some((existing) => existing.toLowerCase().includes(p.toLowerCase()))) continue;
    label.push(p);
  }
  if (!label.length) throw new Error('No address found at that point');

  const cc = (
    feature.properties?.country_code ??
    (feature.context ?? []).find((c) => String(c.id ?? '').startsWith('country.'))?.country_code ??
    ''
  ).toUpperCase();

  // No country means the point isn't in one — open water returns a perfectly
  // real-looking "South Atlantic Ocean" with no country_code, and that would
  // sail through as a pickup address. A freight collection is on land.
  if (!cc) throw new Error('Drop the pin on a road or place');

  return { label: label.join(', '), cc, city: town };
}
