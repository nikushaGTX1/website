import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backToResultsQuery } from './results-return';

// VELVEN-005: "Back to results" dropped the rental mode and every search filter.
test('returns the saved rental search for a rental listing', () => {
  const saved = '/ExploreProperty?mode=rent&location=Saburtalo&budgetMin=500&budget=1000&bedrooms=1';
  assert.deepEqual(backToResultsQuery(saved, false), {
    mode: 'rent', location: 'Saburtalo', budgetMin: '500', budget: '1000', bedrooms: '1',
  });
});

test('ignores a saved search for the other mode', () => {
  assert.deepEqual(backToResultsQuery('/ExploreProperty?mode=rent&budget=1000', true), { mode: 'buy' });
  assert.equal(backToResultsQuery('/ExploreProperty?mode=buy&budget=90000', false), null);
});

test('falls back when the listing was opened directly', () => {
  assert.equal(backToResultsQuery(null, false), null);
  assert.deepEqual(backToResultsQuery('/apartments/12', true), { mode: 'buy' });
});
