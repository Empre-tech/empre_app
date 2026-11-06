import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countFromWords, dictatedPrice, isMoneyTalk, isPriceStatement, itemNamedIn, sameNameItem, similarItems } from './voiceNewItem.ts';

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

test('isPriceStatement distingue el precio del costo y de una venta', () => {
  assert.equal(isPriceStatement('el perfume tiene un valor de $50,000'), true);
  assert.equal(isPriceStatement('el corte vale 25 mil'), true);
  assert.equal(isPriceStatement('el precio del aceite es 30.000'), true);
  assert.equal(isPriceStatement('me cuesta 20 mil'), false);
  assert.equal(isPriceStatement('vendí un perfume por 50 mil'), false);
  assert.equal(isPriceStatement('el perfume vale mucho'), false);
  assert.equal(isPriceStatement('se acabó el perfume'), false);
});

test('itemNamedIn solo responde si es uno y es un producto', () => {
  const list = [{ ref: 'a', name: 'Perfume', kind: 'product' as const }, { ref: 'b', name: 'Corte clásico', kind: 'product' as const }, { ref: 'c', name: 'Aceite', kind: 'supply' as const }];
  assert.equal(itemNamedIn('el perfume vale 50 mil', list)?.ref, 'a');
  assert.equal(itemNamedIn('el corte vale 50 mil', list), null);
  assert.equal(itemNamedIn('el aceite vale 50 mil', list), null);
  assert.equal(itemNamedIn('perfume y corte clásico valen 50 mil', list), null);
});

test('isMoneyTalk reconoce cuando se movió plata', () => {
  assert.equal(isMoneyTalk('vendí 3 pollos'), true);
  assert.equal(isMoneyTalk('le fié 20 mil a Jorge'), true);
  assert.equal(isMoneyTalk('30 pollos'), false);
  assert.equal(isMoneyTalk('se acabó el pollo'), false);
});

test('countFromWords lee cuánto hay', () => {
  assert.deepEqual(countFromWords('30 pollos'), { qty: 30, name: 'pollos' });
  assert.deepEqual(countFromWords('Hay 12 camisas'), { qty: 12, name: 'camisas' });
  assert.deepEqual(countFromWords('me quedan 3 unidades de jugo'), { qty: 3, name: 'jugo' });
  assert.equal(countFromWords('se acabó el pollo'), null);
  assert.equal(countFromWords('30'), null);
});

test('sameNameItem solo acepta el mismo nombre', () => {
  const list = [{ ref: 'a', name: 'Pollo', kind: 'product' as const }, { ref: 'b', name: 'Pollo asado', kind: 'product' as const }];
  assert.equal(sameNameItem('pollos', list)?.ref, 'a');
  assert.equal(sameNameItem('pollo asado', list)?.ref, 'b');
  assert.equal(sameNameItem('camisa', list), null);
});
