export interface MatchReason {
  title: string;
  description?: string;
  pointsEarned?: number;
  pointsAvailable?: number;
}
export interface MatchTradeOff {
  title: string;
  description: string;
  severity?: string;
  pointsLost?: number;
}
export interface ScoreBreakdownItem {
  label: string;
  pointsEarned: number;
  pointsAvailable: number;
}
export interface PriorityScoreBreakdownItem {
  priority: string;
  rank: number;
  baseScore: number;
  multiplier: number;
  weightedPoints: number;
}
export interface HomeMatchApartment {
  id: number;
  title: string;
  description?: string;
  price: number;
  address?: string;
  imageUrl?: string;
  imageUrls?: string[];
  district?: string;
  bedrooms?: number;
  bathrooms?: number;
  sizeSquareMeters?: number;
  hasParking?: boolean;
  parkingCondition?: string;
  isPetFriendly?: boolean;
  gymDistanceMinutes?: number;
  schoolDistanceMinutes?: number;
  kindergartenDistanceMinutes?: number;
  groceryDistanceMinutes?: number;
  metroDistanceMinutes?: number;
  parkDistanceMinutes?: number;
  universityDistanceMinutes?: number;
  pharmacyDistanceMinutes?: number;
}
export interface HomeMatchResult {
  apartment: HomeMatchApartment;
  matchScore: number;
  priorityScore?: number;
  rankingScore?: number;
  priorityBreakdown?: PriorityScoreBreakdownItem[];
  priorityCoverageBonus?: number;
  matchLabel?: string;
  recommendationCategory?: string;
  reasons?: MatchReason[];
  tradeOffs?: MatchTradeOff[];
  warnings?: string[];
  scoreBreakdown?: ScoreBreakdownItem[];
}
