import assert from 'node:assert/strict';
import { test } from 'node:test';
import { offerOrder } from './offerOrder.ts';

const items = [
  { id: 'a', name: 'Camiseta' },
  { id: 'b', name: 'Bolso' },
  { id: 'c', name: 'Zapatos' },
  { id: 'd', name: 'Gorra' },
];

test('primero lo quieto, después lo que menos se vendió; sin datos, el orden del catálogo', () => {
  assert.deepEqual(offerOrder(items, null), { items, ranked: false });
  const r = offerOrder(items, { idle: [{ ref: 'x', name: 'gorra' }], sold: [{ ref: 'a', name: 'Camiseta', qty: 9 }, { ref: 'c', name: 'Zapatos', qty: 2 }] });
  assert.equal(r.ranked, true);
  assert.deepEqual(r.items.map((i) => i.id), ['d', 'b', 'c', 'a']);
});
