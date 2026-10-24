import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { EMPTY_HOME_MATCH_PROFILE, HomeMatchProfile } from '../models/home-match-profile';
import { findPortraitScene, PORTRAIT_LAYOUTS, PORTRAIT_PET_VARIANTS } from './portrait-catalog';

const root = 'public/images/ai-match/portraits/';
const catalogue = JSON.parse(readFileSync(root + 'catalogue.json', 'utf8'));

test('the saved preset matrix covers nine household layouts and all sixteen pet combinations', () => {
  assert.equal(PORTRAIT_LAYOUTS.length, 9);
  assert.equal(PORTRAIT_PET_VARIANTS.length, 16);
  assert.equal(catalogue.portraits.length, 144);
  assert.equal(new Set(catalogue.portraits.map((p: { file: string }) => p.file)).size, 144);
  for (const entry of catalogue.portraits) {
    const household = entry.layout.startsWith('family-') ? 'FamilyWithChildren'
      : entry.layout.startsWith('roommates-') ? 'Roommates'
      : entry.layout === 'relatives-three' ? 'Relatives'
      : entry.layout === 'corporate-four' ? 'CorporateHousing'
      : entry.layout === 'couple' ? 'Couple' : 'JustMe';
    const profile: HomeMatchProfile = {
      ...EMPTY_HOME_MATCH_PROFILE, householdType: household,
      gender: entry.gender || 'Male', adults: entry.adults, children: entry.children.length,
      childrenAgeGroups: entry.children, hasPet: !!entry.pets.length,
      petTypes: [...entry.pets].reverse(), petCount: entry.pets.length || 1,
      dogSize: entry.dogSize || undefined, petOtherType: entry.otherPet || '',
    };
    assert.ok(existsSync(root + entry.file), `missing scene: ${entry.file}`);
    assert.equal(findPortraitScene(profile), '/images/ai-match/portraits/' + entry.file, entry.file);
  }
});

test('custom species and unsupported household sizes do not select a mismatched finished image', () => {
  const base: HomeMatchProfile = { ...EMPTY_HOME_MATCH_PROFILE, householdType: 'JustMe', gender: 'Female', adults: 1, children: 0, hasPet: true, petTypes: ['Other'], petCount: 1 };
  assert.equal(findPortraitScene({ ...base, petOtherType: 'parrot' }), null);
  assert.equal(findPortraitScene({ ...base, householdType: 'FamilyWithChildren', adults: 2, children: 3, childrenAgeGroups: ['Age0To3'] }), null);
  assert.equal(findPortraitScene({ ...base, householdType: 'CorporateHousing', adults: 7 }), null);
});

test('families of two parents with one or two children of any age, and several pets of one kind, keep the portrait style', () => {
  const family: HomeMatchProfile = { ...EMPTY_HOME_MATCH_PROFILE, householdType: 'FamilyWithChildren', gender: 'Male', adults: 2, children: 1, childrenAgeGroups: ['Age0To3'], hasPet: false };
  assert.match(findPortraitScene(family) ?? '', /family-one/);
  assert.match(findPortraitScene({ ...family, children: 2, childrenAgeGroups: ['Age0To3', 'Age7To12'] }) ?? '', /family-two/);
  const dogs: HomeMatchProfile = { ...EMPTY_HOME_MATCH_PROFILE, householdType: 'JustMe', gender: 'Female', adults: 1, hasPet: true, petTypes: ['Dog'], dogSize: 'Small', petCount: 3 };
  assert.match(findPortraitScene(dogs) ?? '', /woman-dog/);
});

test('no-pet profiles ignore stale pet fields and pet selection order does not change a scene', () => {
  const base: HomeMatchProfile = { ...EMPTY_HOME_MATCH_PROFILE, householdType: 'Couple', gender: 'Male', adults: 2, hasPet: false, petTypes: ['Dog', 'Cat'], petCount: 4 };
  assert.equal(findPortraitScene(base), '/images/ai-match/portraits/couple.webp');
  const mixed = { ...base, hasPet: true, petCount: 2, dogSize: 'Large' as const };
  assert.equal(findPortraitScene(mixed), findPortraitScene({ ...mixed, petTypes: ['Cat', 'Dog'] }));
});
