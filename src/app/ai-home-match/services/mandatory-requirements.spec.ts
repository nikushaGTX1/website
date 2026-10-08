// Regression tests for Velven Match classification (run: npm run test:unit).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_HOME_MATCH_PROFILE, HomeMatchProfile } from '../models/home-match-profile';
import { HomeMatchApartment } from '../models/home-match-result';
import {
  budgetRangeUsd,
  evaluateMandatoryRequirements,
  withinBudgetCeiling,
} from './mandatory-requirements';

const rates = { usdGel: 2.7, usdEur: 0.92 };

function profile(overrides: Partial<HomeMatchProfile> = {}): HomeMatchProfile {
  return {
    ...EMPTY_HOME_MATCH_PROFILE,
    districts: ['Saburtalo'],
    childrenAgeGroups: [],
    transportation: ['Metro'],
    lifestyles: ['QuietLifestyle'],
    topPriorities: [],
    propertyGoal: 'Rent',
    budgetMin: 500,
    budgetMax: 1500,
    currency: 'USD',
    bedrooms: 1,
    rentalDuration: 'TwelveMonths',
    moveInTiming: 'Immediately',
    ...overrides,
  };
}

function apartment(overrides: Partial<HomeMatchApartment> = {}): HomeMatchApartment {
  return {
    id: 1,
    title: 'Apartment for rent',
    description: 'Deal: For Rent',
    price: 1000,
    district: 'Saburtalo',
    bedrooms: 1,
    isPetFriendly: true,
    ...overrides,
  } as HomeMatchApartment;
}

// VELVEN-002: a GEL budget must be converted before comparing with USD prices.
test('VELVEN-002: $3,600 home is over a GEL 4,500 maximum', () => {
  const p = profile({ currency: 'GEL', budgetMin: 0, budgetMax: 4500 });
  assert.equal(withinBudgetCeiling(3600, p, rates), false);
  assert.ok(Math.abs((budgetRangeUsd(p, rates).max ?? 0) - 4500 / 2.7) < 0.01);
});

test('VELVEN-002: $1,500 home is within a GEL 4,500 maximum', () => {
  const p = profile({ currency: 'GEL', budgetMin: 0, budgetMax: 4500 });
  assert.equal(withinBudgetCeiling(1500, p, rates), true);
});

// VELVEN-016: homes below the minimum are not exact matches.
test('VELVEN-016: $850 home is an alternative for a $1,300–1,500 budget', () => {
  const p = profile({ budgetMin: 1300, budgetMax: 1500 });
  const result = evaluateMandatoryRequirements(apartment({ price: 850 }), p, rates);
  assert.equal(result.status, 'alternative');
  assert.ok(result.mismatches.some((note) => note.startsWith('Budget')));
});

test('VELVEN-016: $1,400 home is an exact match for a $1,300–1,500 budget', () => {
  const p = profile({ budgetMin: 1300, budgetMax: 1500 });
  assert.equal(evaluateMandatoryRequirements(apartment({ price: 1400 }), p, rates).status, 'exact');
});

// VELVEN-001: a dog owner never gets a not-pet-friendly home as an exact match.
test('VELVEN-001: not-pet-friendly home is not exact for a dog owner', () => {
  const p = profile({ hasPet: true, petType: 'Dog' });
  const result = evaluateMandatoryRequirements(apartment({ isPetFriendly: false }), p, rates);
  assert.notEqual(result.status, 'exact');
  assert.ok(result.confirmations.some((note) => note.startsWith('Pets')));
});

test('VELVEN-001: pet-friendly home stays exact for a dog owner', () => {
  const p = profile({ hasPet: true, petType: 'Dog' });
  assert.equal(evaluateMandatoryRequirements(apartment({ isPetFriendly: true }), p, rates).status, 'exact');
});

// VELVEN-028: a home outside the selected district is never an exact match.
test('VELVEN-028: Vake home is an alternative when Saburtalo was chosen', () => {
  const result = evaluateMandatoryRequirements(apartment({ district: 'Vake' }), profile(), rates);
  assert.equal(result.status, 'alternative');
  assert.ok(result.mismatches.some((note) => note.startsWith('Location')));
});
