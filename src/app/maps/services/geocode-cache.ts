import { importLibrary } from '@googlemaps/js-api-loader';

/** What callers need from a geocoding result (plain data, so it can be stored). */
export interface GeocodeHit {
  lat: number;
  lng: number;
  /** ROOFTOP, RANGE_INTERPOLATED, GEOMETRIC_CENTER or APPROXIMATE. */
  locationType?: string;
  viewport?: { south: number; west: number; north: number; east: number } | null;
}

type StoredEntry = { hit: GeocodeHit | null; expires: number };

const STORAGE_KEY = 'velven-geocode-cache-v1';
/** Google allows caching geocoded coordinates for up to 30 days. */
const HIT_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
/** "Not found" answers are kept for a day, so a bad address is not retried on every visit. */
const MISS_LIFETIME_MS = 24 * 60 * 60 * 1000;
const MAX_STORED = 400;

const inFlight = new Map<string, Promise<GeocodeHit | null>>();
let stored: Record<string, StoredEntry> | null = null;
let geocoder: google.maps.Geocoder | null = null;

/** Tests only: use a fake geocoder and start from an empty cache. */
export function resetGeocodeCacheForTests(fake: Pick<google.maps.Geocoder, 'geocode'> | null): void {
  geocoder = fake as google.maps.Geocoder | null;
  inFlight.clear();
  stored = {};
}

function readStore(): Record<string, StoredEntry> {
  if (stored) return stored;
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    stored = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    stored = {};
  }
  const now = Date.now();
  for (const [key, entry] of Object.entries(stored!)) {
    if (!entry || entry.expires <= now) delete stored![key];
  }
  return stored!;
}

function writeStore(key: string, hit: GeocodeHit | null, lifetime: number): void {
  const store = readStore();
  store[key] = { hit, expires: Date.now() + lifetime };
  const keys = Object.keys(store);
  if (keys.length > MAX_STORED) {
    keys
      .sort((a, b) => store[a].expires - store[b].expires)
      .slice(0, keys.length - MAX_STORED)
      .forEach((old) => delete store[old]);
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage full or blocked (private mode): the in-memory cache still works.
  }
}

function cacheKey(request: google.maps.GeocoderRequest): string {
  const bounds = request.bounds as google.maps.LatLngBoundsLiteral | undefined;
  return JSON.stringify([
    (request.address || '').trim().toLocaleLowerCase(),
    request.region || '',
    request.componentRestrictions?.country || '',
    bounds ? [bounds.south, bounds.west, bounds.north, bounds.east] : '',
  ]);
}

/**
 * Geocodes an address at most once per browser per 30 days. Identical requests made at
 * the same time share one call, and results survive page reloads. Every map component
 * used to geocode on its own and forget the answer, which made one Explore visit send
 * ~50 Geocoding requests for the same few addresses.
 */
export function geocodeCached(request: google.maps.GeocoderRequest): Promise<GeocodeHit | null> {
  const key = cacheKey(request);
  const saved = readStore()[key];
  if (saved && saved.expires > Date.now()) return Promise.resolve(saved.hit);
  const running = inFlight.get(key);
  if (running) return running;

  const call = (async () => {
    try {
      geocoder ??= new (((await importLibrary('geocoding')) as google.maps.GeocodingLibrary).Geocoder)();
      const response = await geocoder.geocode(request);
      const match = response.results[0];
      if (!match) {
        writeStore(key, null, MISS_LIFETIME_MS);
        return null;
      }
      const viewport = match.geometry.viewport;
      const hit: GeocodeHit = {
        lat: match.geometry.location.lat(),
        lng: match.geometry.location.lng(),
        locationType: match.geometry.location_type,
        viewport: viewport
          ? {
              south: viewport.getSouthWest().lat(),
              west: viewport.getSouthWest().lng(),
              north: viewport.getNorthEast().lat(),
              east: viewport.getNorthEast().lng(),
            }
          : null,
      };
      writeStore(key, hit, HIT_LIFETIME_MS);
      return hit;
    } catch (error) {
      // Only "no such address" is remembered; quota or network errors may pass.
      if ((error as { code?: string })?.code === 'ZERO_RESULTS') writeStore(key, null, MISS_LIFETIME_MS);
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, call);
  return call;
}
