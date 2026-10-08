import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidPhone, whatsappDigits } from './phone';

// VELVEN-029: the upload form accepted any text as the owner/agent phone.
test('accepts Georgian mobile numbers with or without the country code', () => {
  assert.equal(isValidPhone('555 12 34 56'), true);
  assert.equal(isValidPhone('555123456'), true);
  assert.equal(isValidPhone('+995 555 12 34 56'), true);
  assert.equal(isValidPhone('+1 202 555 0143'), true);
});

test('rejects text, short numbers and empty values', () => {
  for (const value of ['abc', '123', '555-abc-12', '', '   ', null, undefined, '000000000']) {
    assert.equal(isValidPhone(value), false, String(value));
  }
});

// VELVEN-018: chat links need the country code; local Georgian numbers get +995.
test('builds WhatsApp digits with the Georgian country code', () => {
  assert.equal(whatsappDigits('558455832'), '995558455832');
  assert.equal(whatsappDigits('+995 599 11 22 33'), '995599112233');
  assert.equal(whatsappDigits(''), '');
});
