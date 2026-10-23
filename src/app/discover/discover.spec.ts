import '@angular/compiler';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BehaviorSubject, of } from 'rxjs';
import { convertToParamMap } from '@angular/router';
import { Discover } from './discover';
import { HomeMatchService } from '../ai-home-match/services/home-match.service';
import { EMPTY_HOME_MATCH_PROFILE } from '../ai-home-match/models/home-match-profile';
import { budgetRangeUsd, matchesPropertyGoal } from '../ai-home-match/services/mandatory-requirements';
import { discoverTranslation } from '../i18n/discover-translations';
import { DestroyRef, Injector, runInInjectionContext } from '@angular/core';

test('notification query changes update an already open Discover page', () => {
  const query = new BehaviorSubject(convertToParamMap({ search: '1' }));
  const injector = Injector.create({ providers: [{ provide: DestroyRef, useValue: { onDestroy() { return () => {}; } } }] });
  const page = runInInjectionContext(injector, () => new Discover({} as any, {} as any, {} as any,
    { favoriteIds$: of(new Set()) } as any, {} as any, {} as any,
    { queryParamMap: query } as any, {} as any, { markForCheck() {} } as any, {} as any));
  page.load = () => {};
  page.ngOnInit();
  assert.equal(page.selectedSearchId, 1);
  query.next(convertToParamMap({ search: '2', apartment: '99' }));
  assert.equal(page.selectedSearchId, 2);
  assert.equal(page.highlightedApartmentId, 99);
  page.ngOnDestroy();
});

test('Discover fetches every ranked result page', () => {
  const urls: string[] = [];
  const service = new HomeMatchService({ post(url: string) {
    urls.push(url); return of({ matches: [], totalMatches: 101 });
  } } as any, { rates: { usdGel: 2.7, usdEur: .92 } } as any);
  service.findRankedMatches(EMPTY_HOME_MATCH_PROFILE).subscribe();
  assert.equal(urls.length, 3);
  assert.ok(urls[2].endsWith('page=3'));
});

test('saved conversion remains consistent and budget edits invalidate it', () => {
  const profile = { ...EMPTY_HOME_MATCH_PROFILE, currency: 'GEL' as const, budgetMax: 3000,
    budgetConversion: { currency: 'GEL' as const, min: 0, max: 3000, usdGel: 3, usdEur: 1 } };
  assert.equal(budgetRangeUsd(profile).max, 1000);
  assert.ok(Math.abs(budgetRangeUsd({ ...profile, budgetMax: 2700 }).max! - 1000) < .001);
});

test('localized listings use the same deal classifier in both match flows', () => {
  assert.equal(matchesPropertyGoal({ title: 'იყიდება ბინა' }, { propertyGoal: 'Buy' }), true);
  assert.equal(matchesPropertyGoal({ title: 'Квартира в аренду' }, { propertyGoal: 'Rent' }), true);
  assert.equal(matchesPropertyGoal({ title: 'ქირავდება ბინა' }, { propertyGoal: 'Buy' }), false);
});

test('Discover copy and dynamic notifications translate in both languages', () => {
  for (const language of ['ka', 'ru'] as const) {
    assert.ok(discoverTranslation('Saved searches', language));
    assert.ok(discoverTranslation('A new 3-bedroom apartment in Vake matches your preferences.', language));
  }
});
