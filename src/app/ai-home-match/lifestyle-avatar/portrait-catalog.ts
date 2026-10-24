import type { HomeMatchProfile } from '../models/home-match-profile';
import { AVAILABLE_PORTRAIT_FILES } from './portrait-assets';

export const PORTRAIT_LAYOUTS = [
  'man', 'woman', 'couple', 'family-one', 'family-two',
  'roommates-two', 'roommates-three', 'relatives-three', 'corporate-four',
] as const;
export const PORTRAIT_PET_VARIANTS = [
  'none', 'cat', 'other', 'cat-other',
  ...['small', 'medium', 'large'].flatMap((size) =>
    ['', '-cat', '-other', '-cat-other'].map((suffix) => `dog-${size}${suffix}`)),
];
const ORIGINAL_SCENES: Record<string, string> = {
  'man/none': 'man.webp', 'man/cat': 'man-cat.webp', 'man/dog-small': 'man-dog.webp',
  'woman/none': 'woman.webp', 'woman/cat': 'woman-cat.webp', 'woman/dog-small': 'woman-dog.webp',
  'couple/none': 'couple.webp', 'couple/cat': 'couple-cat.webp', 'couple/dog-small': 'couple-dog.webp',
};

export function portraitFilename(layout: string, pets: string): string {
  return ORIGINAL_SCENES[`${layout}/${pets}`] ?? `${layout}--${pets}.webp`;
}

function layoutFor(profile: HomeMatchProfile): string | null {
  if (!profile.children) {
    if (profile.adults === 1 && profile.householdType === 'JustMe')
      return profile.gender === 'Male' ? 'man' : profile.gender === 'Female' ? 'woman' : null;
    if (profile.adults === 2 && profile.householdType === 'Couple') return 'couple';
    if (profile.adults === 2 && profile.householdType === 'Roommates') return 'roommates-two';
    if (profile.adults === 3 && profile.householdType === 'Roommates') return 'roommates-three';
    if (profile.adults === 3 && profile.householdType === 'Relatives') return 'relatives-three';
    if (profile.adults === 4 && profile.householdType === 'CorporateHousing') return 'corporate-four';
  }
  // Two parents with one or two children use the family scenes whatever the children's ages,
  // so every family card gets the same portrait style as the other households.
  if (profile.householdType === 'FamilyWithChildren' && profile.adults === 2) {
    if (profile.children === 1) return 'family-one';
    if (profile.children === 2) return 'family-two';
  }
  return null;
}

/** Select only a saved complete scene matching the represented people and pets. */
export function findPortraitScene(profile: HomeMatchProfile): string | null {
  const layout = layoutFor(profile);
  if (!layout) return null;
  const pets = !profile.hasPet ? [] : [...new Set(
    profile.petTypes?.length ? profile.petTypes : [profile.petType ?? 'Other'],
  )].filter((pet) => pet !== 'None');
  if (pets.includes('Other') && !['rabbit', 'კურდღელი', 'кролик'].includes(
    (profile.petOtherType || '').trim().toLowerCase(),
  )) return null;
  const key = [
    ...(pets.includes('Dog') ? [`dog-${(profile.dogSize ?? 'Medium').toLowerCase()}`] : []),
    ...(pets.includes('Cat') ? ['cat'] : []),
    ...(pets.includes('Other') ? ['other'] : []),
  ].join('-') || 'none';
  const file = portraitFilename(layout, key);
  return AVAILABLE_PORTRAIT_FILES.has(file) ? `/images/ai-match/portraits/${file}` : null;
}
