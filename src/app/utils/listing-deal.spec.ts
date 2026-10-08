import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSaleListing } from './listing-deal';

// VELVEN-015: sale listings were shown with a "/ month" rental suffix.
test('reads the deal tag from the description', () => {
  assert.equal(isSaleListing({ title: 'Apartment in Vake', description: 'Deal: For Sale | Rooms: 4' }), true);
  assert.equal(isSaleListing({ title: 'Apartment in Vake', description: 'Deal: For Rent' }), false);
});

test('falls back to the title', () => {
  assert.equal(isSaleListing({ title: 'Apartment for sale in Vake' }), true);
  assert.equal(isSaleListing({ title: 'Apartment for rent in Saburtalo' }), false);
});
