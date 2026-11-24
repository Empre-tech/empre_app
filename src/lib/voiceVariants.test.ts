import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickVariant, withVariantChoices } from './voiceVariants.ts';

const items = [
  { kind: 'product' as const, ref: 'top', name: 'Top', price: 100000, variants: 2 },
  { kind: 'product' as const, ref: 'top-s', name: 'Top · S', price: null, parent_id: 'top', variant_label: 'S', status: 'ok' },
  { kind: 'product' as const, ref: 'top-xl', name: 'Top · XL', price: 120000, parent_id: 'top', variant_label: 'XL', status: 'out' },
  { kind: 'product' as const, ref: 'gorra', name: 'Gorra', price: 30000 },
];

test('withVariantChoices: «un top» pregunta la talla; con la talla o sin variantes, no', () => {
  const [top] = withVariantChoices([{ name: 'top', qty: 1 }], items);
  assert.deepEqual(top.choose?.map((c) => [c.label, c.price, c.out]), [['S', 100000, false], ['XL', 120000, true]]);
  const [byId] = withVariantChoices([{ name: 'Top', qty: 1, item_id: 'top' }], items);
  assert.equal(byId.choose?.length, 2);
  const [said] = withVariantChoices([{ name: 'Top · S', qty: 1, item_id: 'top-s' }], items);
  assert.equal(said.choose, undefined);
  const [gorra] = withVariantChoices([{ name: 'gorra', qty: 1 }], items);
  assert.equal(gorra.choose, undefined);
});

test('pickVariant: queda la talla con su precio, o el del producto', () => {
  const [top] = withVariantChoices([{ name: 'top', qty: 2 }], items);
  const s = pickVariant(top, top.choose![0]);
  assert.deepEqual(s, { name: 'Top · S', qty: 2, item_id: 'top-s', unit_price: 100000, from_catalog: true });
});

import { sortVariants, visibleVariants } from './voiceVariants.ts';

test('sortVariants: XS, S, M, L, XL y los números en orden', () => {
  assert.deepEqual(sortVariants([{ label: 'XL' }, { label: 'S' }, { label: 'Talla M' }, { label: 'XS' }]).map((v) => v.label), ['XS', 'S', 'Talla M', 'XL']);
  assert.deepEqual(sortVariants([{ label: '42' }, { label: '38' }, { label: 'Rojo' }, { label: '40' }]).map((v) => v.label), ['38', '40', '42', 'Rojo']);
});

test('visibleVariants: primero las que hay, hasta 8; si todas están agotadas, se muestran', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ label: String(30 + i), out: i === 0 }));
  const first = visibleVariants(many, false);
  assert.equal(first.shown.length, 8);
  assert.equal(first.shown[0].label, '31');
  assert.equal(first.hidden, 4);
  assert.equal(visibleVariants([{ out: true }, { out: true }], false).shown.length, 2);
});
