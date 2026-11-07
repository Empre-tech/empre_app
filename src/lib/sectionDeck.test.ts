import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deckAlert, deckCountText, rowWindow, wantsSectionDeck } from './sectionDeck.ts';

test('secciones en mazo: solo con lista larga y varias secciones', () => {
  assert.equal(wantsSectionDeck(20, 5), false);
  assert.equal(wantsSectionDeck(21, 1), false);
  assert.equal(wantsSectionDeck(21, 2), true);
});

test('secciones en mazo: lo urgente en una línea', () => {
  assert.equal(deckAlert(0, 0), null);
  assert.deepEqual(deckAlert(1, 3), { text: '1 agotado · 3 poco', tone: 'out' });
  assert.deepEqual(deckAlert(2, 0), { text: '2 se acabaron', tone: 'out' });
  assert.deepEqual(deckAlert(0, 1), { text: '1 se acaba', tone: 'low' });
  assert.equal(deckCountText(1, 'producto', 'productos'), '1 producto');
  assert.equal(deckCountText(46, 'producto', 'productos'), '46 productos');
});

test('secciones en mazo: las filas salen en orden y las de después de la octava, juntas', () => {
  assert.deepEqual(rowWindow(0), [0, 0.42]);
  assert.ok(rowWindow(3)[0] > rowWindow(2)[0]);
  assert.deepEqual(rowWindow(12), rowWindow(7));
  assert.ok(rowWindow(7)[1] <= 1);
});
