import assert from 'node:assert/strict';
import { test } from 'node:test';
import { audienceChips, audienceText, catalogGroups, itemsInSection, matchesAudience, sectionChips } from './catalog.ts';

const it = (name: string, section: string) => ({ name, section });

test('sigue el orden de las secciones del negocio y deja «Otros» al final', () => {
  const items = [it('Frito', 'Otros'), it('Gaseosa', 'Bebidas'), it('Azúcar', 'Granos y abarrotes'), it('Agua', 'Bebidas')];
  const g = catalogGroups(items, ['Granos y abarrotes', 'Bebidas', 'Otros']);
  assert.deepEqual(
    g.map((x) => [x.section, x.items.length]),
    [
      ['Granos y abarrotes', 1],
      ['Bebidas', 2],
      ['Otros', 1],
    ],
  );
});

test('una sola sección: una lista sin título', () => {
  const g = catalogGroups([it('Gaseosa', 'Bebidas'), it('Agua', 'Bebidas')], ['Bebidas']);
  assert.equal(g.length, 1);
  assert.equal(g[0].section, '');
});

test('las secciones como filtros, en el orden del negocio', () => {
  const items = [it('Frito', 'Otros'), it('Gaseosa', 'Bebidas'), it('Azúcar', 'Granos'), it('Agua', 'Bebidas')];
  const order = ['Granos', 'Bebidas'];
  assert.deepEqual(sectionChips(items, order), [
    { section: 'Granos', count: 1 },
    { section: 'Bebidas', count: 2 },
    { section: 'Otros', count: 1 },
  ]);
  assert.deepEqual(
    itemsInSection(items, '', order).map((i) => i.name),
    ['Azúcar', 'Gaseosa', 'Agua', 'Frito'],
  );
  assert.deepEqual(
    itemsInSection(items, 'Bebidas', order).map((i) => i.name),
    ['Gaseosa', 'Agua'],
  );
  assert.deepEqual(sectionChips([it('a', 'Bebidas')]), []);
});

test('para quién: Hombre y Mujer incluyen lo unisex', () => {
  assert.equal(matchesAudience(['unisex'], 'men'), true);
  assert.equal(matchesAudience(['unisex'], 'kids'), false);
  assert.equal(matchesAudience(['women'], 'men'), false);
  assert.equal(matchesAudience(undefined, null), true);
  assert.equal(audienceText(['women', 'men']), 'Hombre, Mujer');
  const items = [{ audience: ['men'] }, { audience: ['unisex'] }, { audience: ['kids'] }, { audience: [] }];
  assert.deepEqual(
    audienceChips(items).map((c) => [c.label, c.count]),
    [
      ['Hombre', 2],
      ['Mujer', 1],
      ['Niños', 1],
    ],
  );
  assert.deepEqual(audienceChips([{ audience: [] }, {}]), []);
});

test('tarjetas cuando al menos la mitad tiene foto', async () => {
  const { prefersCards, withoutPhoto } = await import('./catalog.ts');
  const con = { photos: ['a'] };
  const sin = { photos: [] };
  assert.equal(prefersCards([con, sin]), true);
  assert.equal(prefersCards([con, sin, sin]), false);
  assert.equal(prefersCards([]), false);
  assert.equal(withoutPhoto([{ photos: [] }, { photos: ['x'] }, { photos: [], parent_id: 'p' }]).length, 1);
});

test('una sección se encuentra aunque sea la única que queda con el filtro', () => {
  const items = [
    { name: 'Camiseta', section: 'Camisetas', audience: ['women'] },
    { name: 'Polo', section: 'Camisetas', audience: ['men'] },
    { name: 'Zapatos', section: 'Calzado', audience: ['women'] },
  ];
  const hombre = items.filter((i) => matchesAudience(i.audience, 'men'));
  assert.deepEqual(
    itemsInSection(hombre, 'Camisetas', ['Camisetas', 'Calzado']).map((i) => i.name),
    ['Polo'],
  );
});

test('las secciones no desaparecen al filtrar por «Para»', () => {
  const items = [
    { name: 'Camiseta', section: 'Camisetas', audience: ['women'] },
    { name: 'Polo', section: 'Camisetas', audience: ['men'] },
    { name: 'Zapatos', section: 'Calzado', audience: ['men'] },
  ];
  const mujer = items.filter((i) => matchesAudience(i.audience, 'women'));
  assert.deepEqual(sectionChips(items, ['Camisetas', 'Calzado'], mujer), [
    { section: 'Camisetas', count: 1 },
    { section: 'Calzado', count: 0 },
  ]);
});
