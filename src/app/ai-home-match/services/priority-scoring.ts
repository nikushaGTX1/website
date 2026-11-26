import { normalizeApartmentStyle } from '../../utils/apartment-style';
import { HomeMatchProfile } from '../models/home-match-profile';
import { HomeMatchApartment, HomeMatchResult } from '../models/home-match-result';
import { listedUniversityMinutes } from '../../utils/universities';
import { budgetRangeUsd } from './mandatory-requirements';

const PRIORITY_MULTIPLIERS = [5, 4, 3, 2, 1] as const;
const PRIORITY_LABELS: Record<string, string> = {
  MetroNearby: 'Proximity to metro',
  SchoolNearby: 'Proximity to school',
  KindergartenNearby: 'Proximity to kindergarten',
  GymNearby: 'Proximity to gym',
  ParkNearby: 'Proximity to park',
  UniversityNearby: 'Proximity to university',
  SupermarketNearby: 'Everyday services (supermarket, pharmacy)',
  PharmacyNearby: 'Everyday services (supermarket, pharmacy)',
  EverydayServicesNearby: 'Everyday services (supermarket, pharmacy)',
  Parking: 'Parking',
  QuietStreet: 'Quiet street',
};
const DISTANCE_FIELDS: Record<string, keyof HomeMatchApartment> = {
  MetroNearby: 'metroDistanceMinutes',
  SchoolNearby: 'schoolDistanceMinutes',
  KindergartenNearby: 'kindergartenDistanceMinutes',
  GymNearby: 'gymDistanceMinutes',
  ParkNearby: 'parkDistanceMinutes',
  UniversityNearby: 'universityDistanceMinutes',
  SupermarketNearby: 'groceryDistanceMinutes',
  PharmacyNearby: 'pharmacyDistanceMinutes',
};

/**
 * Somewhere to work from home: a home office the owner ticked, or a spare room
 * (more rooms than bedrooms plus a living room, or more bedrooms than the client needs).
 */
export function hasWorkspace(apartment: HomeMatchApartment, profile?: Pick<HomeMatchProfile, 'bedrooms'>): boolean {
  if (apartment.hasHomeOfficeSpace || hasTag(apartment, 'Home office')) return true;
  const rooms = apartment.rooms ?? 0;
  const bedrooms = apartment.bedrooms ?? 0;
  if (rooms > 0 && bedrooms > 0 && rooms - bedrooms >= 2) return true;
  return !!profile?.bedrooms && bedrooms > profile.bedrooms;
}

export function walkingDistanceScore(minutes?: number): number {
  if (minutes === undefined || minutes < 0) return 0;
  // 18-minute walk is the edge of 'nearby': 1 point there, 0 beyond, more the closer it is.
  if (minutes <= 5) return 5;
  if (minutes <= 8) return 4;
  if (minutes <= 12) return 3;
  if (minutes <= 15) return 2;
  if (minutes <= 18) return 1;
  return 0;
}

export function parkingScore(apartment: HomeMatchApartment): number {
  // Listings uploaded from the site carry an explicit "Parking score: N" tag.
  const tagged = /parking score:\s*([0-5])/i.exec(apartment.description || '');
  if (tagged) return Number(tagged[1]);
  const condition = `${apartment.parkingCondition || ''} ${apartment.description || ''}`
    .replace(/[^a-z]/gi, '')
    .toLowerCase();
  const scores: Record<string, number> = {
    garage: 5,
    privatecourtyard: 4,
    courtyardwithbarrier: 3,
    streetparking: 2,
    courtyardwithoutbarrier: 1,
    difficultparking: 0,
    yellowbarrier: 4,
    parkingspacewithayellowbarrier: 4,
    remotecontrolledyardbarrier: 3,
    parkingintheyardwitharemotecontrolledbarrier: 3,
    adjacenttobuilding: 2,
    parkingadjacenttothebuilding: 2,
  };
  const matchedType = Object.keys(scores).find((type) => condition.includes(type));
  if (matchedType) return scores[matchedType];
  return 0;
}

const CITY_CENTER = { lat: 41.6938, lng: 44.8015 };

function hasTag(apartment: HomeMatchApartment, tag: string): boolean {
  // Escape the label and keep \s as a regex class: in a template string "\s" collapses to "s".
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escaped}:\\s*yes`, 'i').test(apartment.description || '');
}

function minutesOf(apartment: HomeMatchApartment, ...fields: Array<keyof HomeMatchApartment>): number | undefined {
  const values = fields
    // Only universities from the approved list count; training centres are ignored.
    .map((field) => (field === 'universityDistanceMinutes' ? listedUniversityMinutes(apartment) : apartment[field]))
    .filter((value): value is number => typeof value === 'number' && value >= 0);
  return values.length ? Math.min(...values) : undefined;
}

/** Arithmetic mean of the supermarket and pharmacy walks; uses whichever exists if only one is measured. */
export function everydayServicesMinutes(apartment: HomeMatchApartment): number | undefined {
  const values = [apartment.groceryDistanceMinutes, apartment.pharmacyDistanceMinutes]
    .filter((value): value is number => typeof value === 'number' && value >= 0);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
}

export function walkingMinutesTo(apartment: HomeMatchApartment, lat?: number | null, lng?: number | null): number | undefined {
  const aLat = apartment.propertyLatitude ?? apartment.latitude;
  const aLng = apartment.propertyLongitude ?? apartment.longitude;
  if (lat == null || lng == null || aLat == null || aLng == null) return undefined;
  const rad = (deg: number): number => (deg * Math.PI) / 180;
  const h =
    Math.sin(rad(lat - aLat) / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(lat)) * Math.sin(rad(lng - aLng) / 2) ** 2;
  const km = 2 * 6371 * Math.asin(Math.sqrt(h));
  return km * 12; // ~5 km/h walking pace
}

function yes(value: boolean | undefined | null): number {
  return value ? 5 : 0;
}

/** Measured walking time wins; an owner's 'nearby' tick only counts (as 18 min) when nothing was measured. */
function nearby(apartment: HomeMatchApartment, tags: string[], ...fields: Array<keyof HomeMatchApartment>): number {
  const minutes = minutesOf(apartment, ...fields);
  if (minutes !== undefined) return walkingDistanceScore(minutes);
  return tags.some((tag) => hasTag(apartment, tag)) ? walkingDistanceScore(18) : 0;
}

export function scorePriority(priority: string, apartment: HomeMatchApartment, profile: HomeMatchProfile): number {
  const walk = (...fields: Array<keyof HomeMatchApartment>): number =>
    walkingDistanceScore(minutesOf(apartment, ...fields));
  switch (priority) {
    case 'Parking':
      return parkingScore(apartment);
    case 'QuietStreet':
      return yes(apartment.isQuietStreet || hasTag(apartment, 'Quiet street'));
    case 'PublicTransportNearby':
      return walk('metroDistanceMinutes');
    case 'PlaygroundNearby':
      return Math.max(yes(hasTag(apartment, 'Playground nearby')), walk('parkDistanceMinutes'));
    case 'PlaygroundOrSportsFieldNearby':
      return Math.max(yes(hasTag(apartment, 'Playground nearby')), walk('parkDistanceMinutes', 'gymDistanceMinutes'));
    case 'ClinicNearby':
      return walk('pharmacyDistanceMinutes');
    case 'EverydayServicesNearby':
    case 'SupermarketNearby':
    case 'PharmacyNearby': {
      // Everyday services = supermarket + pharmacy, scored on the average walk
      // (e.g. shop 10 min, pharmacy 15 min -> 12.5 min). Saved older profiles map here too.
      const minutes = everydayServicesMinutes(apartment);
      if (minutes !== undefined) return walkingDistanceScore(minutes);
      return hasTag(apartment, 'Everyday services nearby') ? walkingDistanceScore(18) : 0;
    }
    case 'CafesNearby':
    case 'CafesAndRestaurantsNearby':
    case 'MeetingPlacesNearby':
      return nearby(apartment, ['Cafe nearby', 'Cafés / coworking nearby'], 'cafeDistanceMinutes');
    case 'CafesOrCoworkingNearby':
    case 'StudySpacesNearby':
      // Coworking has no measured distance; the owner's tick counts as a strong match.
      return Math.max(
        yes(hasTag(apartment, 'Coworking nearby')),
        nearby(apartment, ['Cafe nearby', 'Cafés / coworking nearby'], 'cafeDistanceMinutes'),
      );
    case 'Workspace':
      return yes(hasWorkspace(apartment, profile));
    case 'BalconyOrTerrace':
      return yes(apartment.hasBalcony);
    case 'MultipleBathrooms':
      return yes((apartment.bathrooms ?? 0) >= 2);
    case 'SecurityOrConcierge':
      return yes(hasTag(apartment, 'Security or concierge'));
    case 'ModernMaintainedBuilding':
      return yes(hasTag(apartment, 'Modern building'));
    case 'IsolatedBedrooms':
      return yes(hasTag(apartment, 'Isolated bedrooms'));
    case 'AwayFromNightlife':
      return yes(hasTag(apartment, 'Away from nightlife') || apartment.isQuietStreet);
    case 'CompanyLeaseAvailable':
      return yes(hasTag(apartment, 'Company lease available'));
    case 'CityCenterNearby':
    case 'EntertainmentNearby':
      return walkingDistanceScore(walkingMinutesTo(apartment, CITY_CENTER.lat, CITY_CENTER.lng));
    case 'SelectedLocationNearby':
    case 'OfficeNearby': {
      const minutes = walkingMinutesTo(apartment, profile.proximityLatitude, profile.proximityLongitude);
      if (minutes !== undefined) return walkingDistanceScore(minutes);
      // No pinned place: no points. Being in the chosen district is already a hard filter and
      // must not count again as "near the place you chose".
      return 0;
    }
  }
  const field = DISTANCE_FIELDS[priority];
  const value = field ? apartment[field] : undefined;
  return walkingDistanceScore(typeof value === 'number' ? value : undefined);
}

/** Straight-line km from the home to the client's office, when both points are known. */
export function officeDistanceKm(apartment: HomeMatchApartment, profile: HomeMatchProfile): number | undefined {
  const minutes = walkingMinutesTo(apartment, profile.officeLatitude, profile.officeLongitude);
  return minutes === undefined ? undefined : minutes / 12;
}

/** Same bands as the API: the closer to the office, the higher. */
export function officeDistancePoints(km: number): number {
  return km <= 1.5 ? 10 : km <= 3 ? 8 : km <= 5 ? 5 : km <= 8 ? 2 : 0;
}

function businessScore(apartment: HomeMatchApartment, profile: HomeMatchProfile, lifestyles: Set<string>): number {
  if (profile.businessMode === 'HomeBusiness') {
    // Same rule as "I work from home"; not counted twice when both are chosen.
    return !lifestyles.has('RemoteWorker') && hasWorkspace(apartment, profile) ? 6 : 0;
  }
  if (profile.businessMode === 'NearOffice') {
    const km = officeDistanceKm(apartment, profile);
    return km === undefined ? 0 : officeDistancePoints(km);
  }
  return (apartment.metroDistanceMinutes ?? 99) <= 10 || parkingScore(apartment) >= 3 ? 5 : 0;
}

/** Lifestyle answers that are not priorities still nudge the ranking. */
function lifestyleAdjustment(apartment: HomeMatchApartment, profile: HomeMatchProfile): number {
  let points = 0;
  // Apartment style: a matching Modern / Vintage listing ranks higher; "Something else" has no effect.
  if (profile.apartmentStyle === 'Modern' || profile.apartmentStyle === 'Vintage') {
    const style = normalizeApartmentStyle(apartment.apartmentStyle);
    if (style) points += style === profile.apartmentStyle ? 8 : -4;
  }
  // Pets are a hard filter (mandatory-requirements.ts), not a ranking factor.
  if (profile.transportation.includes('Car')) points += parkingScore(apartment) >= 3 ? 6 : parkingScore(apartment) === 0 ? -6 : 0;
  // Electric car owners: an EV charger within a 10-minute walk earns 3 points.
  if (
    profile.transportation.includes('Car') &&
    profile.carFuelType === 'Electric' &&
    typeof apartment.evChargerDistanceMinutes === 'number' &&
    apartment.evChargerDistanceMinutes <= 10
  ) {
    points += 3;
  }
  if (profile.transportation.includes('Metro') || profile.transportation.includes('Walking')) {
    const metro = apartment.metroDistanceMinutes;
    if (typeof metro === 'number') points += metro <= 10 ? 5 : metro > 20 ? -5 : 0;
  }
  if (profile.metroDistanceMinutes && typeof apartment.metroDistanceMinutes === 'number') {
    points += apartment.metroDistanceMinutes <= profile.metroDistanceMinutes ? 6 : -10;
  }
  if (profile.bedrooms && apartment.bedrooms != null) {
    points += apartment.bedrooms >= profile.bedrooms ? 4 : -15;
  }
  const people = profile.adults + profile.children;
  if (apartment.bedrooms != null && apartment.bedrooms > 0 && people > apartment.bedrooms * 2) points -= 10;
  const lifestyles = new Set(profile.lifestyles);
  if (lifestyles.has('RemoteWorker') && hasWorkspace(apartment, profile)) points += 6;
  if (lifestyles.has('QuietLifestyle') && (apartment.isQuietStreet || hasTag(apartment, 'Quiet street'))) points += 6;
  // Active/Sporty: proximity to gyms and parks.
  if (lifestyles.has('Athlete')) {
    if ((apartment.gymDistanceMinutes ?? 99) <= 10) points += 5;
    if ((apartment.parkDistanceMinutes ?? 99) <= 10) points += 3;
  }
  if (lifestyles.has('Student') && (listedUniversityMinutes(apartment) ?? 99) <= 15) points += 5;
  // Business/professional: near the office they marked, a home office, or (no answer yet) metro / parking.
  if (lifestyles.has('BusinessProfessional')) points += businessScore(apartment, profile, lifestyles);
  // Social lifestyle: proximity to cafés and restaurants.
  if (lifestyles.has('SocialLifestyle') && (apartment.cafeDistanceMinutes ?? 99) <= 10) points += 5;
  // Frequently hosts guests: enough living/dining space for company.
  if (
    lifestyles.has('HostsGuests') &&
    ((apartment.bedrooms ?? 0) >= 2 || (apartment.sizeSquareMeters ?? 0) >= 80)
  ) {
    points += 5;
  }
  if (profile.children > 0) {
    const school = apartment.schoolDistanceMinutes;
    const kindergarten = apartment.kindergartenDistanceMinutes;
    const near = [school, kindergarten].some((m) => typeof m === 'number' && m <= 10);
    points += near ? 5 : 0;
  }
  return points;
}

/**
 * Value for money inside the client's budget: a home well under the maximum earns points,
 * one at the very top earns few. Two homes that fit equally well are then ordered so the
 * cheaper one wins (#762 at $1,200 over #696 at $1,800 with the same fit).
 *   price <= 60% of max: +15 · <= 75%: +11 · <= 90%: +6 · <= 100%: +2 · above max: -10
 */
export function valueScore(apartment: HomeMatchApartment, profile: HomeMatchProfile): number {
  const price = Number(apartment.price);
  const { max } = budgetRangeUsd(profile);
  if (!price || !max) return 0;
  const ratio = price / max;
  return ratio <= 0.6 ? 15 : ratio <= 0.75 ? 11 : ratio <= 0.9 ? 6 : ratio <= 1 ? 2 : -10;
}

/**
 * Velven Match ranking. Hard filters (deal type, budget ceiling, district, bedrooms, pets,
 * lease term) are applied before this in mandatory-requirements.ts; this only orders the
 * homes that pass them. Every part is measurable and shows up in "Why it fits you":
 *   priorities  top-5 answers, walking-distance score 0-5 x weight 5/4/3/2/1   (0-75)
 *   coverage    +3/+6/+10/+15 when 2/3/4/5 priorities are met                   (0-15)
 *   lifestyle   lifestyle, car/parking, metro, style, household space, half weight (about -15..+20)
 *   value       price against the budget maximum (valueScore)                   (-10..+15)
 *   base        the API's general fit score, at a quarter weight so it cannot
 *               outweigh the client's own priorities                             (0-25)
 */
export function applyPriorityScoring(result: HomeMatchResult, profile: HomeMatchProfile): HomeMatchResult {
  const rawScores = profile.topPriorities.slice(0, 5).map((priority) =>
    priority === 'UniversityNearby' && !profile.transportation.includes('Walking')
      ? 0
      : scorePriority(priority, result.apartment, profile),
  );
  const weightedScore = rawScores.reduce(
    (total, score, index) => total + score * PRIORITY_MULTIPLIERS[index],
    0,
  );
  const satisfied = rawScores.filter((score) => score > 0).length;
  const coverageBonus = satisfied === 5 ? 15 : satisfied === 4 ? 10 : satisfied === 3 ? 6 : satisfied === 2 ? 3 : 0;
  const value = valueScore(result.apartment, profile);
  // The client's top-5 priorities lead; lifestyle answers only fine-tune (half weight).
  const priorityScore = weightedScore + coverageBonus + Math.round(lifestyleAdjustment(result.apartment, profile) * 0.5) + value;
  const priorityBreakdown = profile.topPriorities.slice(0, 5).map((priority, index) => ({
    priority: PRIORITY_LABELS[priority] || priority.replace(/([a-z])([A-Z])/g, '$1 $2'),
    rank: index + 1,
    baseScore: rawScores[index],
    multiplier: PRIORITY_MULTIPLIERS[index],
    weightedPoints: rawScores[index] * PRIORITY_MULTIPLIERS[index],
  }));
  return {
    ...result,
    priorityScore,
    rankingScore: Math.round((result.matchScore || 0) * 0.25) + priorityScore,
    priorityBreakdown,
    priorityCoverageBonus: coverageBonus,
  };
}
