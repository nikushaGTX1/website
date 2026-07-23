import { HomeMatchProfile } from '../models/home-match-profile';
import { HomeMatchApartment, HomeMatchResult } from '../models/home-match-result';

const PRIORITY_MULTIPLIERS = [5, 3, 2] as const;
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
  const condition = apartment.parkingCondition?.replace(/[^a-z]/gi, '').toLowerCase();
  const scores: Record<string, number> = {
    privateunderground: 5,
    privateundergroundprivateparking: 5,
    privateundergroundparking: 5,
    privateparking: 5,
    guaranteedcourtyard: 4,
    guaranteedcourtyardparking: 4,
    easystreet: 3,
    easystreetparking: 3,
    moderatelydifficultstreet: 2,
    moderatelydifficultstreetparking: 2,
    difficultparking: 1,
    almostnoparking: 0,
  };
  if (condition && scores[condition] !== undefined) return scores[condition];
  return apartment.hasParking ? 5 : 0;
}

function scorePriority(priority: string, apartment: HomeMatchApartment): number {
  if (priority === 'Parking') return parkingScore(apartment);
  const field = DISTANCE_FIELDS[priority];
  const value = field ? apartment[field] : undefined;
  return walkingDistanceScore(typeof value === 'number' ? value : undefined);
}

export function applyPriorityScoring(result: HomeMatchResult, profile: HomeMatchProfile): HomeMatchResult {
  const rawScores = profile.topPriorities.slice(0, 3).map((priority) =>
    priority === 'UniversityNearby' && !profile.transportation.includes('Walking')
      ? 0
      : scorePriority(priority, result.apartment),
  );
  const weightedScore = rawScores.reduce(
    (total, score, index) => total + score * PRIORITY_MULTIPLIERS[index],
    0,
  );
  const satisfied = rawScores.filter((score) => score > 0).length;
  const coverageBonus = satisfied === 3 ? 7 : satisfied === 2 ? 3 : 0;
  const priorityScore = weightedScore + coverageBonus;
  const priorityBreakdown = profile.topPriorities.slice(0, 3).map((priority, index) => ({
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
