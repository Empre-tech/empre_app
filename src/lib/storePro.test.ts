import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coverageLine, pesos, suggestedTier, tierChange, tierOfProduct, tierPriceCOP, toggleCoverage } from './storePro.ts';

test('storePro: productos, precios y nivel sugerido', () => {
  assert.equal(tierOfProduct('empre_pro_2:mensual'), 2);
  assert.equal(tierOfProduct('EMPRE_PRO_1'), 1);
  assert.equal(tierOfProduct('empre_plus'), 0);
  assert.equal(tierOfProduct(null), 0);
  assert.deepEqual([1, 2, 3].map(tierPriceCOP), [39900, 59850, 79800]);
  assert.equal(pesos(59850), '$59.850');
  assert.deepEqual([0, 1, 2, 5].map(suggestedTier), [1, 1, 2, 3]);
});

test('storePro: cambiar de nivel y elegir negocios', () => {
  assert.equal(tierChange(0, 1, false), 'buy');
  assert.equal(tierChange(1, 2, true), 'upgrade');
  assert.equal(tierChange(2, 1, true), 'downgrade');
  assert.equal(tierChange(2, 2, true), 'same');
  assert.equal(tierChange(2, 1, false), 'buy');
  assert.deepEqual(toggleCoverage(['a'], 'b', 1), ['b']);
  assert.deepEqual(toggleCoverage(['a'], 'b', 2), ['a', 'b']);
  assert.deepEqual(toggleCoverage(['a', 'b'], 'c', 2), ['b', 'c']);
  assert.deepEqual(toggleCoverage(['a', 'b'], 'a', 2), ['b']);
  assert.match(coverageLine({ active: true, tier: 2, covered: true, legacy: false }), /Pro · 2 negocios/);
  assert.match(coverageLine({ active: false, tier: 0, covered: false, legacy: false }), /Base/);
});
