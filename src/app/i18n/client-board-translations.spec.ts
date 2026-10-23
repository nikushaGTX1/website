import test from 'node:test';
import assert from 'node:assert/strict';
import { CLIENT_BOARD_COPY } from './client-board-translations';
import { georgianTranslation } from './georgian-translations';
import { russianTranslation } from './russian-translations';

test('every Clients, intake and staff action message reaches both existing translation maps', () => {
  const keys = new Set<string>();
  for (const [english, georgian, russian] of CLIENT_BOARD_COPY) {
    assert.ok(!keys.has(english.toLowerCase()), `duplicate key: ${english}`);
    keys.add(english.toLowerCase());
    assert.match(georgian, /[ა-ჰ]/, `missing Georgian: ${english}`);
    assert.match(russian, /[а-яА-Я]/, `missing Russian: ${english}`);
    assert.equal(georgianTranslation(english), georgian);
    assert.equal(russianTranslation(english), russian);
  }
  assert.equal(georgianTranslation('Clients'), 'კლიენტები');
  assert.equal(russianTranslation('Clients'), 'Клиенты');
});
