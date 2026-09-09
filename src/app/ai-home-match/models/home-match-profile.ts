import { GeoJsonPolygon } from '../../services/apartment.service';
export type PropertyGoal = 'Rent' | 'Buy';
export type Currency = 'USD' | 'GEL' | 'EUR';
export type Gender = 'Male' | 'Female' | '';
export interface HomeMatchProfile {
  propertyGoal: PropertyGoal | '';
  districts: string[];
  locationFlexible: boolean;
  selectedMapArea?: GeoJsonPolygon;
  proximityTarget?: string;
  proximityAddress?: string;
  proximityLatitude?: number;
  proximityLongitude?: number;
  budgetMin: number;
  budgetMax: number;
  currency: Currency;
  gender: Gender;
  householdType: string;
  adults: number;
  children: number;
  childrenAgeGroups: string[];
  bedrooms?: number | null;
  rentalDuration?: string;
  moveInTiming?: string;
  moveInDate?: string;
  purchaseTiming?: string;
  transportation: string[];
  metroDistanceMinutes?: number | null;
  parkingAutomaticallyPrioritized: boolean;
  lifestyles: string[];
  hasPet: boolean | null;
  topPriorities: string[];
}

export const EMPTY_HOME_MATCH_PROFILE: HomeMatchProfile = {
  propertyGoal: '',
  districts: [],
  locationFlexible: false,
  budgetMin: 0,
  budgetMax: 1000,
  currency: 'USD',
  gender: '',
  householdType: '',
  adults: 1,
  children: 0,
  childrenAgeGroups: [],
  bedrooms: undefined,
  transportation: [],
  parkingAutomaticallyPrioritized: false,
  lifestyles: [],
  hasPet: null,
  topPriorities: [],
};
