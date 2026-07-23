export interface HomePreferenceRequest {
  districts: string[];
  householdType: string;
  adults?: number;
  children?: number;
  bedrooms: number;
  pets: string[];
  lifestyles: string[];
  transportation: string;
  metroDistanceMinutes?: number;
  needsParking: boolean;
  budgetMin: number;
  budgetMax: number;
  mustHaves: string[];
  niceToHaves: string[];
  preferredStyle?: string;
}
