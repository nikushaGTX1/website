import { Apartment } from '../models/apartment';
import { listedUniversityMinutes } from './universities';

export interface NearbyPlace {
  label: string;
  icon: string;
  /** e.g. "6 min walk" or "Available" */
  detail: string;
}

/** Only places within this walk count as "nearby" on cards. */
const MAX_WALK_MINUTES = 20;

/**
 * Up to `count` nearby places for a listing card, in priority order. Places the listing has
 * no data for (or that are too far) are skipped, so the card never shows "Not nearby" while
 * another real place is available.
 */
export function cardNearbyPlaces(
  apartment: Apartment,
  count = 3,
  parkingDetail?: string,
): NearbyPlace[] {
  if (isHouseListing(apartment)) return houseNearbyPlaces(apartment, count, parkingDetail);
  const walk = (minutes: number | null | undefined): string | null =>
    minutes != null && Number.isFinite(Number(minutes)) && Number(minutes) <= MAX_WALK_MINUTES
      ? `${Number(minutes)} min walk`
      : null;
  const walkCandidates: Array<NearbyPlace | null> = [
    detailOrNull('Metro', 'fa-solid fa-train-subway', walk(apartment.metroDistanceMinutes)),
    detailOrNull('Park', 'fa-solid fa-tree', walk(apartment.parkDistanceMinutes)),
    detailOrNull('Fitness', 'fa-solid fa-dumbbell', walk(apartment.gymDistanceMinutes)),
    apartment.hasParking ? { label: 'Parking', icon: 'fa-solid fa-car', detail: parkingDetail || 'Available' } : null,
    detailOrNull('Grocery', 'fa-solid fa-basket-shopping', walk(apartment.groceryDistanceMinutes)),
    detailOrNull('Pharmacy', 'fa-solid fa-prescription-bottle-medical', walk(apartment.pharmacyDistanceMinutes)),
    detailOrNull('Café', 'fa-solid fa-mug-hot', walk(apartment.cafeDistanceMinutes)),
    detailOrNull('School', 'fa-solid fa-graduation-cap', walk(apartment.schoolDistanceMinutes)),
    detailOrNull('Kindergarten', 'fa-solid fa-children', walk(apartment.kindergartenDistanceMinutes)),
    detailOrNull('University', 'fa-solid fa-building-columns', walk(listedUniversityMinutes(apartment))),
  ];
  const walkable = walkCandidates.filter((place): place is NearbyPlace => !!place);
  if (walkable.filter((place) => place.label !== 'Parking').length >= count) return walkable.slice(0, count);

  // Out-of-town homes: fill the remaining slots with places a short drive away.
  const driving = nearbyDriveMinutes(apartment);
  const drive = (key: string): string | null => {
    const minutes = driving[key];
    return minutes != null && minutes <= MAX_DRIVE_MINUTES && !walk(apartment[key as keyof Apartment] as number)
      ? `${minutes} min drive`
      : null;
  };
  const driveCandidates: Array<NearbyPlace | null> = [
    detailOrNull('Grocery', 'fa-solid fa-basket-shopping', drive('groceryDistanceMinutes')),
    detailOrNull('School', 'fa-solid fa-graduation-cap', drive('schoolDistanceMinutes')),
    detailOrNull('Pharmacy', 'fa-solid fa-prescription-bottle-medical', drive('pharmacyDistanceMinutes')),
    detailOrNull('Park', 'fa-solid fa-tree', drive('parkDistanceMinutes')),
    detailOrNull('Café', 'fa-solid fa-mug-hot', drive('cafeDistanceMinutes')),
    detailOrNull('Fitness', 'fa-solid fa-dumbbell', drive('gymDistanceMinutes')),
    detailOrNull('Kindergarten', 'fa-solid fa-children', drive('kindergartenDistanceMinutes')),
    detailOrNull('Metro', 'fa-solid fa-train-subway', drive('metroDistanceMinutes')),
  ];
  // Real places come before the parking tile.
  const places = walkable.filter((place) => place.label !== 'Parking');
  const parking = walkable.find((place) => place.label === 'Parking');
  return [...places, ...driveCandidates.filter((place): place is NearbyPlace => !!place), ...(parking ? [parking] : [])]
    .slice(0, count);
}

/** Drives longer than this are not "nearby". */
const MAX_DRIVE_MINUTES = 30;

/** Private and country houses: people living there usually drive, so cards show drive times. */
export function isHouseListing(apartment: Partial<Pick<Apartment, 'title' | 'description'>>): boolean {
  // The listing meta is "Type: Private house | Deal: For rent | ...". Match only a part that
  // starts with "Type:", never "Parking type:" or "View type:".
  const type = (apartment.description || '')
    .split(/[|\n]/)
    .map((part) => part.trim())
    .find((part) => /^type:/i.test(part))
    ?.slice(5)
    .trim()
    .toLowerCase();
  if (type) return /\bhouse\b|cottage|villa/.test(type);
  return /private house|country house|კერძო სახლი|აგარაკი|частный дом|загородный дом/i.test(
    apartment.title || '',
  );
}

/**
 * Drive minutes for a house card. A measured drive time is used when saved; otherwise it is
 * worked out from the measured walking route (about 80 m per walking minute, ~400 m per
 * minute by car in town, plus a minute to get going).
 */
function houseDriveMinutes(apartment: Apartment, key: string, driving: Record<string, number>): number | null {
  const measured = driving[key];
  if (measured != null) return measured;
  const walked = Number(
    key === 'universityDistanceMinutes'
      ? listedUniversityMinutes(apartment)
      : apartment[key as keyof Apartment],
  );
  return walked > 0 && Number.isFinite(walked) ? Math.round(walked / 5) + 1 : null;
}

function houseNearbyPlaces(apartment: Apartment, count: number, parkingDetail?: string): NearbyPlace[] {
  const driving = nearbyDriveMinutes(apartment);
  const drive = (key: string): string | null => {
    const minutes = houseDriveMinutes(apartment, key, driving);
    return minutes != null && minutes <= MAX_DRIVE_MINUTES ? `${minutes} min drive` : null;
  };
  const candidates: Array<NearbyPlace | null> = [
    detailOrNull('Metro', 'fa-solid fa-train-subway', drive('metroDistanceMinutes')),
    detailOrNull('Park', 'fa-solid fa-tree', drive('parkDistanceMinutes')),
    detailOrNull('Fitness', 'fa-solid fa-dumbbell', drive('gymDistanceMinutes')),
    detailOrNull('Grocery', 'fa-solid fa-basket-shopping', drive('groceryDistanceMinutes')),
    detailOrNull('Pharmacy', 'fa-solid fa-prescription-bottle-medical', drive('pharmacyDistanceMinutes')),
    detailOrNull('Café', 'fa-solid fa-mug-hot', drive('cafeDistanceMinutes')),
    detailOrNull('School', 'fa-solid fa-graduation-cap', drive('schoolDistanceMinutes')),
    detailOrNull('Kindergarten', 'fa-solid fa-children', drive('kindergartenDistanceMinutes')),
    detailOrNull('University', 'fa-solid fa-building-columns', drive('universityDistanceMinutes')),
  ];
  const places = candidates.filter((place): place is NearbyPlace => !!place);
  const parking = apartment.hasParking
    ? { label: 'Parking', icon: 'fa-solid fa-car', detail: parkingDetail || 'Available' }
    : null;
  return [...places, ...(parking ? [parking] : [])].slice(0, count);
}

/** Key prefix for driving minutes inside the nearbyPlaceNames JSON. */
const DRIVE_PREFIX = 'drive:';

/**
 * Driving minutes saved for places too far to walk. Stored in the nearbyPlaceNames JSON as
 * flat string entries, e.g. {"drive:groceryDistanceMinutes": "7"}, because the API reads
 * that JSON as a string-to-string map.
 */
export function nearbyDriveMinutes(apartment: Pick<Apartment, 'nearbyPlaceNames'>): Record<string, number> {
  return splitNearbyPlaceNames(apartment.nearbyPlaceNames).driveMinutes;
}

/** Splits the nearbyPlaceNames JSON into place names and driving minutes. */
export function splitNearbyPlaceNames(json: string | null | undefined): {
  names: Record<string, string>;
  driveMinutes: Record<string, number>;
} {
  const names: Record<string, string> = {};
  const driveMinutes: Record<string, number> = {};
  try {
    const parsed = JSON.parse(json || 'null');
    if (!parsed || typeof parsed !== 'object') return { names, driveMinutes };
    for (const [key, value] of Object.entries(parsed)) {
      if (key.startsWith(DRIVE_PREFIX)) {
        const minutes = Number(value);
        if (Number.isFinite(minutes) && minutes > 0) driveMinutes[key.slice(DRIVE_PREFIX.length)] = minutes;
      } else if (typeof value === 'string') {
        names[key] = value;
      }
    }
  } catch {
    // Unreadable JSON counts as no saved names.
  }
  return { names, driveMinutes };
}

/** Builds the nearbyPlaceNames JSON from place names plus driving minutes. */
export function encodeNearbyPlaceNames(
  names: Record<string, string | undefined> | undefined,
  driveMinutes: Record<string, number | undefined> | undefined,
): string | undefined {
  const value: Record<string, string> = {};
  for (const [key, name] of Object.entries(names || {})) {
    if (name && !key.startsWith(DRIVE_PREFIX)) value[key] = name;
  }
  for (const [key, minutes] of Object.entries(driveMinutes || {})) {
    if (minutes != null) value[DRIVE_PREFIX + key] = String(minutes);
  }
  return Object.keys(value).length ? JSON.stringify(value) : undefined;
}

function detailOrNull(label: string, icon: string, detail: string | null): NearbyPlace | null {
  return detail ? { label, icon, detail } : null;
}
