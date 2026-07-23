export type PropertyGoal = 'Rent' | 'Buy';
export type Currency = 'USD' | 'GEL' | 'EUR';
export interface HomeMatchProfile {
  propertyGoal: PropertyGoal | '';
  districts: string[];
  locationFlexible: boolean;
  proximityTarget?: string;
  proximityAddress?: string;
  proximityLatitude?: number;
  proximityLongitude?: number;
  budgetMin: number;
  budgetMax: number;
  currency: Currency;
  includesUtilities?: boolean | null;
  householdType: string;
  adults: number;
  children: number;
  childrenAgeGroups: string[];
  bedrooms?: number | null;
  additionalRoom?: string;
  rentalDuration?: string;
  moveInTiming?: string;
  moveInDate?: string;
  purchaseTiming?: string;
  transportation: string[];
  metroDistanceMinutes?: number | null;
  parkingAutomaticallyPrioritized: boolean;
  lifestyles: string[];
  hasPet: boolean | null;
  mainPreferences: string[];
  additionalRequirements: string[];
  topPriorities: string[];
  additionalNotes?: string;
}

export const EMPTY_HOME_MATCH_PROFILE: HomeMatchProfile = {
  propertyGoal: '',
  districts: [],
  locationFlexible: false,
  budgetMin: 1000,
  budgetMax: 1800,
  currency: 'USD',
  includesUtilities: null,
  householdType: '',
  adults: 1,
  children: 0,
  childrenAgeGroups: [],
  bedrooms: undefined,
  transportation: [],
  parkingAutomaticallyPrioritized: false,
  lifestyles: [],
  hasPet: null,
  mainPreferences: [],
  additionalRequirements: [],
  topPriorities: [],
};
