import '@angular/compiler';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstValueFrom, of } from 'rxjs';
import { HomeMatchService } from './home-match.service';
import { EMPTY_HOME_MATCH_PROFILE } from '../models/home-match-profile';
import { HomeMatchResult } from '../models/home-match-result';
import { evaluateMandatoryRequirements } from './mandatory-requirements';

const profile = { ...EMPTY_HOME_MATCH_PROFILE, propertyGoal: 'Rent' as const,
  locationFlexible: true, hasPet: true, petTypes: ['Dog' as const], budgetMax: 2000 };
const result = (id: number, allowed: boolean, score: number): HomeMatchResult => ({
  apartment: { id, title: 'Apartment for rent', description: 'Deal: For Rent',
    price: 1000, bedrooms: 2, isPetFriendly: allowed } as HomeMatchResult['apartment'],
  matchScore: score,
});

test('a dog owner never gets homes that do not allow pets; unknown dog size comes last', () => {
  const service = new HomeMatchService({} as any, { rates: { usdGel: 2.7, usdEur: .92 } } as any);
  // 7 pet-friendly homes, 9 with the "Pet friendly" box unticked (shown as "Pets: No").
  const homes = Array.from({ length: 16 }, (_, i) => result(i + 1, i < 7, i < 7 ? 30 + i : 90 + i));
  const ranked = service.rankMatches(homes, profile);
  assert.deepEqual(ranked.map(home => home.apartment.id).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7]);
  const prohibited = result(17, true, 100);
  prohibited.apartment.description += ' | No pets';
  assert.equal(service.rankMatches([...homes, prohibited], profile).length, 7);

  const medium = { ...profile, dogSize: 'Medium' as const };
  const sized = result(20, true, 10);
  sized.apartment.description += ' | Pets allowed: Dog | Pet sizes: Medium';
  const unknownSize = result(21, true, 99);
  const ordered = service.rankMatches([unknownSize, sized], medium);
  assert.deepEqual(ordered.map(home => home.apartment.id), [20, 21]);
  assert.equal(evaluateMandatoryRequirements(unknownSize.apartment, medium).status, 'confirm');
});

test('loads every response page before ranking', async () => {
  const pages: string[] = [];
  const service = new HomeMatchService({ post: (url: string) => {
    pages.push(url);
    return of({ totalMatches: 51, matches: url.endsWith('page=1')
      ? Array.from({ length: 50 }, (_, i) => result(i + 1, true, i)) : [result(51, true, 100)] });
  } } as any, { rates: { usdGel: 2.7, usdEur: .92 } } as any);
  const ranked = await firstValueFrom(service.findRankedMatches(profile));
  assert.equal(pages.length, 2);
  assert.equal(ranked.length, 51);
  assert.equal(ranked[0].apartment.id, 51);
});
