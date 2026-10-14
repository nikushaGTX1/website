import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verificationProgress, VerificationOverview } from './verification-model';
test('progress excludes missing IDs and counts partial failures as processed', () => {
  const overview: VerificationOverview = {
    job: { id: 'job', state: 'RUNNING', totalApartments: 1000, missingIds: 100, createdAt: '' },
    counts: [
      { status: 'PENDING', count: 450 },
      { status: 'ERROR', count: 100 },
      { status: 'ACTIVE', count: 350 },
    ],
  };
  assert.deepEqual(verificationProgress(overview), {
    eligible: 900,
    remaining: 450,
    processed: 450,
    percent: 50,
  });
  assert.deepEqual(
    verificationProgress(JSON.parse(JSON.stringify(overview))),
    verificationProgress(overview),
  );
});
test('empty and completed jobs do not divide by zero', () => {
  assert.equal(verificationProgress({ job: null }).percent, 100);
  assert.deepEqual(
    verificationProgress({
      job: { id: 'job', state: 'COMPLETED', totalApartments: 3, missingIds: 3, createdAt: '' },
    }),
    { eligible: 0, remaining: 0, processed: 0, percent: 100 },
  );
});
