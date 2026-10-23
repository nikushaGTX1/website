import { GeoJsonPolygon } from '../../services/apartment.service';
export type PropertyGoal = 'Rent' | 'Buy';
export type Currency = 'USD' | 'GEL' | 'EUR';
export type Gender = 'Male' | 'Female' | '';
export type PetKind = 'Dog' | 'Cat' | 'Other';
export type DogSize = 'Small' | 'Medium' | 'Large';
export interface HomeMatchProfile {
  /** Conversion used when saving; changing budget or currency invalidates this snapshot. */
  budgetConversion?: { currency: Currency; min: number; max: number; usdGel: number; usdEur: number };
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
  /** Smallest chosen bedroom count (null = "Let AI decide"); kept for the API and older code. */
  bedrooms?: number | null;
  /** Every chosen bedroom count, up to 3 (4 = "4 or more"). Empty with "Let AI decide". */
  bedroomChoices?: number[];
  rentalDuration?: string;
  moveInTiming?: string;
  moveInDate?: string;
  purchaseTiming?: string;
  transportation: string[];
  metroDistanceMinutes?: number | null;
  parkingAutomaticallyPrioritized: boolean;
  /** Asked when Car is selected. */
  carFuelType?: 'Electric' | 'Fuel' | '';
  lifestyles: string[];
  hasPet: boolean | null;
  /** First selected pet ('None' = no pets); kept for older saved profiles and summaries. */
  petType?: 'None' | 'Dog' | 'Cat' | 'Other';
  /** Every pet the user lives with (multi-select). Empty with petType 'None' = no pets. */
  petTypes?: PetKind[];
  /** Asked when Dog is selected. */
  dogSize?: DogSize;
  petOtherType?: string;
  petCount?: number;
  topPriorities: string[];
  /** Preferred apartment style; 'Other' = something else / no preference. */
  apartmentStyle?: 'Modern' | 'Vintage' | 'Other' | '';
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
  bedroomChoices: [],
  transportation: [],
  parkingAutomaticallyPrioritized: false,
  lifestyles: [],
  hasPet: null,
  petType: undefined,
  petTypes: [],
  dogSize: undefined,
  petOtherType: '',
  petCount: 1,
  topPriorities: [],
};
