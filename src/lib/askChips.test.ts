import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterChips, howFar, suggestionAction } from './askChips.ts';

test('sugerencias del servidor', () => {
  assert.deepEqual(suggestionAction('Solo abiertos'), { kind: 'filter', filter: 'open_now' });
  assert.deepEqual(suggestionAction('Verlos en el mapa'), { kind: 'map' });
  assert.deepEqual(suggestionAction('Ver categorías'), { kind: 'categories' });
  assert.deepEqual(suggestionAction('Otra cosa'), { kind: 'ask', text: 'Otra cosa' });
});

test('fichas de condiciones y distancia', () => {
  assert.deepEqual(
    filterChips({ open_now: true, with_offer: false, delivery: true, cheapest: false }).map((c) => c.label),
    ['abierto', 'a domicilio'],
  );
  assert.equal(howFar(3, 0.2), 'a 3 min');
  assert.equal(howFar(40, 3.2), 'a 3,2 km');
});
