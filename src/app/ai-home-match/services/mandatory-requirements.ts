import { DogSize, HomeMatchProfile, PetKind } from '../models/home-match-profile';
import { HomeMatchApartment } from '../models/home-match-result';
import { answerLabel } from './answer-labels';

/**
 * Velven Match pipeline:
 *   mandatory requirements -> filter -> uncertain requirements -> lifestyle ranking.
 * Lifestyle scores may only reorder homes inside a status group; they never promote a home
 * that fails a mandatory requirement.
 */
export type RequirementStatus = 'exact' | 'confirm' | 'alternative';

export interface RequirementEvaluation {
  status: RequirementStatus;
  /** Mandatory requirements the home clearly fails. */
  mismatches: string[];
  /** Requirements the listing does not let us verify. */
  confirmations: string[];
  /** USD per month above the typed maximum (rentals inside the tolerance); 0 when within budget. */
  overBudgetUsd: number;
}

const GEORGIAN_DISTRICTS: Record<string, string> = {
  'ვაკე': 'vake',
  'საბურთალო': 'saburtalo',
  'ვერა': 'vera',
  'მთაწმინდა': 'mtatsminda',
  'დიღომი': 'digomi',
  'დიდი დიღომი': 'didi digomi',
  'ისანი': 'isani',
  'ორთაჭალა': 'ortachala',
  'ჩუღურეთი': 'chugureti',
  'გლდანი': 'gldani',
  'ნაძალადევი': 'nadzaladevi',
  'დიდუბე': 'didube',
  'სამგორი': 'samgori',
  'კრწანისი': 'krtsanisi',
  'ავლაბარი': 'avlabari',
  'სოლოლაკი': 'sololaki',
};

function normalizeDistrict(value: string | undefined | null): string {
  const raw = (value || '').trim().toLowerCase();
  if (!raw) return '';
  const georgian = GEORGIAN_DISTRICTS[raw];
  if (georgian) return georgian;
  return raw
    .replace(/dighomi/g, 'digomi')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Profile values such as "DidiDighomi" arrive without spaces; make them comparable. */
function normalizeProfileDistrict(value: string): string {
  return normalizeDistrict(value.replace(/([a-z])([A-Z])/g, '$1 $2'));
}

function insidePolygon(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi || Number.EPSILON) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function displayDistrict(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2');
}

type Check = 'pass' | 'fail' | 'unknown';

function checkLocation(apartment: HomeMatchApartment, profile: HomeMatchProfile): Check {
  if (profile.locationFlexible) return 'pass';
  const wanted = profile.districts
    .filter((district) => district !== 'SelectOnMap')
    .map(normalizeProfileDistrict)
    .filter(Boolean);
  const polygon = profile.selectedMapArea;
  if (!wanted.length && !polygon) return 'pass';

  const district = normalizeDistrict(apartment.district);
  if (district && wanted.includes(district)) return 'pass';

  if (polygon?.coordinates?.[0]?.length) {
    const lat = Number(apartment.propertyLatitude ?? apartment.latitude);
    const lng = Number(apartment.propertyLongitude ?? apartment.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      if (insidePolygon(lng, lat, polygon.coordinates[0])) return 'pass';
    } else if (!district) {
      return 'unknown';
    }
  }
  if (!district) {
    // Without a district, the address may still name the wanted area.
    const address = normalizeDistrict(apartment.address);
    if (address && wanted.some((item) => address.includes(item))) return 'pass';
    return polygon ? 'fail' : 'unknown';
  }
  return 'fail';
}

function checkBedrooms(apartment: HomeMatchApartment, profile: HomeMatchProfile): Check {
  const wanted = profile.bedrooms;
  // null = "Let AI decide", undefined = not asked (purchase flow may skip it).
  if (wanted === null || wanted === undefined || wanted <= 0) return 'pass';
  if (apartment.bedrooms === null || apartment.bedrooms === undefined) return 'unknown';
  return Number(apartment.bedrooms) >= wanted ? 'pass' : 'fail';
}

/** Roughly how many months the user intends to stay, for comparing against a listing's minimum lease. */
const REQUESTED_STAY_MONTHS: Record<string, number> = {
  ThreeToFiveMonths: 3,
  SixMonths: 6,
  TwelveMonths: 12,
  MoreThanTwelveMonths: 12,
};

/** The listing's own minimum lease term, parsed from "Minimum 6 months" / "Minimum 12 months". */
function listingMinimumMonths(apartment: HomeMatchApartment): number | null {
  const match = /(\d+)\s*month/i.exec(apartment.minimumRentalPeriod || '');
  return match ? Number(match[1]) : null;
}

/** "1 year", "2 years", "6 months" for the minimum-lease message. */
function leaseTermLabel(months: number): string {
  if (months % 12 === 0) return months === 12 ? '1 year' : `${months / 12} years`;
  return months === 1 ? '1 month' : `${months} months`;
}

function checkRentalDuration(apartment: HomeMatchApartment, profile: HomeMatchProfile): Check {
  if (profile.propertyGoal !== 'Rent') return 'pass';
  const minimum = listingMinimumMonths(apartment);
  if (minimum === null) return 'pass'; // listing has no stated minimum lease
  const requested = profile.rentalDuration ? REQUESTED_STAY_MONTHS[profile.rentalDuration] : undefined;
  if (requested === undefined) return 'unknown'; // "I do not know yet" or not answered
  return requested >= minimum ? 'pass' : 'fail';
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The date the user wants to move in by, or null when they have no fixed timing (Flexible/unanswered). */
function requestedMoveInDate(profile: HomeMatchProfile): string | null {
  switch (profile.moveInTiming) {
    case 'Immediately':
      return todayIso();
    case 'WithinOneWeek':
      return addDaysIso(7);
    case 'WithinOneMonth':
      return addDaysIso(30);
    case 'SpecificDate':
      return profile.moveInDate?.trim() || null;
    default:
      return null; // 'Flexible' or not answered: no availability constraint
  }
}

function checkAvailability(apartment: HomeMatchApartment, profile: HomeMatchProfile): Check {
  if (profile.propertyGoal !== 'Rent') return 'pass';
  const availableFrom = apartment.availableFrom?.trim();
  if (!availableFrom) return 'pass'; // no stated availability date: assumed available now
  const requested = requestedMoveInDate(profile);
  if (!requested) return 'unknown';
  // Both are ISO-ish date strings (yyyy-mm-dd...), so lexical comparison is also chronological.
  return availableFrom.slice(0, 10) <= requested ? 'pass' : 'fail';
}

/** Exchange rates used to compare a budget typed in GEL/EUR with listing prices (stored in USD). */
export interface BudgetRates {
  /** GEL per 1 USD */
  usdGel: number;
  /** EUR per 1 USD */
  usdEur: number;
}

export const DEFAULT_BUDGET_RATES: BudgetRates = { usdGel: 2.7, usdEur: 0.92 };

/**
 * Rental budget tolerance. Up to $1,000/month nothing above the maximum is recommended;
 * above $1,000, homes up to 25% over the maximum may be shown (as over-budget options).
 * Purchases never get a tolerance. The API applies the same rule (RentalBudgetPolicy).
 */
export const RENT_TOLERANCE_THRESHOLD_USD = 1000;
export const RENT_TOLERANCE_RATE = 0.25;

/** Highest price (USD) Velven Match may recommend for a maximum budget (USD). */
export function maxRecommendedPriceUsd(maxUsd: number, goal: HomeMatchProfile['propertyGoal']): number {
  // Cents precision, so a GEL budget converting to exactly $1,000 is not read as $1,000.0001.
  const max = Math.round(maxUsd * 100) / 100;
  if (goal !== 'Rent' || max <= RENT_TOLERANCE_THRESHOLD_USD) return max;
  return max * (1 + RENT_TOLERANCE_RATE);
}

/** Converts an amount in the profile's currency to USD. */
export function toUsd(amount: number, currency: string, rates: BudgetRates = DEFAULT_BUDGET_RATES): number {
  if (currency === 'GEL') return amount / (rates.usdGel || DEFAULT_BUDGET_RATES.usdGel);
  if (currency === 'EUR') return amount / (rates.usdEur || DEFAULT_BUDGET_RATES.usdEur);
  return amount;
}

/** Converts a USD amount to the profile's currency (for explanations shown to the user). */
export function fromUsd(amountUsd: number, currency: string, rates: BudgetRates = DEFAULT_BUDGET_RATES): number {
  if (currency === 'GEL') return amountUsd * (rates.usdGel || DEFAULT_BUDGET_RATES.usdGel);
  if (currency === 'EUR') return amountUsd * (rates.usdEur || DEFAULT_BUDGET_RATES.usdEur);
  return amountUsd;
}

export function formatBudgetAmount(amount: number, currency: string): string {
  const symbol = currency === 'GEL' ? '₾' : currency === 'EUR' ? '€' : '$';
  return `${symbol}${Math.round(amount).toLocaleString('en-US')}`;
}

/** The selected budget range in USD; a 0 / empty bound means "no limit". */
export function budgetRangeUsd(
  profile: HomeMatchProfile,
  rates: BudgetRates = DEFAULT_BUDGET_RATES,
): { min: number | null; max: number | null } {
  const min = Number(profile.budgetMin) > 0 ? toUsd(Number(profile.budgetMin), profile.currency, rates) : null;
  const max = Number(profile.budgetMax) > 0 ? toUsd(Number(profile.budgetMax), profile.currency, rates) : null;
  return { min, max };
}

/**
 * Hard budget filter: homes over the recommended ceiling (maxRecommendedPriceUsd) are not
 * shown at all. Homes below the minimum are kept but classified as alternatives.
 */
export function withinBudgetCeiling(
  priceUsd: number,
  profile: HomeMatchProfile,
  rates: BudgetRates = DEFAULT_BUDGET_RATES,
): boolean {
  const { max } = budgetRangeUsd(profile, rates);
  if (max === null || !priceUsd) return true;
  return priceUsd <= maxRecommendedPriceUsd(max, profile.propertyGoal) + 0.005;
}

/** Pets the user lives with. Older saved profiles only have petType/hasPet. */
export function selectedPets(profile: HomeMatchProfile): PetKind[] {
  if (profile.petTypes?.length) return [...new Set(profile.petTypes)];
  if (profile.petType && profile.petType !== 'None') return [profile.petType];
  return profile.hasPet ? ['Other'] : [];
}

export type PetPermission = 'allowed' | 'prohibited' | 'unconfirmed';

const NO_PETS =
  /pet[\s-]*friendly:\s*no\b|pets?(?:\s+allowed)?:\s*(?:no|not allowed)\b|\bno pets\b|pets? (?:are )?not (?:allowed|permitted)|without pets|შინაური ცხოველ\S*\s+(?:არ|აკრძალ)|ცხოველები\s+(?:არ|აკრძალ)|ცხოველების გარეშე|без (?:домашних )?животных|животны\S* (?:не допуска|запрещ)/i;
const NO_DOGS = /\bno dogs\b|dogs? (?:are )?not (?:allowed|permitted)|ძაღლ\S*\s+(?:არ|აკრძალ)|без собак|собаки? запрещ/i;
const NO_CATS = /\bno cats\b|cats? (?:are )?not (?:allowed|permitted)|კატ\S*\s+(?:არ|აკრძალ)|без кош/i;
const SMALL_DOGS_ONLY = /small (?:dogs?|pets?) only|only small (?:dogs?|pets?)|მხოლოდ პატარა|только (?:маленьк|мелк)/i;
const NO_LARGE_DOGS = /no (?:large|big) dogs|large dogs? (?:are )?not (?:allowed|permitted)|без крупных собак/i;
const PETS_ALLOWED =
  /pet[\s-]*friendly:\s*yes\b|pets? (?:are )?(?:allowed|welcome|permitted)|შინაური ცხოველ\S*\s+(?:დასაშვებ|ნებადართ)|можно с (?:домашними )?животными/i;

/**
 * Whether this listing lets the user's pets in. 'prohibited' only when the listing says so;
 * an unticked "Pet friendly" box is not a prohibition, just unconfirmed.
 */
export function petPermission(apartment: HomeMatchApartment, pets: PetKind[], dogSize?: DogSize): PetPermission {
  if (!pets.length) return 'allowed';
  const text = `${apartment.title || ''} ${apartment.description || ''}`;
  if (NO_PETS.test(text)) return 'prohibited';
  if (pets.includes('Dog')) {
    if (NO_DOGS.test(text)) return 'prohibited';
    if (dogSize && dogSize !== 'Small' && SMALL_DOGS_ONLY.test(text)) return 'prohibited';
    if (dogSize === 'Large' && NO_LARGE_DOGS.test(text)) return 'prohibited';
  }
  if (pets.includes('Cat') && NO_CATS.test(text)) return 'prohibited';
  return apartment.isPetFriendly === true || PETS_ALLOWED.test(text) ? 'allowed' : 'unconfirmed';
}

/** Hard filter: a rental that says the user's pets are not allowed is never recommended. */
export function petsExplicitlyProhibited(apartment: HomeMatchApartment, profile: HomeMatchProfile): boolean {
  return (
    profile.propertyGoal === 'Rent' &&
    petPermission(apartment, selectedPets(profile), profile.dogSize) === 'prohibited'
  );
}

/** "dog", "dog and cat", "dog, cat and pet" for explanations. */
export function petListLabel(pets: PetKind[]): string {
  const names = pets.map((pet) => (pet === 'Dog' ? 'dog' : pet === 'Cat' ? 'cat' : 'pet'));
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0] || 'pet';
}

export function evaluateMandatoryRequirements(
  apartment: HomeMatchApartment,
  profile: HomeMatchProfile,
  rates: BudgetRates = DEFAULT_BUDGET_RATES,
): RequirementEvaluation {
  const mismatches: string[] = [];
  const confirmations: string[] = [];

  const location = checkLocation(apartment, profile);
  if (location === 'fail') {
    const wanted = profile.districts
      .filter((district) => district !== 'SelectOnMap')
      .map(displayDistrict)
      .join(', ');
    const actual = apartment.district ? displayDistrict(apartment.district) : 'another area';
    mismatches.push(
      wanted ? `Location: ${actual}, not ${wanted}` : `Location: ${actual}, outside your selected map area`,
    );
  } else if (location === 'unknown') {
    confirmations.push('Location could not be verified');
  }

  const bedrooms = checkBedrooms(apartment, profile);
  if (bedrooms === 'fail') {
    mismatches.push(`Bedrooms: ${apartment.bedrooms}, you need ${profile.bedrooms}${profile.bedrooms! >= 4 ? '+' : ''}`);
  } else if (bedrooms === 'unknown') {
    confirmations.push('Number of bedrooms is not specified in the listing');
  }

  const rentalDuration = checkRentalDuration(apartment, profile);
  if (rentalDuration === 'fail') {
    mismatches.push(
      `Lease: this listing requires a minimum ${listingMinimumMonths(apartment)}-month stay`,
    );
  } else if (rentalDuration === 'unknown') {
    confirmations.push(`This listing has a minimum lease term: ${leaseTermLabel(listingMinimumMonths(apartment)!)}`);
  }

  const availability = checkAvailability(apartment, profile);
  if (availability === 'fail') {
    mismatches.push(
      `Availability: not free until ${apartment.availableFrom!.slice(0, 10)}, after your move-in date`,
    );
  } else if (availability === 'unknown') {
    confirmations.push('Confirm this listing is available by your move-in date');
  }

  // Budget, compared in USD whatever currency the user typed it in.
  const price = Number(apartment.price);
  const budget = budgetRangeUsd(profile, rates);
  const money = (usd: number) => formatBudgetAmount(fromUsd(usd, profile.currency, rates), profile.currency);
  let overBudgetUsd = 0;
  if (price > 0 && budget.min !== null && price < budget.min) {
    mismatches.push(
      `Budget: ${money(price)} is below your minimum of ${formatBudgetAmount(Number(profile.budgetMin), profile.currency)}`,
    );
  } else if (price > 0 && budget.max !== null && price > budget.max + 0.005) {
    const maximum = formatBudgetAmount(Number(profile.budgetMax), profile.currency);
    if (price <= maxRecommendedPriceUsd(budget.max, profile.propertyGoal) + 0.005) {
      // Inside the rental tolerance: shown, but never as "within your budget" or a top match.
      overBudgetUsd = price - budget.max;
      confirmations.push(`Budget: ${money(overBudgetUsd)}/month above your maximum of ${maximum}`);
    } else {
      mismatches.push(`Budget: ${money(price)} is above your maximum of ${maximum}`);
    }
  }

  // Pets: a listing that prohibits the user's pets fails; an unconfirmed one needs checking.
  const pets = profile.propertyGoal === 'Rent' ? selectedPets(profile) : [];
  const permission = petPermission(apartment, pets, profile.dogSize);
  if (permission === 'prohibited') {
    mismatches.push(`Pets: this listing does not allow your ${petListLabel(pets)}`);
  } else if (permission === 'unconfirmed') {
    confirmations.push(
      `Pets: the listing does not confirm that your ${petListLabel(pets)} ${pets.length > 1 ? 'are' : 'is'} allowed — check with the agent`,
    );
  }

  const status: RequirementStatus = mismatches.length ? 'alternative' : confirmations.length ? 'confirm' : 'exact';
  return { status, mismatches, confirmations, overBudgetUsd };
}
