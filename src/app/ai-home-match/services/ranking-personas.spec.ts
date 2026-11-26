// Velven Match persona tests: hard filters, ordering and explanations (run: npm run test:unit).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_HOME_MATCH_PROFILE, HomeMatchProfile } from '../models/home-match-profile';
import { HomeMatchApartment, HomeMatchResult } from '../models/home-match-result';
import { compareMatchOrder, evaluateMandatoryRequirements } from './mandatory-requirements';
import { applyPriorityScoring, valueScore } from './priority-scoring';
import { explainHomeMatch } from './match-explanations';

const rates = { usdGel: 2.7, usdEur: 0.92 };

/** Renter with a medium dog and a car, Vake only, moving in immediately, 12-month lease. */
const persona: HomeMatchProfile = {
  ...EMPTY_HOME_MATCH_PROFILE,
  propertyGoal: 'Rent',
  districts: ['Vake'],
  budgetMin: 0,
  budgetMax: 2000,
  currency: 'USD',
  bedrooms: 2,
  bedroomChoices: [2],
  hasPet: true,
  petType: 'Dog',
  petTypes: ['Dog'],
  dogSize: 'Medium',
  transportation: ['Car'],
  carFuelType: 'Electric',
  lifestyles: ['Athlete'],
  topPriorities: ['ParkNearby', 'Parking', 'GymNearby', 'MetroNearby', 'SupermarketNearby'],
  rentalDuration: 'TwelveMonths',
  moveInTiming: 'Immediately',
  adults: 2,
};

const dogOk = 'Deal: For Rent | Pets allowed: Dog | Pet sizes: Small, Medium';
function home(id: number, overrides: Partial<HomeMatchApartment> = {}): HomeMatchApartment {
  return {
    id, title: 'Apartment for rent', description: dogOk, price: 1500, district: 'Vake',
    bedrooms: 2, isPetFriendly: true, hasParking: true, parkDistanceMinutes: 6, gymDistanceMinutes: 6,
    metroDistanceMinutes: 9, groceryDistanceMinutes: 4,
    ...overrides,
  } as HomeMatchApartment;
}

function rank(homes: HomeMatchApartment[]): number[] {
  return homes
    .map((apartment) => ({ apartment, status: evaluateMandatoryRequirements(apartment, persona, rates).status,
      scored: applyPriorityScoring({ apartment, matchScore: 60 } as HomeMatchResult, persona) }))
    .filter((item) => item.status !== 'alternative')
    .sort((a, b) => compareMatchOrder(
      { status: a.status, apartment: a.apartment, score: a.scored.rankingScore ?? 0 },
      { status: b.status, apartment: b.apartment, score: b.scored.rankingScore ?? 0 },
      persona,
    ))
    .map((item) => item.apartment.id);
}

test('hard filters: no pets, wrong district, wrong dog size and over budget are removed', () => {
  const ids = rank([
    home(1),
    home(2, { isPetFriendly: false, description: 'Deal: For Rent' }),
    home(3, { district: 'Saburtalo' }),
    home(4, { district: 'Bagebi' }),
    home(5, { description: 'Deal: For Rent | Pets allowed: Dog | Pet sizes: Small' }),
    home(6, { price: 4000 }),
    home(7, { bedrooms: 1 }),
  ]);
  assert.deepEqual(ids, [1]);
});

test('ordering: free now first, later availability after', () => {
  const later = new Date(); later.setDate(later.getDate() + 30);
  const ids = rank([
    home(11, { availableFrom: later.toISOString().slice(0, 10) }),
    home(12),
  ]);
  assert.deepEqual(ids, [12, 11]);
});

test('value: with the same fit, the cheaper home ranks first (#762 $1,200 over #696 $1,800)', () => {
  const ids = rank([
    home(696, { price: 1800, hasParking: false, evChargerDistanceMinutes: 20 }),
    home(762, { price: 1200, hasParking: true, evChargerDistanceMinutes: 1 }),
  ]);
  assert.deepEqual(ids, [762, 696]);
  assert.ok(valueScore(home(1, { price: 1200 }), persona) > valueScore(home(1, { price: 1800 }), persona));
});

test('explanations: priorities say why they matter, metro is included, a district is not "the place you chose"', () => {
  const reasons = explainHomeMatch(home(1), { ...persona, topPriorities: ['SelectedLocationNearby', ...persona.topPriorities] });
  assert.equal(reasons[0].title, 'Park');
  assert.equal(reasons[0].reason, 'To walk your dog');
  assert.ok(reasons.some((item) => item.title === 'Parking for your car' && item.reason === 'For your car'));
  assert.ok(reasons.some((item) => item.title === 'Metro'));
  assert.ok(!reasons.some((item) => /place you chose/.test(item.title)));

  const pinned = explainHomeMatch(
    home(1, { propertyLatitude: 41.7151, propertyLongitude: 44.7271 }),
    { ...persona, topPriorities: ['SelectedLocationNearby'], proximityTarget: 'your office', proximityLatitude: 41.7175, proximityLongitude: 44.7300 },
  );
  assert.match(pinned[0].title, /^\d+ min walk to your office$/);
});

test('street parking is not "Parking for your car"', () => {
  const street = home(1, { hasParking: true, parkingCondition: 'StreetParking' });
  assert.ok(!explainHomeMatch(street, persona).some((item) => item.title === 'Parking for your car'));
  const garage = home(2, { hasParking: false, parkingCondition: 'Garage' });
  assert.ok(explainHomeMatch(garage, persona).some((item) => item.title === 'Parking for your car'));
});
