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

test('keeps all 16 eligible homes and ranks unknown pet policies after confirmed permissions', () => {
  const service = new HomeMatchService({} as any, { rates: { usdGel: 2.7, usdEur: .92 } } as any);
  const homes = Array.from({ length: 16 }, (_, i) => result(i + 1, i < 7, i < 7 ? 30 + i : 90 + i));
  const ranked = service.rankMatches(homes, profile);
  assert.equal(ranked.filter(home => evaluateMandatoryRequirements(home.apartment, profile).status !== 'alternative').length, 16);
  assert.deepEqual(ranked.slice(0, 7).map(home => home.apartment.id), [7, 6, 5, 4, 3, 2, 1]);
  assert.deepEqual(ranked.slice(7).map(home => home.apartment.id), [16, 15, 14, 13, 12, 11, 10, 9, 8]);
  const prohibited = result(17, false, 100);
  prohibited.apartment.description += ' | No pets';
  assert.equal(service.rankMatches([...homes, prohibited], profile).length, 16);
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
