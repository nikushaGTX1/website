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
  if (minutes <= 25) return 2;
  if (minutes <= 40) return 1;
  return 0;
}

export function parkingScore(apartment: HomeMatchApartment): number {
  const condition = `${apartment.parkingCondition || ''} ${apartment.description || ''}`
    .replace(/[^a-z]/gi, '')
    .toLowerCase();
  const scores: Record<string, number> = {
    garage: 5,
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

function scorePriority(priority: string, apartment: HomeMatchApartment): number {
  if (priority === 'Parking') return parkingScore(apartment);
  if (priority === 'QuietStreet') {
    return apartment.isQuietStreet || /quiet street:\s*yes/i.test(apartment.description || '') ? 5 : 0;
  }
  const field = DISTANCE_FIELDS[priority];
  const value = field ? apartment[field] : undefined;
  return walkingDistanceScore(typeof value === 'number' ? value : undefined);
}

export function applyPriorityScoring(result: HomeMatchResult, profile: HomeMatchProfile): HomeMatchResult {
  const rawScores = profile.topPriorities.slice(0, 5).map((priority) =>
    priority === 'UniversityNearby' && !profile.transportation.includes('Walking')
      ? 0
      : scorePriority(priority, result.apartment),
  );
  const weightedScore = rawScores.reduce(
    (total, score, index) => total + score * PRIORITY_MULTIPLIERS[index],
    0,
  );
  const satisfied = rawScores.filter((score) => score > 0).length;
  const coverageBonus = satisfied === 5 ? 10 : satisfied >= 3 ? 5 : satisfied === 2 ? 2 : 0;
  const priorityScore = weightedScore + coverageBonus;
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
