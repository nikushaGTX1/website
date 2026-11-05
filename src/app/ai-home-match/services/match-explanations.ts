import type { HomeMatchApartment } from '../models/home-match-result';
import type { HomeMatchProfile } from '../models/home-match-profile';
import { answerLabel } from './answer-labels';
import {
  budgetRangeUsd,
  formatBudgetAmount,
  fromUsd,
  petListLabel,
  petPermission,
  selectedPets,
  type BudgetRates,
  type RequirementEvaluation,
} from './mandatory-requirements';
import { parkingScore, scorePriority } from './priority-scoring';
import { parseParkingCost } from '../../utils/parking-cost';
import { listedUniversityMinutes } from '../../utils/universities';

export interface LifestyleInsight {
  title: string;
  reason: string;
  icon: string;
  /** Optional short value shown as a badge, e.g. "5 min". */
  meta?: string;
}

const MATCH_WALK_LIMIT = 18;

export function petsConfirmed(apartment: HomeMatchApartment, profile: HomeMatchProfile): boolean {
  const pets = selectedPets(profile);
  return (
    profile.propertyGoal === 'Rent' &&
    pets.length > 0 &&
    petPermission(apartment, pets, profile.dogSize) === 'allowed'
  );
}

export function explainHomeMatch(
  apartment: HomeMatchApartment,
  p: HomeMatchProfile,
  rates: BudgetRates,
  requirement: RequirementEvaluation,
): LifestyleInsight[] {
  const rent = p.propertyGoal !== 'Buy';
  const mismatch = (prefix: string) =>
    (requirement.mismatches || []).some((note) => note.startsWith(prefix));
  const items: LifestyleInsight[] = [];
  const add = (title: string, reason: string, icon: string) =>
    items.push({ title, reason, icon });

  const districts = p.districts.filter((d) => d !== 'SelectOnMap');
  const unverified = (prefix: string) =>
    (requirement.confirmations || []).some((note) => note.startsWith(prefix));
  // Only claim a location match when the location was actually verified inside the selected area.
  if (
    (districts.length || p.selectedMapArea) &&
    !p.locationFlexible &&
    !mismatch('Location') &&
    !unverified('Location')
  ) {
    add('Location matches', apartment.district || apartment.address || '', 'fa-location-dot');
  }
  // Budget in the user's own currency, checked against both bounds.
  const budget = budgetRangeUsd(p, rates);
  const price = Number(apartment.price);
  if (
    budget.max !== null &&
    price > 0 &&
    price <= budget.max &&
    (budget.min === null || price >= budget.min)
  ) {
    const shown = formatBudgetAmount(fromUsd(price, p.currency, rates), p.currency);
    const range =
      budget.min !== null
        ? `${formatBudgetAmount(p.budgetMin, p.currency)}–${formatBudgetAmount(p.budgetMax, p.currency)}`
        : `≤ ${formatBudgetAmount(p.budgetMax, p.currency)}`;
    add('Within your budget', `${shown} · ${range}`, 'fa-wallet');
  }
  // Over-budget rentals (inside the tolerance) say how much more they cost each month.
  const overUsd = requirement.overBudgetUsd ?? 0;
  if (overUsd > 0) {
    const extra = formatBudgetAmount(
      fromUsd(overUsd, p.currency, rates),
      p.currency,
    );
    add(
      'Above your budget',
      `+${extra}/month over ${formatBudgetAmount(p.budgetMax, p.currency)}`,
      'fa-arrow-trend-up',
    );
  }
  if (
    p.bedrooms != null &&
    p.bedrooms > 0 &&
    apartment.bedrooms != null &&
    apartment.bedrooms >= p.bedrooms
  ) {
    add('Enough bedrooms', `${apartment.bedrooms} ≥ ${p.bedrooms}`, 'fa-bed');
  }
  if (rent && p.moveInTiming && !mismatch('Availability')) {
    add('Ready for your move-in', answerLabel(p.moveInTiming), 'fa-calendar-check');
  }
  if (rent && p.rentalDuration && !mismatch('Lease')) {
    add('Fits your rental period', answerLabel(p.rentalDuration), 'fa-hourglass-half');
  }
  if (rent && petsConfirmed(apartment, p))
    add('Pet-friendly home', petListLabel(selectedPets(p)), 'fa-paw');
  const priorities = new Set(p.topPriorities.slice(0, 5));
  // One parking card, whether parking came from driving or from the priority list.
  if (
    (p.transportation.includes('Car') || priorities.has('Parking')) &&
    (apartment.hasParking || parkingScore(apartment) > 0)
  ) {
    add(
      'Parking for your car',
      parseParkingCost(apartment.description || '').cost === 'Paid'
        ? 'Paid parking'
        : 'Parking available',
      'fa-square-parking',
    );
  }
  if (
    (priorities.has('QuietStreet') || p.lifestyles.includes('QuietLifestyle')) &&
    // The API has no quiet-street field; the upload form writes "Quiet street: Yes" in the details.
    (apartment.isQuietStreet || /Quiet street:\s*yes/i.test(apartment.description || ''))
  ) {
    add('Quiet street', 'Matches your quiet lifestyle', 'fa-volume-xmark');
  }
  if (
    priorities.has('SelectedLocationNearby') &&
    scorePriority('SelectedLocationNearby', apartment, p) >= 2
  ) {
    add('Near the place you chose', 'Close to your chosen location', 'fa-location-crosshairs');
  }

  // Nearby places: shown here only when they answer something the user chose, with the
  // reason tied to that answer. Everything else nearby stays in "Walking times" only.
  for (const place of preferencePlaces(apartment, p)) {
    const minutes =
      place.field === 'universityDistanceMinutes'
        ? listedUniversityMinutes(apartment)
        : apartment[place.field];
    if (typeof minutes !== 'number' || minutes < 0 || minutes > MATCH_WALK_LIMIT) continue;
    items.push({
      title: place.title,
      reason: place.reason,
      icon: place.icon,
      meta: `${Math.round(minutes)} min`,
    });
  }
  return items;
}

/**
 * Which nearby places matter to this user, and why. Each entry comes from a questionnaire
 * answer (lifestyle, household, pet, transport) or a chosen top-5 priority; the first
 * matching reason wins, so a place is never listed twice.
 */
function preferencePlaces(apartment: HomeMatchApartment, p: HomeMatchProfile): Array<{
  field: keyof HomeMatchApartment;
  title: string;
  reason: string;
  icon: string;
}> {
  const priorities = new Set(p.topPriorities.slice(0, 5));
  const lifestyles = new Set(p.lifestyles);
  const ages = new Set(p.children > 0 ? p.childrenAgeGroups : []);
  const hasKids = p.children > 0;
  // Dog-walking benefits only for homes that actually allow pets.
  const dog = selectedPets(p).includes('Dog') && petsConfirmed(apartment, p);
  const walks = p.transportation.includes('Walking');
  const places: Array<{
    field: keyof HomeMatchApartment;
    title: string;
    reason: string;
    icon: string;
  }> = [];
  const offer = (
    field: keyof HomeMatchApartment,
    title: string,
    icon: string,
    reasons: Array<[boolean, string]>,
  ) => {
    const reason = reasons.find(([applies]) => applies)?.[1];
    if (reason) places.push({ field, title, icon, reason });
  };

  offer('gymDistanceMinutes', 'Gym', 'fa-dumbbell', [
    [lifestyles.has('Athlete'), 'Matches your active lifestyle'],
    [priorities.has('GymNearby'), 'One of your top priorities'],
  ]);
  offer('parkDistanceMinutes', 'Park', 'fa-tree', [
    [dog, 'Great for walking your dog'],
    [
      hasKids &&
        (priorities.has('PlaygroundNearby') || priorities.has('PlaygroundOrSportsFieldNearby')),
      'Playground and outdoor space for your children',
    ],
    [lifestyles.has('Athlete'), 'Matches your outdoor lifestyle'],
    [priorities.has('ParkNearby'), 'One of your top priorities'],
    [lifestyles.has('QuietLifestyle'), 'Green space for a calm routine'],
  ]);
  offer('schoolDistanceMinutes', 'School', 'fa-school', [
    [
      hasKids &&
        (ages.has('Age7To12') || ages.has('Age13To17') || priorities.has('SchoolNearby')),
      'Close for your children',
    ],
    [priorities.has('SchoolNearby'), 'One of your top priorities'],
  ]);
  offer('kindergartenDistanceMinutes', 'Kindergarten', 'fa-children', [
    [
      hasKids &&
        (ages.has('Age0To3') || ages.has('Age4To6') || priorities.has('KindergartenNearby')),
      'Close for your little ones',
    ],
    [priorities.has('KindergartenNearby'), 'One of your top priorities'],
  ]);
  offer('universityDistanceMinutes', 'University', 'fa-graduation-cap', [
    [lifestyles.has('Student'), 'Handy for your studies'],
    [priorities.has('UniversityNearby'), 'One of your top priorities'],
  ]);
  const everyday =
    priorities.has('EverydayServicesNearby') ||
    priorities.has('SupermarketNearby') ||
    priorities.has('PharmacyNearby');
  offer('groceryDistanceMinutes', 'Supermarket', 'fa-basket-shopping', [
    [everyday, 'Everyday shopping on foot'],
    [walks, 'Everyday shopping on foot'],
  ]);
  offer('pharmacyDistanceMinutes', 'Pharmacy', 'fa-prescription-bottle-medical', [
    [everyday || priorities.has('ClinicNearby'), 'Everyday services close by'],
  ]);
  offer('metroDistanceMinutes', 'Metro', 'fa-train-subway', [
    [p.transportation.includes('Metro'), 'Metro is part of your routine'],
    [
      priorities.has('MetroNearby') || priorities.has('PublicTransportNearby'),
      'One of your top priorities',
    ],
  ]);
  offer('cafeDistanceMinutes', 'Café', 'fa-mug-hot', [
    [
      lifestyles.has('RemoteWorker') || priorities.has('CafesOrCoworkingNearby'),
      'Good for working remotely',
    ],
    [
      lifestyles.has('SocialLifestyle') ||
        priorities.has('CafesAndRestaurantsNearby') ||
        priorities.has('CafesNearby'),
      'Matches your social lifestyle',
    ],
    [
      lifestyles.has('BusinessProfessional') || priorities.has('MeetingPlacesNearby'),
      'Handy for meetings',
    ],
    [lifestyles.has('Student') || priorities.has('StudySpacesNearby'), 'A place to study nearby'],
  ]);
  offer('evChargerDistanceMinutes', 'EV charger', 'fa-charging-station', [
    [p.transportation.includes('Car') && p.carFuelType === 'Electric', 'For your electric car'],
  ]);
  // Pet services for anyone living with pets (whatever the listing's pet policy says).
  const pets = selectedPets(p);
  offer('petStoreDistanceMinutes', 'Pet shop', 'fa-paw', [
    [pets.length > 0, `Supplies for your ${petListLabel(pets)}`],
  ]);
  offer('veterinaryDistanceMinutes', 'Vet clinic', 'fa-stethoscope', [
    [pets.length > 0, `Care for your ${petListLabel(pets)}`],
  ]);
  return places;
}
