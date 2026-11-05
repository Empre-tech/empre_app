import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dictatedPrice, similarItems } from './voiceNewItem.ts';

const items = [
  { ref: '1', name: 'Perfume Dior', kind: 'product' as const },
  { ref: '2', name: 'Esencia de perfume', kind: 'supply' as const },
  { ref: '3', name: 'Perla', kind: 'product' as const },
  { ref: '4', name: 'Corte de cabello', kind: 'product' as const },
  { ref: '5', name: 'Perfumes', kind: 'product' as const },
];

test('similarItems encuentra el parentesco real, en productos e insumos', () => {
  assert.deepEqual(similarItems('perfume', items).map((x) => x.ref), ['5', '1', '2']);
});

test('similarItems no se confunde con palabras parecidas por encima', () => {
  assert.deepEqual(similarItems('perla negra', items).map((x) => x.ref), ['3']);
  assert.deepEqual(similarItems('camisa', items), []);
  assert.deepEqual(similarItems('de la', items), []);
});

test('similarItems tolera un error de dictado solo en palabras largas', () => {
  assert.deepEqual(similarItems('perfune', items).map((x) => x.ref), ['5', '1', '2']);
  assert.deepEqual(similarItems('perl', [{ ref: '3', name: 'Perla', kind: 'product' as const }]), []);
});

test('dictatedPrice lee el precio como se dice', () => {
  assert.equal(dictatedPrice('el perfume tiene un valor de $50,000'), 50000);
  assert.equal(dictatedPrice('perfume a 50.000'), 50000);
  assert.equal(dictatedPrice('vale 50 mil'), 50000);
  assert.equal(dictatedPrice('cuesta cincuenta mil'), 50000);
  assert.equal(dictatedPrice('vale 1500'), 1500);
  assert.equal(dictatedPrice('$1.250.000'), 1250000);
});

test('dictatedPrice no toma cantidades pequeñas como precio', () => {
  assert.equal(dictatedPrice('tengo 12 camisas'), null);
  assert.equal(dictatedPrice('se acabó el jugo'), null);
});
