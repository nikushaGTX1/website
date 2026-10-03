import { Apartment } from '../models/apartment';

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
  const walk = (minutes: number | null | undefined): string | null =>
    minutes != null && Number.isFinite(Number(minutes)) && Number(minutes) <= MAX_WALK_MINUTES
      ? `${Number(minutes)} min walk`
      : null;

  const candidates: Array<NearbyPlace | null> = [
    detailOrNull('Metro', 'fa-solid fa-train-subway', walk(apartment.metroDistanceMinutes)),
    detailOrNull('Park', 'fa-solid fa-tree', walk(apartment.parkDistanceMinutes)),
    detailOrNull('Fitness', 'fa-solid fa-dumbbell', walk(apartment.gymDistanceMinutes)),
    apartment.hasParking ? { label: 'Parking', icon: 'fa-solid fa-car', detail: parkingDetail || 'Available' } : null,
    detailOrNull('Grocery', 'fa-solid fa-basket-shopping', walk(apartment.groceryDistanceMinutes)),
    detailOrNull('Pharmacy', 'fa-solid fa-prescription-bottle-medical', walk(apartment.pharmacyDistanceMinutes)),
    detailOrNull('Café', 'fa-solid fa-mug-hot', walk(apartment.cafeDistanceMinutes)),
    detailOrNull('School', 'fa-solid fa-graduation-cap', walk(apartment.schoolDistanceMinutes)),
    detailOrNull('Kindergarten', 'fa-solid fa-children', walk(apartment.kindergartenDistanceMinutes)),
    detailOrNull('University', 'fa-solid fa-building-columns', walk(apartment.universityDistanceMinutes)),
  ];
  return candidates.filter((place): place is NearbyPlace => !!place).slice(0, count);
}

function detailOrNull(label: string, icon: string, detail: string | null): NearbyPlace | null {
  return detail ? { label, icon, detail } : null;
}
