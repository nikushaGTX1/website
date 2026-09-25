import { HomeMatchProfile } from '../models/home-match-profile';
import { HomeMatchApartment } from '../models/home-match-result';
import { answerLabel } from './answer-labels';

/**
 * Velven Match pipeline:
 *   mandatory requirements -> filter -> uncertain requirements -> lifestyle ranking.
 * Lifestyle scores may only reorder homes inside a status group; they never promote a home
 * that fails a mandatory requirement.
 */
export type RequirementStatus = 'exact' | 'confirm' | 'alternative';

export interface RequirementEvaluation {
  status: RequirementStatus;
  /** Mandatory requirements the home clearly fails. */
  mismatches: string[];
  /** Requirements the listing does not let us verify. */
  confirmations: string[];
}

const GEORGIAN_DISTRICTS: Record<string, string> = {
  'ვაკე': 'vake',
  'საბურთალო': 'saburtalo',
  'ვერა': 'vera',
  'მთაწმინდა': 'mtatsminda',
  'დიღომი': 'digomi',
  'დიდი დიღომი': 'didi digomi',
  'ისანი': 'isani',
  'ორთაჭალა': 'ortachala',
  'ჩუღურეთი': 'chugureti',
  'გლდანი': 'gldani',
  'ნაძალადევი': 'nadzaladevi',
  'დიდუბე': 'didube',
  'სამგორი': 'samgori',
  'კრწანისი': 'krtsanisi',
  'ავლაბარი': 'avlabari',
  'სოლოლაკი': 'sololaki',
};

function normalizeDistrict(value: string | undefined | null): string {
  const raw = (value || '').trim().toLowerCase();
  if (!raw) return '';
  const georgian = GEORGIAN_DISTRICTS[raw];
  if (georgian) return georgian;
  return raw
    .replace(/dighomi/g, 'digomi')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Profile values such as "DidiDighomi" arrive without spaces; make them comparable. */
function normalizeProfileDistrict(value: string): string {
  return normalizeDistrict(value.replace(/([a-z])([A-Z])/g, '$1 $2'));
}

function insidePolygon(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi || Number.EPSILON) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function displayDistrict(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2');
}

type Check = 'pass' | 'fail' | 'unknown';

function checkLocation(apartment: HomeMatchApartment, profile: HomeMatchProfile): Check {
  if (profile.locationFlexible) return 'pass';
  const wanted = profile.districts
    .filter((district) => district !== 'SelectOnMap')
    .map(normalizeProfileDistrict)
    .filter(Boolean);
  const polygon = profile.selectedMapArea;
  if (!wanted.length && !polygon) return 'pass';

  const district = normalizeDistrict(apartment.district);
  if (district && wanted.includes(district)) return 'pass';

  if (polygon?.coordinates?.[0]?.length) {
    const lat = Number(apartment.propertyLatitude ?? apartment.latitude);
    const lng = Number(apartment.propertyLongitude ?? apartment.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      if (insidePolygon(lng, lat, polygon.coordinates[0])) return 'pass';
    } else if (!district) {
      return 'unknown';
    }
  }
  if (!district) {
    // Without a district, the address may still name the wanted area.
    const address = normalizeDistrict(apartment.address);
    if (address && wanted.some((item) => address.includes(item))) return 'pass';
    return polygon ? 'fail' : 'unknown';
  }
  return 'fail';
}

function checkBedrooms(apartment: HomeMatchApartment, profile: HomeMatchProfile): Check {
  const wanted = profile.bedrooms;
  // null = "Let AI decide", undefined = not asked (purchase flow may skip it).
  if (wanted === null || wanted === undefined || wanted <= 0) return 'pass';
  if (apartment.bedrooms === null || apartment.bedrooms === undefined) return 'unknown';
  return Number(apartment.bedrooms) >= wanted ? 'pass' : 'fail';
}

function petName(profile: HomeMatchProfile): string {
  if (profile.petType === 'Cat') return 'Cat';
  if (profile.petType === 'Dog') return 'Dog';
  return 'Pet';
}

function petConfirmed(apartment: HomeMatchApartment): boolean {
  return apartment.isPetFriendly === true || /pet friendly:\s*yes/i.test(apartment.description || '');
}

/** Roughly how many months the user intends to stay, for comparing against a listing's minimum lease. */
const REQUESTED_STAY_MONTHS: Record<string, number> = {
  ThreeToFiveMonths: 3,
  SixMonths: 6,
  TwelveMonths: 12,
  MoreThanTwelveMonths: 12,
};

/** The listing's own minimum lease term, parsed from "Minimum 6 months" / "Minimum 12 months". */
function listingMinimumMonths(apartment: HomeMatchApartment): number | null {
  const match = /(\d+)\s*month/i.exec(apartment.minimumRentalPeriod || '');
  return match ? Number(match[1]) : null;
}

function checkRentalDuration(apartment: HomeMatchApartment, profile: HomeMatchProfile): Check {
  if (profile.propertyGoal !== 'Rent') return 'pass';
  const minimum = listingMinimumMonths(apartment);
  if (minimum === null) return 'pass'; // listing has no stated minimum lease
  const requested = profile.rentalDuration ? REQUESTED_STAY_MONTHS[profile.rentalDuration] : undefined;
  if (requested === undefined) return 'unknown'; // "I do not know yet" or not answered
  return requested >= minimum ? 'pass' : 'fail';
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The date the user wants to move in by, or null when they have no fixed timing (Flexible/unanswered). */
function requestedMoveInDate(profile: HomeMatchProfile): string | null {
  switch (profile.moveInTiming) {
    case 'Immediately':
      return todayIso();
    case 'WithinOneWeek':
      return addDaysIso(7);
    case 'WithinOneMonth':
      return addDaysIso(30);
    case 'SpecificDate':
      return profile.moveInDate?.trim() || null;
    default:
      return null; // 'Flexible' or not answered: no availability constraint
  }
}

function checkAvailability(apartment: HomeMatchApartment, profile: HomeMatchProfile): Check {
  if (profile.propertyGoal !== 'Rent') return 'pass';
  const availableFrom = apartment.availableFrom?.trim();
  if (!availableFrom) return 'pass'; // no stated availability date: assumed available now
  const requested = requestedMoveInDate(profile);
  if (!requested) return 'unknown';
  // Both are ISO-ish date strings (yyyy-mm-dd...), so lexical comparison is also chronological.
  return availableFrom.slice(0, 10) <= requested ? 'pass' : 'fail';
}

function checkOccupancy(apartment: HomeMatchApartment, profile: HomeMatchProfile): Check {
  if (profile.propertyGoal !== 'Rent') return 'pass';
  if (apartment.maxOccupants === undefined || apartment.maxOccupants === null) return 'pass';
  const occupants = (profile.adults || 0) + (profile.children || 0);
  if (!occupants) return 'pass';
  return occupants <= apartment.maxOccupants ? 'pass' : 'fail';
}

export function evaluateMandatoryRequirements(
  apartment: HomeMatchApartment,
  profile: HomeMatchProfile,
): RequirementEvaluation {
  const mismatches: string[] = [];
  const confirmations: string[] = [];

  const location = checkLocation(apartment, profile);
  if (location === 'fail') {
    const wanted = profile.districts
      .filter((district) => district !== 'SelectOnMap')
      .map(displayDistrict)
      .join(', ');
    const actual = apartment.district ? displayDistrict(apartment.district) : 'another area';
    mismatches.push(
      wanted ? `Location: ${actual}, not ${wanted}` : `Location: ${actual}, outside your selected map area`,
    );
  } else if (location === 'unknown') {
    confirmations.push('Location could not be verified');
  }

  const bedrooms = checkBedrooms(apartment, profile);
  if (bedrooms === 'fail') {
    mismatches.push(`Bedrooms: ${apartment.bedrooms}, you need ${profile.bedrooms}${profile.bedrooms! >= 4 ? '+' : ''}`);
  } else if (bedrooms === 'unknown') {
    confirmations.push('Number of bedrooms is not specified in the listing');
  }

  if (profile.propertyGoal !== 'Buy' && profile.hasPet && !petConfirmed(apartment)) {
    confirmations.push(`${petName(profile)} permission needs to be confirmed`);
  }

  const rentalDuration = checkRentalDuration(apartment, profile);
  if (rentalDuration === 'fail') {
    mismatches.push(
      `Lease: this listing requires a minimum ${listingMinimumMonths(apartment)}-month stay`,
    );
  } else if (rentalDuration === 'unknown') {
    confirmations.push('This listing has a minimum lease term; confirm it matches your plans');
  }

  const availability = checkAvailability(apartment, profile);
  if (availability === 'fail') {
    mismatches.push(
      `Availability: not free until ${apartment.availableFrom!.slice(0, 10)}, after your move-in date`,
    );
  } else if (availability === 'unknown') {
    confirmations.push('Confirm this listing is available by your move-in date');
  }

  const occupancy = checkOccupancy(apartment, profile);
  if (occupancy === 'fail') {
    const occupants = (profile.adults || 0) + (profile.children || 0);
    mismatches.push(`Occupants: allows up to ${apartment.maxOccupants}, you have ${occupants}`);
  }

  // Rentals may pass the mandatory budget filter up to $200 over the typed maximum; flag it
  // here so a home using that allowance is never silently shown as an exact/Top match.
  if (
    profile.propertyGoal === 'Rent' &&
    profile.currency === 'USD' &&
    profile.budgetMax > 0 &&
    apartment.price > profile.budgetMax
  ) {
    confirmations.push(
      `$${Math.round(apartment.price - profile.budgetMax)} over your budget (within the allowed $200 flexibility)`,
    );
  }

  const status: RequirementStatus = mismatches.length ? 'alternative' : confirmations.length ? 'confirm' : 'exact';
  return { status, mismatches, confirmations };
}
