import assert from 'node:assert/strict';
import { test } from 'node:test';
import { liveParse } from './voiceLive.ts';

const items = [
  { name: 'Zapatos Nike', price: 220000 },
  { name: 'Zapatos Lacoste', price: 250000 },
  { name: 'Gorra', price: 30000 },
];

test('liveParse: «zapatos Lacoste» es un solo producto, no Nike y después Lacoste', () => {
  const r = liveParse('vendí zapatos Lacoste a Jesús David', items);
  assert.deepEqual(r.lines.map((l) => l.name), ['Zapatos Lacoste']);
});

test('liveParse: «zapatos» solo no adivina entre varios; «dos gorras» sí', () => {
  assert.deepEqual(liveParse('vendí zapatos', items).lines, []);
  const r = liveParse('vendí dos gorras', items);
  assert.deepEqual(r.lines.map((l) => [l.name, l.qty]), [['Gorra', 2]]);
});
