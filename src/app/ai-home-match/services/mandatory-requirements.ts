import { DogSize, HomeMatchProfile, PetKind } from '../models/home-match-profile';
import { listingHomeType, wantedHomeTypes } from '../../utils/listing-home-type';
import { HomeMatchApartment } from '../models/home-match-result';
import { answerLabel, selectedBedrooms } from './answer-labels';

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
  'ვაშლიჯვარი': 'vashlijvari',
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
  const wanted = selectedBedrooms(profile);
  // Empty = "Let AI decide" or not asked (purchase flow may skip it).
  if (!wanted.length) return 'pass';
  if (apartment.bedrooms === null || apartment.bedrooms === undefined) return 'unknown';
  const count = Number(apartment.bedrooms);
  // One choice keeps the old "this many or more"; several choices mean one of those counts.
  if (wanted.length === 1) return wanted[0] <= 0 || count >= wanted[0] ? 'pass' : 'fail';
  return wanted.some((choice) => (choice >= 4 ? count >= 4 : count === choice)) ? 'pass' : 'fail';
}

/** "2", "4+", or "1/2/4+" for mismatch messages. */
function wantedBedroomsText(profile: HomeMatchProfile): string {
  const wanted = selectedBedrooms(profile);
  if (wanted.length === 1) return `${wanted[0]}${wanted[0] >= 4 ? '+' : ''}`;
  return wanted.map((choice) => (choice >= 4 ? '4+' : String(choice))).join('/');
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

/** Days a home may still be occupied and count as available "immediately". Same in the API. */
export const IMMEDIATE_MOVE_IN_GRACE_DAYS = 7;

/** The date the user wants to move in by, or null when they have no fixed timing (Flexible/unanswered). */
function requestedMoveInDate(profile: HomeMatchProfile): string | null {
  switch (profile.moveInTiming) {
    case 'Immediately':
      // "Immediately" still fits a home that is free within the next week.
      return addDaysIso(IMMEDIATE_MOVE_IN_GRACE_DAYS);
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

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  იანვ: 1, თებერვ: 2, მარტ: 3, აპრილ: 4, მაის: 5, ივნის: 6, ივლის: 7, აგვისტ: 8, სექტემბ: 9, ოქტომბ: 10, ნოემბ: 11, დეკემბ: 12,
};

/**
 * When the home is free (yyyy-mm-dd): the listing's date field, else the upload form's
 * "Available from:" tag, else a date written in the description ("free from 18 December",
 * "18 დეკემბრიდან"). Null when nothing says, which counts as available now.
 */
export function listingAvailableFrom(apartment: HomeMatchApartment): string | null {
  const field = apartment.availableFrom?.trim();
  if (field) return field.slice(0, 10);
  const text = `${apartment.description || ''}`;
  const tag = text.match(/(?:^|[|\r\n])\s*Available from:\s*(\d{4}-\d{2}-\d{2})/i)?.[1];
  if (tag) return tag;
  const written =
    text.match(/(?:available|free|vacant)\s+(?:from|after|since)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]+)/i) ||
    text.match(/(\d{1,2})\s+(იანვ|თებერვ|მარტ|აპრილ|მაის|ივნის|ივლის|აგვისტ|სექტემბ|ოქტომბ|ნოემბ|დეკემბ)\S*\s*(?:დან|-დან)/);
  if (!written) return null;
  const day = Number(written[1]);
  const key = Object.keys(MONTHS).find((name) => written[2].toLowerCase().startsWith(name));
  if (!key || day < 1 || day > 31) return null;
  const month = MONTHS[key];
  const now = new Date();
  // A month already past this year means next year.
  const year = month < now.getMonth() + 1 ? now.getFullYear() + 1 : now.getFullYear();
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "18 December" for labels. */
export function availableFromLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  return Number.isNaN(date.getTime()) ? isoDate : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

/** Not free by the client's move-in date: shown after homes that are, the soonest first. */
export function availabilityRank(apartment: HomeMatchApartment, profile: HomeMatchProfile): number {
  if (checkAvailability(apartment, profile) !== 'fail') return 0;
  const from = listingAvailableFrom(apartment);
  return from ? new Date(`${from}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
}

function checkAvailability(apartment: HomeMatchApartment, profile: HomeMatchProfile): Check {
  if (profile.propertyGoal !== 'Rent') return 'pass';
  if (profile.moveInTiming === 'Flexible') return 'pass';
  const availableFrom = listingAvailableFrom(apartment);
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
  const conversion = profile.budgetConversion;
  if (conversion && conversion.currency === profile.currency && conversion.min === profile.budgetMin &&
      conversion.max === profile.budgetMax && conversion.usdGel > 0 && conversion.usdEur > 0) rates = conversion;
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

/** Confirmed pet-friendly rentals come before listings whose pet policy needs checking. */
/**
 * One order for Velven Match results and Velven Discover, so both list the same homes in
 * the same sequence: fully matching homes first, then ones with a detail to confirm; inside
 * each group, homes whose pet policy is unconfirmed go last; then the best lifestyle fit.
 */
export function compareMatchOrder(
  a: { status?: RequirementStatus; apartment: HomeMatchApartment; score: number },
  b: { status?: RequirementStatus; apartment: HomeMatchApartment; score: number },
  profile: HomeMatchProfile,
): number {
  const group = (status?: RequirementStatus) => (status === 'confirm' ? 1 : status === 'alternative' ? 2 : 0);
  return (
    group(a.status) - group(b.status) ||
    locationRank(a.apartment, profile) - locationRank(b.apartment, profile) ||
    petConfirmationRank(a.apartment, profile) - petConfirmationRank(b.apartment, profile) ||
    availabilityRank(a.apartment, profile) - availabilityRank(b.apartment, profile) ||
    b.score - a.score
  );
}

/**
 * Location is the first priority: homes in the districts (or map area) the client chose come
 * before ones whose area is unknown, then everything else. Also applies with a flexible location.
 */
export function locationRank(apartment: HomeMatchApartment, profile: HomeMatchProfile): number {
  const check = checkLocation(apartment, { ...profile, locationFlexible: false });
  if (check === 'pass') return 0;
  if (check === 'unknown') return 1;
  // Outside the chosen districts: the closer to them, the higher (Didube first, then
  // Saburtalo before Lisi), not in an arbitrary order.
  const km = distanceToChosenDistricts(apartment, profile);
  return 2 + (km === undefined ? 0.99 : Math.min(km, 98) / 100);
}

/** Approximate centres of Tbilisi districts (lat, lng). */
const DISTRICT_CENTRES: Record<string, [number, number]> = {
  vake: [41.7105, 44.7585], saburtalo: [41.7275, 44.7524], vera: [41.7085, 44.7765], mtatsminda: [41.6955, 44.7895],
  bagebi: [41.7025, 44.7385], digomi: [41.7615, 44.7525], 'didi digomi': [41.7845, 44.7535], didube: [41.7445, 44.7795],
  chugureti: [41.7245, 44.8015], avlabari: [41.6935, 44.8135], isani: [41.6905, 44.8315], gldani: [41.7905, 44.8125],
  nadzaladevi: [41.7535, 44.7935], krtsanisi: [41.6735, 44.8055], vashlijvari: [41.7315, 44.7395], sololaki: [41.6915, 44.7985],
  samgori: [41.6925, 44.8645], ortachala: [41.6815, 44.8215], lisi: [41.7395, 44.7215], nutsubidze: [41.7215, 44.7305],
};

function distanceToChosenDistricts(apartment: HomeMatchApartment, profile: HomeMatchProfile): number | undefined {
  const lat = Number(apartment.propertyLatitude ?? apartment.latitude);
  const lng = Number(apartment.propertyLongitude ?? apartment.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (!lat && !lng)) return undefined;
  const centres = profile.districts
    .filter((d) => d !== 'SelectOnMap')
    .map((d) => DISTRICT_CENTRES[normalizeProfileDistrict(d).replace(/dighomi/g, 'digomi')] || DISTRICT_CENTRES[d.toLowerCase()])
    .filter((c): c is [number, number] => !!c);
  if (!centres.length) return undefined;
  const rad = (d: number) => (d * Math.PI) / 180;
  return Math.min(...centres.map(([cLat, cLng]) => {
    const h = Math.sin(rad(cLat - lat) / 2) ** 2 + Math.cos(rad(lat)) * Math.cos(rad(cLat)) * Math.sin(rad(cLng - lng) / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }));
}

export function petConfirmationRank(apartment: HomeMatchApartment, profile: HomeMatchProfile): number {
  return profile.propertyGoal === 'Rent' &&
    petPermission(apartment, selectedPets(profile), profile.dogSize) === 'unconfirmed' ? 1 : 0;
}

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
  const saysAllowed = apartment.isPetFriendly === true || PETS_ALLOWED.test(text);
  // An unticked "Pet friendly" box is shown on the listing as "Pets: No", so it is a "no".
  if (apartment.isPetFriendly === false && !saysAllowed) return 'prohibited';
  if (!saysAllowed) return 'unconfirmed';
  // The agent says which pets and sizes are welcome ("Pets allowed: Dog, Cat | Pet sizes: Small").
  const kinds = listTag(text, 'Pets allowed');
  const sizes = listTag(text, 'Pet sizes');
  if (kinds.length && pets.some((pet) => (pet === 'Dog' || pet === 'Cat') && !kinds.includes(pet))) return 'prohibited';
  if (pets.includes('Dog') && dogSize) {
    if (sizes.length && !sizes.includes(dogSize)) return 'prohibited';
    // Pet friendly, but the dog size accepted is not stated: ask the agent, list it last.
    if (!sizes.length) return 'unconfirmed';
  }
  if (pets.includes('Other') && !kinds.length) return 'unconfirmed';
  return 'allowed';
}

/** "Pets allowed: Dog, Cat" style tag from the upload form, as a list. */
function listTag(text: string, name: string): string[] {
  const match = text.match(new RegExp('(?:^|[|\\r\\n])\\s*' + name + ':\\s*([^|\\r\\n]+)', 'i'));
  return (match?.[1] || '').split(',').map((item) => item.trim()).filter(Boolean)
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1).toLowerCase());
}

/** Hard filter: the listing's deal type ("Deal: For Rent" tag, else its text) must fit Rent / Buy. */
export function matchesPropertyGoal(
  apartment: Pick<HomeMatchApartment, 'title' | 'description'>,
  profile: Pick<HomeMatchProfile, 'propertyGoal'>,
): boolean {
  const deal = (apartment.description || '').match(/(?:^|[|\r\n])\s*(?:Deal|Listing type):\s*([^|\r\n]+)/i)?.[1];
  const text = deal || apartment.title || '';
  return profile.propertyGoal === 'Buy'
    ? /sale|buy|იყიდება|продаж/i.test(text)
    : /rent|lease|ქირავდება|аренд/i.test(text);
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
  const cityName = (value: string) => /^(tbilisi|თბილისი|тбилиси)$/i.test(value.trim()) ? 'tbilisi' : value.trim().toLowerCase();
  if (apartment.city && cityName(apartment.city) !== cityName(profile.city || 'Tbilisi'))
    mismatches.push('The apartment is in another city.');
  if (profile.minSize && (apartment.sizeSquareMeters || 0) < profile.minSize)
    mismatches.push('Apartment area is below your minimum.');
  if (profile.maxSize && (apartment.sizeSquareMeters || 0) > profile.maxSize)
    mismatches.push('Apartment area is above your maximum.');
  if (apartment.maxOccupants != null && apartment.maxOccupants < profile.adults + profile.children)
    mismatches.push('The apartment does not allow enough residents.');
  if (profile.propertyGoal === 'Buy' && profile.propertyConditions?.length && !profile.propertyConditions.includes('Any')) {
    const condition = (apartment.description || '').match(/(?:^|[|\r\n])\s*Condition:\s*([^|\r\n]+)/i)?.[1]?.trim().replace(/\.$/, '').toLowerCase();
    const conditions: Record<string, string[]> = {
      MoveInReady: ['newly renovated', 'old renovated'], Renovated: ['newly renovated', 'old renovated'],
      NewlyRenovated: ['newly renovated'], OldRenovated: ['old renovated'],
      // The buyer option is "white/green frame".
      WhiteFrame: ['white frame', 'white plus', 'green frame'], BlackFrame: ['black frame'], GreenFrame: ['green frame'], NeedsRenovation: ['current renovation', 'repairing'],
    };
    if (!condition || !profile.propertyConditions.some(code => conditions[code]?.includes(condition)))
      mismatches.push('The apartment condition does not meet your requirement.');
  }

  if (profile.propertyGoal === 'Buy' && profile.buildingTypes?.length && !profile.buildingTypes.includes('Any')) {
    const status = (apartment.description || '').match(/(?:^|[|\r\n])\s*Status:\s*([^|\r\n]+)/i)?.[1]?.trim().replace(/\.$/, '').toLowerCase();
    const statuses: Record<string, string> = { NewBuilding: 'new building', UnderConstruction: 'under construction', OldBuilding: 'old building' };
    if (!status) confirmations.push('Building type is not specified in the listing');
    else if (!profile.buildingTypes.some((code) => statuses[code] === status))
      mismatches.push('The building type does not meet your requirement.');
  }

  // Type of home (follow-up to Rent/Buy): a private house never matches "apartment", and back.
  const homeType = listingHomeType(apartment);
  const wantedTypes = wantedHomeTypes(profile);
  if (homeType && !(wantedTypes as string[]).includes(homeType))
    mismatches.push(wantedTypes.length === 1 && wantedTypes[0] === 'House' ? 'Property type: this is not a private house' : 'Property type: this is not an apartment');

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
    mismatches.push(`Bedrooms: ${apartment.bedrooms}, you need ${wantedBedroomsText(profile)}`);
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
    confirmations.push(`Available from ${availableFromLabel(listingAvailableFrom(apartment)!)}`);
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
