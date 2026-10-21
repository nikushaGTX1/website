import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geocodeCached, resetGeocodeCacheForTests } from './geocode-cache';

/** Fake Geocoder: counts calls and answers like the Maps JS API. */
function fakeGeocoder(answer: (address: string) => 'hit' | 'none' | 'error') {
  const calls: string[] = [];
  const geocoder = {
    geocode: async (request: { address?: string }) => {
      calls.push(request.address || '');
      await new Promise((resolve) => setTimeout(resolve, 5));
      const result = answer(request.address || '');
      if (result === 'error') throw Object.assign(new Error('quota'), { code: 'OVER_QUERY_LIMIT' });
      if (result === 'none') throw Object.assign(new Error('none'), { code: 'ZERO_RESULTS' });
      return {
        results: [
          {
            geometry: {
              location: { lat: () => 41.7, lng: () => 44.8 },
              location_type: 'ROOFTOP',
              viewport: { getSouthWest: () => ({ lat: () => 41.69, lng: () => 44.79 }), getNorthEast: () => ({ lat: () => 41.71, lng: () => 44.81 }) },
            },
          },
        ],
      };
    },
  };
  return { geocoder, calls };
}

test('the same address requested many times at once is geocoded once', async () => {
  const { geocoder, calls } = fakeGeocoder(() => 'hit');
  resetGeocodeCacheForTests(geocoder as never);
  // What the Explore map did: several marker rebuilds asking for the same 4 addresses.
  const addresses = ['Ortachala, Tbilisi, Georgia', 'ლისი, Tbilisi, Georgia', 'A, Tbilisi', 'B, Tbilisi'];
  const results = await Promise.all(
    Array.from({ length: 6 }, () => addresses.map((address) => geocodeCached({ address, region: 'GE' }))).flat(),
  );
  assert.equal(calls.length, 4);
  assert.ok(results.every((hit) => hit?.lat === 41.7 && hit.locationType === 'ROOFTOP'));
  assert.deepEqual(results[0]?.viewport, { south: 41.69, west: 44.79, north: 41.71, east: 44.81 });
});

test('a finished answer is reused later without another request', async () => {
  const { geocoder, calls } = fakeGeocoder(() => 'hit');
  resetGeocodeCacheForTests(geocoder as never);
  await geocodeCached({ address: 'Vake, Tbilisi' });
  await geocodeCached({ address: '  VAKE, Tbilisi ' }); // case and spaces do not matter
  assert.equal(calls.length, 1);
});

test('"no such address" is remembered, but quota errors are retried', async () => {
  const none = fakeGeocoder(() => 'none');
  resetGeocodeCacheForTests(none.geocoder as never);
  assert.equal(await geocodeCached({ address: 'Nowhere' }), null);
  assert.equal(await geocodeCached({ address: 'Nowhere' }), null);
  assert.equal(none.calls.length, 1);

  const failing = fakeGeocoder(() => 'error');
  resetGeocodeCacheForTests(failing.geocoder as never);
  assert.equal(await geocodeCached({ address: 'Busy' }), null);
  assert.equal(await geocodeCached({ address: 'Busy' }), null);
  assert.equal(failing.calls.length, 2);
});

test('different bounds or regions are separate requests', async () => {
  const { geocoder, calls } = fakeGeocoder(() => 'hit');
  resetGeocodeCacheForTests(geocoder as never);
  await geocodeCached({ address: 'Saburtalo', region: 'GE' });
  await geocodeCached({ address: 'Saburtalo', region: 'GE', bounds: { south: 41.6, west: 44.6, north: 41.9, east: 45.05 } });
  assert.equal(calls.length, 2);
});
