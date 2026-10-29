import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localizeListingTitle, TitleDistrict } from './listing-title';

const districts: TitleDistrict[] = [
  { en: 'Vake', ka: 'ვაკე' },
  { en: 'Saburtalo', ka: 'საბურთალო' },
  { en: 'Krtsanisi', ka: 'კრწანისი' },
  { en: 'Didi Digomi', ka: 'დიდი დიღომი' },
];

// QA audit: Georgian listing titles were shown unchanged on the English site.
test('rewrites the Georgian titles agents actually write', () => {
  assert.equal(localizeListingTitle('ქირავდება 3-ოთახიანი ბინა ვაკეში.', 'en', districts), '3-room apartment for rent in Vake');
  assert.equal(localizeListingTitle('ქირავდება 2 ოთახიანი ბინა საბურთალოზე', 'en', districts), '2-room apartment for rent in Saburtalo');
  assert.equal(
    localizeListingTitle('ქირავდება 5-ოთახიანი ბინა კრწანისი, თბილისში — $4,000/თვე', 'en', districts),
    '5-room apartment for rent in Krtsanisi',
  );
  assert.equal(localizeListingTitle('იყიდება 4-ოთახიანი ბინა ვაკეში.', 'ru', districts), 'Квартира, 4 комн. на продажу — Vake');
  assert.equal(localizeListingTitle('ქირავდება 5-ოთახიანი კომერციული ფართი ვაკეში.', 'en', districts), '5-room commercial space for rent in Vake');
});

test('uses the listing district when the title spelling is not recognised', () => {
  assert.equal(
    localizeListingTitle({ title: 'ქირავდება 3 ოთახიანი ბინა დიდ დიღომში', district: 'Didi Digomi' }, 'en', districts),
    '3-room apartment for rent in Didi Digomi',
  );
});

test('a saved translation wins, and Georgian readers see the original wording', () => {
  const listing = { title: 'ქირავდება 3-ოთახიანი ბინა ვაკეში.', titleEn: 'Sunny 3-room flat in Vake', titleRu: null };
  assert.equal(localizeListingTitle(listing, 'en', districts), 'Sunny 3-room flat in Vake');
  assert.equal(localizeListingTitle(listing, 'ka', districts), 'ქირავდება 3-ოთახიანი ბინა ვაკეში.');
  assert.equal(localizeListingTitle(listing, 'ru', districts), 'Квартира, 3 комн. в аренду — Vake');
});

test('unknown text falls back to the original title', () => {
  assert.equal(localizeListingTitle('Penthouse with a view', 'ru', districts), 'Penthouse with a view');
  assert.equal(localizeListingTitle(null, 'en', districts), '');
});
