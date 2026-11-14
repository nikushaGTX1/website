import type { HomeMatchApartment } from '../models/home-match-result';
import type { HomeMatchProfile } from '../models/home-match-profile';
import { normalizeApartmentStyle } from '../../utils/apartment-style';
import { answerLabel } from './answer-labels';
import {
  petListLabel,
  petPermission,
  selectedPets,
  type BudgetRates,
  type RequirementEvaluation,
} from './mandatory-requirements';
import { parkingScore, scorePriority, hasWorkspace, officeDistanceKm, officeDistancePoints } from './priority-scoring';
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

/**
 * "Why it fits": only things tailored to the user, in this order:
 * pets (when they have one), their top-5 priorities in rank order, their lifestyle answers,
 * then other answers (car, children, style). Budget and location are hard filters, so every
 * result already meets them and they are not listed. Cards show the first 3.
 */
export function explainHomeMatch(
  apartment: HomeMatchApartment,
  p: HomeMatchProfile,
  _rates?: BudgetRates,
  _requirement?: RequirementEvaluation,
): LifestyleInsight[] {
  const items: LifestyleInsight[] = [];
  const seen = new Set<string>();
  const push = (item: LifestyleInsight | undefined) => {
    if (item && !seen.has(item.title)) {
      seen.add(item.title);
      items.push(item);
    }
  };
  const rent = p.propertyGoal !== 'Buy';
  const near = (field: keyof HomeMatchApartment, title: string, reason: string, icon: string): LifestyleInsight | undefined => {
    const value = field === 'universityDistanceMinutes' ? listedUniversityMinutes(apartment) : apartment[field];
    if (typeof value !== 'number' || value < 0 || value > MATCH_WALK_LIMIT) return undefined;
    return { title, reason, icon, meta: `${Math.round(value)} min` };
  };
  const parking = (reason: string): LifestyleInsight | undefined =>
    apartment.hasParking || parkingScore(apartment) > 0
      ? {
          title: 'Parking for your car',
          reason: parseParkingCost(apartment.description || '').cost === 'Paid' ? 'Paid parking' : reason,
          icon: 'fa-square-parking',
        }
      : undefined;
  const quiet = (reason: string): LifestyleInsight | undefined =>
    apartment.isQuietStreet || /Quiet street:\s*yes/i.test(apartment.description || '')
      ? { title: 'Quiet street', reason, icon: 'fa-volume-xmark' }
      : undefined;
  const workspace = (title: string, icon: string): LifestyleInsight | undefined =>
    hasWorkspace(apartment, p)
      ? { title, reason: apartment.hasHomeOfficeSpace ? 'Home office space' : 'A spare room you can use as an office', icon }
      : undefined;

  // 1. Pets: only for people who live with one.
  if (rent && petsConfirmed(apartment, p)) {
    push({ title: 'Pet-friendly home', reason: petListLabel(selectedPets(p)), icon: 'fa-paw' });
    if (selectedPets(p).includes('Dog')) push(near('parkDistanceMinutes', 'Park', 'Great for walking your dog', 'fa-tree'));
  }

  // 2. Top-5 priorities, #1 first.
  const top = 'One of your top priorities';
  const features: Record<string, [string, string]> = {
    BalconyOrTerrace: ['Balcony or terrace', 'fa-umbrella-beach'],
    MultipleBathrooms: ['More than one bathroom', 'fa-bath'],
    SecurityOrConcierge: ['Security or concierge', 'fa-shield-halved'],
    ModernMaintainedBuilding: ['Modern, well-kept building', 'fa-building'],
    IsolatedBedrooms: ['Separate bedrooms', 'fa-door-closed'],
    AwayFromNightlife: ['Away from nightlife', 'fa-moon'],
    CompanyLeaseAvailable: ['Company lease available', 'fa-file-signature'],
  };
  for (const code of p.topPriorities.slice(0, 5)) {
    switch (code) {
      case 'Parking': push(parking('Parking available')); break;
      case 'QuietStreet': push(quiet(top)); break;
      case 'Workspace': push(workspace('Room to work from home', 'fa-laptop')); break;
      case 'ParkNearby':
      case 'PlaygroundNearby':
      case 'PlaygroundOrSportsFieldNearby': push(near('parkDistanceMinutes', 'Park', top, 'fa-tree')); break;
      case 'GymNearby': push(near('gymDistanceMinutes', 'Gym', top, 'fa-dumbbell')); break;
      case 'MetroNearby':
      case 'PublicTransportNearby': push(near('metroDistanceMinutes', 'Metro', top, 'fa-train-subway')); break;
      case 'SchoolNearby': push(near('schoolDistanceMinutes', 'School', top, 'fa-school')); break;
      case 'KindergartenNearby': push(near('kindergartenDistanceMinutes', 'Kindergarten', top, 'fa-children')); break;
      case 'UniversityNearby': push(near('universityDistanceMinutes', 'University', top, 'fa-graduation-cap')); break;
      case 'CafesNearby':
      case 'CafesAndRestaurantsNearby':
      case 'CafesOrCoworkingNearby':
      case 'MeetingPlacesNearby':
      case 'StudySpacesNearby': push(near('cafeDistanceMinutes', 'Café', top, 'fa-mug-hot')); break;
      case 'EverydayServicesNearby':
      case 'SupermarketNearby': push(near('groceryDistanceMinutes', 'Supermarket', top, 'fa-basket-shopping')); break;
      case 'PharmacyNearby':
      case 'ClinicNearby': push(near('pharmacyDistanceMinutes', 'Pharmacy', top, 'fa-prescription-bottle-medical')); break;
      case 'OfficeNearby': {
        const km = officeDistanceKm(apartment, p);
        if (km !== undefined && officeDistancePoints(km) > 0) push({ title: 'Close to your office', reason: top, icon: 'fa-building', meta: `${km.toFixed(1)} km` });
        break;
      }
      case 'CityCenterNearby':
      case 'EntertainmentNearby':
        if (scorePriority(code, apartment, p) >= 2) push({ title: 'Close to the city centre', reason: top, icon: 'fa-city' });
        break;
      case 'SelectedLocationNearby':
        if (scorePriority(code, apartment, p) >= 2) push({ title: 'Near the place you chose', reason: 'Close to your chosen location', icon: 'fa-location-crosshairs' });
        break;
      default:
        if (features[code] && scorePriority(code, apartment, p) > 0) push({ title: features[code][0], reason: top, icon: features[code][1] });
    }
  }

  // 3. Lifestyle answers turned into home features.
  const lifestyles = new Set(p.lifestyles);
  if (lifestyles.has('Athlete')) {
    push(near('gymDistanceMinutes', 'Gym', 'Matches your active lifestyle', 'fa-dumbbell'));
    push(near('parkDistanceMinutes', 'Park', 'Matches your outdoor lifestyle', 'fa-tree'));
  }
  if (lifestyles.has('RemoteWorker')) {
    push(workspace('Room to work from home', 'fa-laptop'));
    push(quiet('Matches your quiet lifestyle'));
    push(near('cafeDistanceMinutes', 'Café', 'Good for working remotely', 'fa-mug-hot'));
  }
  if (lifestyles.has('BusinessProfessional')) {
    if (p.businessMode === 'NearOffice') {
      const km = officeDistanceKm(apartment, p);
      if (km !== undefined && officeDistancePoints(km) > 0) push({ title: 'Close to your office', reason: 'Matches your work routine', icon: 'fa-building', meta: `${km.toFixed(1)} km` });
    } else if (p.businessMode === 'HomeBusiness') {
      push(workspace('Room for your business', 'fa-house-laptop'));
    }
    push(near('metroDistanceMinutes', 'Metro', 'Handy for meetings', 'fa-train-subway'));
  }
  if (lifestyles.has('Student')) {
    push(near('universityDistanceMinutes', 'University', 'Handy for your studies', 'fa-graduation-cap'));
    push(near('metroDistanceMinutes', 'Metro', 'Handy for your studies', 'fa-train-subway'));
  }
  if (lifestyles.has('QuietLifestyle')) {
    push(quiet('Matches your quiet lifestyle'));
    push(near('parkDistanceMinutes', 'Park', 'Green space for a calm routine', 'fa-tree'));
  }
  if (lifestyles.has('SocialLifestyle')) push(near('cafeDistanceMinutes', 'Café', 'Matches your social lifestyle', 'fa-mug-hot'));
  if (lifestyles.has('HostsGuests') && ((apartment.bedrooms ?? 0) >= 2 || (apartment.sizeSquareMeters ?? 0) >= 80)) {
    push({ title: 'Space for guests', reason: 'Matches how often you host', icon: 'fa-people-group' });
  }

  // 4. Other answers: car, children, pets, style, everyday routine.
  if (p.transportation.includes('Car')) push(parking('Parking available'));
  for (const place of preferencePlaces(apartment, p)) push(near(place.field, place.title, place.reason, place.icon));
  if ((p.apartmentStyle === 'Modern' || p.apartmentStyle === 'Vintage') && normalizeApartmentStyle(apartment.apartmentStyle) === p.apartmentStyle) {
    push({ title: 'Your style of home', reason: answerLabel(p.apartmentStyle), icon: 'fa-couch' });
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
