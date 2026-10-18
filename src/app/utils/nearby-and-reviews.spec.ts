import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Apartment } from '../models/apartment';
import { cardNearbyPlaces, encodeNearbyPlaceNames, nearbyDriveMinutes, splitNearbyPlaceNames } from './nearby-places';
import { isListedUniversity, listedUniversityMinutes } from './universities';
import { formatReviewDate, ratingLabel, reviewSubmitError, reviewsText, ruPlural, starsText } from './review-i18n';
import { languageNameList, languageShortList } from './agent-languages';

const apartment = (values: Partial<Apartment>): Apartment => values as Apartment;

test('drive minutes are stored as flat string entries the API can read', () => {
  const json = encodeNearbyPlaceNames({ groceryDistanceMinutes: 'Carrefour', petServicesChecked: '1' }, { groceryDistanceMinutes: 7, parkDistanceMinutes: undefined });
  assert.deepEqual(JSON.parse(json!), { groceryDistanceMinutes: 'Carrefour', petServicesChecked: '1', 'drive:groceryDistanceMinutes': '7' });
  assert.deepEqual(splitNearbyPlaceNames(json), {
    names: { groceryDistanceMinutes: 'Carrefour', petServicesChecked: '1' },
    driveMinutes: { groceryDistanceMinutes: 7 },
  });
  assert.equal(encodeNearbyPlaceNames({}, {}), undefined);
  assert.deepEqual(nearbyDriveMinutes(apartment({ nearbyPlaceNames: 'not json' })), {});
});

test('out-of-town cards fill empty nearby slots with short drives, parking last', () => {
  const house = apartment({
    hasParking: true,
    nearbyPlaceNames: JSON.stringify({ 'drive:groceryDistanceMinutes': '6', 'drive:schoolDistanceMinutes': '9', 'drive:parkDistanceMinutes': '45' }),
  });
  assert.deepEqual(cardNearbyPlaces(house, 3, 'Free').map((place) => `${place.label}: ${place.detail}`), [
    'Grocery: 6 min drive',
    'School: 9 min drive',
    'Parking: Free',
  ]);
});

test('city cards with three walkable places keep the walking list unchanged', () => {
  const flat = apartment({ metroDistanceMinutes: 5, parkDistanceMinutes: 4, gymDistanceMinutes: 8, groceryDistanceMinutes: 2 });
  assert.deepEqual(cardNearbyPlaces(flat).map((place) => place.label), ['Metro', 'Park', 'Fitness']);
  // Beyond a 20-minute walk a place is not "nearby".
  assert.deepEqual(cardNearbyPlaces(apartment({ metroDistanceMinutes: 24 })), []);
});

test('only listed universities count, in Georgian or English', () => {
  for (const name of ['Ilia State University', 'Tbilisi State University Building VIII', 'თსუ მე-2 კორპუსი', 'Georgian-American University (GAU)', 'Iliauni C building', 'University Geomedi LLC'])
    assert.equal(isListedUniversity(name), true, name);
  for (const name of ['Educational Center "Queen"', 'Школа', 'Kutaisi International University', 'Tbilisi Open University', '', null])
    assert.equal(isListedUniversity(name), false, String(name));
  const names = (university: string) => JSON.stringify({ universityDistanceMinutes: university });
  assert.equal(listedUniversityMinutes(apartment({ universityDistanceMinutes: 3, nearbyPlaceNames: names('Educational Center "Queen"') })), undefined);
  assert.equal(listedUniversityMinutes(apartment({ universityDistanceMinutes: 8, nearbyPlaceNames: names('Free University of Tbilisi') })), 8);
  assert.equal(listedUniversityMinutes(apartment({ universityDistanceMinutes: 8 })), undefined);
});

test('review copy uses the right Russian plural and Georgian labels', () => {
  assert.deepEqual([1, 2, 5, 11, 21, 22, 25].map((n) => ruPlural(n, 'отзыв', 'отзыва', 'отзывов')),
    ['отзыв', 'отзыва', 'отзывов', 'отзывов', 'отзыв', 'отзыва', 'отзывов']);
  assert.equal(reviewsText('ru', 3), '3 отзыва');
  assert.equal(reviewsText('en', 1), '1 review');
  assert.equal(reviewsText('ka', 7), '7 შეფასება');
  assert.equal(starsText('ru', 4), '4 звезды');
  assert.equal(ratingLabel('ka', 5), 'შესანიშნავი');
  assert.equal(ratingLabel('en', 1), 'Very Bad');
  assert.equal(formatReviewDate('en', 'not a date', { year: 'numeric' }), '');
});

test('API review errors are shown in the visitor language', () => {
  assert.equal(reviewSubmitError('ka', 429, 'You have already reviewed this agent today. Thank you!'), 'დღეს ამ აგენტს უკვე შეაფასეთ. გმადლობთ!');
  assert.equal(reviewSubmitError('ru', 400, 'Please remove links from your review.'), 'Пожалуйста, уберите ссылки из отзыва.');
  assert.equal(reviewSubmitError('en', 0), 'No connection. Check your internet and try again.');
  assert.equal(reviewSubmitError('en', 500, 'boom'), 'Your review could not be sent. Please try again.');
});

test('agent languages default to Georgian, English, Russian and keep display order', () => {
  assert.equal(languageShortList(undefined), 'Ge, En, Ru');
  assert.equal(languageShortList(['tr', 'ka']), 'Ge, Tr');
  assert.equal(languageNameList(['en', 'uk'], 'ka'), 'ინგლისური, უკრაინული');
  assert.equal(languageNameList([], 'ru'), 'Грузинский, Английский, Русский');
});
