import type { RequirementEvaluation } from '../services/mandatory-requirements';

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
  latitude?: number;
  longitude?: number;
  propertyLatitude?: number;
  propertyLongitude?: number;
  imageUrl?: string;
  imageUrls?: string[];
  images?: Array<{
    url?: string;
    storagePath?: string;
    sortOrder?: number;
    isCover?: boolean;
  }>;
  district?: string;
  bedrooms?: number;
  bathrooms?: number;
  sizeSquareMeters?: number;
  hasParking?: boolean;
  parkingCondition?: string;
  isQuietStreet?: boolean;
  isPetFriendly?: boolean;
  hasBalcony?: boolean;
  hasHomeOfficeSpace?: boolean;
  hasElevator?: boolean;
  gymDistanceMinutes?: number;
  schoolDistanceMinutes?: number;
  kindergartenDistanceMinutes?: number;
  groceryDistanceMinutes?: number;
  cafeDistanceMinutes?: number;
  metroDistanceMinutes?: number;
  parkDistanceMinutes?: number;
  universityDistanceMinutes?: number;
  pharmacyDistanceMinutes?: number;
  /** e.g. "Minimum 6 months" / "Minimum 12 months"; unset means no minimum lease term. */
  minimumRentalPeriod?: string;
  /** Earliest date the property can be moved into (ISO date string). Unset means available now. */
  availableFrom?: string;
  /** Maximum occupants the owner/landlord allows. Unset means unspecified. */
  maxOccupants?: number;
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
  /** Set by the client: how the home fares against the mandatory requirements. */
  requirement?: RequirementEvaluation;
}
