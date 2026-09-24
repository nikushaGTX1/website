import { HomeMatchProfile } from '../models/home-match-profile';
import { HomeMatchApartment, HomeMatchResult } from '../models/home-match-result';

const PRIORITY_MULTIPLIERS = [5, 4, 3, 2, 1] as const;
const PRIORITY_LABELS: Record<string, string> = {
  MetroNearby: 'Proximity to metro',
  SchoolNearby: 'Proximity to school',
  KindergartenNearby: 'Proximity to kindergarten',
  GymNearby: 'Proximity to gym',
  ParkNearby: 'Proximity to park',
  UniversityNearby: 'Proximity to university',
  SupermarketNearby: 'Proximity to supermarket',
  PharmacyNearby: 'Proximity to pharmacy',
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

export function walkingDistanceScore(minutes?: number): number {
  if (minutes === undefined || minutes < 0) return 0;
  if (minutes <= 5) return 5;
  if (minutes <= 10) return 4;
  if (minutes <= 15) return 3;
  if (minutes <= 20) return 2;
  if (minutes <= 30) return 1;
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
  return new RegExp(`${tag}:\s*yes`, 'i').test(apartment.description || '');
}

function minutesOf(apartment: HomeMatchApartment, ...fields: Array<keyof HomeMatchApartment>): number | undefined {
  const values = fields
    .map((field) => apartment[field])
    .filter((value): value is number => typeof value === 'number' && value >= 0);
  return values.length ? Math.min(...values) : undefined;
}

function walkingMinutesTo(apartment: HomeMatchApartment, lat?: number | null, lng?: number | null): number | undefined {
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
      return walk('groceryDistanceMinutes', 'pharmacyDistanceMinutes');
    case 'CafesNearby':
    case 'CafesAndRestaurantsNearby':
    case 'MeetingPlacesNearby':
      return Math.max(yes(hasTag(apartment, 'Cafés / coworking nearby')), walk('cafeDistanceMinutes'));
    case 'CafesOrCoworkingNearby':
    case 'StudySpacesNearby':
      return Math.max(yes(hasTag(apartment, 'Cafés / coworking nearby')), walk('cafeDistanceMinutes'));
    case 'Workspace':
      return yes(apartment.hasHomeOfficeSpace || hasTag(apartment, 'Home office'));
    case 'BalconyOrTerrace':
      return yes(apartment.hasBalcony);
    case 'LargeLivingRoom':
      return yes(hasTag(apartment, 'Large living room') || (apartment.sizeSquareMeters ?? 0) >= 90);
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
      const district = (apartment.district || apartment.address || '').toLowerCase();
      return profile.districts.some((d) => district.includes(d.toLowerCase())) ? 5 : 0;
    }
  }
  const field = DISTANCE_FIELDS[priority];
  const value = field ? apartment[field] : undefined;
  return walkingDistanceScore(typeof value === 'number' ? value : undefined);
}

/** Lifestyle answers that are not priorities still nudge the ranking. */
function lifestyleAdjustment(apartment: HomeMatchApartment, profile: HomeMatchProfile): number {
  let points = 0;
  if (profile.hasPet) points += apartment.isPetFriendly || hasTag(apartment, 'Pet friendly') ? 8 : -12;
  if (profile.transportation.includes('Car')) points += parkingScore(apartment) >= 3 ? 6 : parkingScore(apartment) === 0 ? -6 : 0;
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
  if (lifestyles.has('RemoteWorker') && (apartment.hasHomeOfficeSpace || hasTag(apartment, 'Home office'))) points += 6;
  if (lifestyles.has('QuietLifestyle') && (apartment.isQuietStreet || hasTag(apartment, 'Quiet street'))) points += 6;
  // Active/Sporty: proximity to gyms and parks.
  if (lifestyles.has('Athlete')) {
    if ((apartment.gymDistanceMinutes ?? 99) <= 10) points += 5;
    if ((apartment.parkDistanceMinutes ?? 99) <= 10) points += 3;
  }
  if (lifestyles.has('Student') && (apartment.universityDistanceMinutes ?? 99) <= 15) points += 5;
  // Business/professional: commute to work and transportation access.
  if (
    lifestyles.has('BusinessProfessional') &&
    ((apartment.metroDistanceMinutes ?? 99) <= 10 || parkingScore(apartment) >= 3)
  ) {
    points += 5;
  }
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
  const priorityScore = weightedScore + coverageBonus + lifestyleAdjustment(result.apartment, profile);
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
    rankingScore: result.matchScore + priorityScore,
    priorityBreakdown,
    priorityCoverageBonus: coverageBonus,
  };
}
