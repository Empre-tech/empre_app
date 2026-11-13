import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attrGroups, filterCatalog, kindChips, matchesAttrs, pickVariant, type ItemAttr } from './catalog.ts';

const v = (id: string, talla: string, color: string, sold_out = false) => ({
  id,
  name: `Tenis de lona · ${talla} · ${color}`,
  description: '',
  section: 'Tenis',
  sold_out,
  attrs: [
    { name: 'Talla', value: talla },
    { name: 'Color', value: color },
  ] as ItemAttr[],
});

const tenis = [v('a', '40', 'Vinotinto'), v('b', '41', 'Vinotinto', true), v('c', '40', 'Gris'), v('d', '41', 'Gris')];

test('los atributos del catálogo salen como filtros, con conteo y si queda alguno', () => {
  const g = attrGroups(tenis);
  assert.deepEqual(g.map((x) => x.name), ['Talla', 'Color']);
  assert.deepEqual(g[0].values.map((x) => [x.value, x.count]), [['40', 2], ['41', 2]]);
  assert.equal(g[0].values[1].available, true, 'la 41 gris sigue disponible');
  assert.deepEqual(attrGroups([{ attrs: [{ name: 'talla', value: '38' }] }, { attrs: [{ name: 'Talla', value: '38', }], sold_out: true }])[0].values, [
    { value: '38', count: 2, available: true },
  ]);
  assert.deepEqual(attrGroups([{}, { attrs: [] }]), [], 'sin atributos no hay filtros');
});

test('filtrar por atributo exige todos los elegidos', () => {
  assert.deepEqual(tenis.filter((t) => matchesAttrs(t, { Talla: '40' })).map((t) => t.id), ['a', 'c']);
  assert.deepEqual(tenis.filter((t) => matchesAttrs(t, { talla: '40', Color: 'Gris' })).map((t) => t.id), ['c']);
  assert.equal(matchesAttrs({}, { Talla: '40' }), false, 'lo que no tiene talla no pasa');
  assert.equal(matchesAttrs({}, {}), true);
});

test('la búsqueda del catálogo encuentra por atributo', () => {
  assert.deepEqual(filterCatalog(tenis, 'vinotinto', '').map((t) => t.id), ['a', 'b']);
  assert.deepEqual(filterCatalog(tenis, 'color gris', '').map((t) => t.id), ['c', 'd']);
});

test('servicios y productos: se elige solo si el negocio tiene los dos', () => {
  assert.deepEqual(kindChips([{ kind: 'service' }, { kind: 'service' }]), []);
  assert.deepEqual(
    kindChips([{ kind: 'service' }, { kind: 'product' }, { kind: 'service' }]).map((c) => [c.label, c.count]),
    [['Todo', 3], ['Servicios', 2], ['Productos', 1]],
  );
});

test('al tocar una talla se conserva el color elegido', () => {
  assert.equal(pickVariant(tenis, tenis[2], 'Talla', '41')?.id, 'd', 'gris 40 → gris 41');
  assert.equal(pickVariant(tenis, tenis[0], 'Color', 'Gris')?.id, 'c', 'vinotinto 40 → gris 40');
  assert.equal(pickVariant(tenis, { attrs: [{ name: 'Color', value: 'Azul' }] }, 'Talla', '41')?.id, 'd', 'sin igual, la primera que hay');
  assert.equal(pickVariant(tenis, tenis[0], 'Talla', '44'), undefined);
});

test('el dueño escribe la variante como la diría', async () => {
  const { parseVariantInput } = await import('./catalog.ts');
  assert.deepEqual(parseVariantInput('Talla 40, Color vinotinto'), { label: '', attrs: [{ name: 'Talla', value: '40' }, { name: 'Color', value: 'Vinotinto' }] });
  assert.deepEqual(parseVariantInput('talla: 38 y tamano grande').attrs, [{ name: 'Talla', value: '38' }, { name: 'Tamaño', value: 'Grande' }]);
  assert.deepEqual(parseVariantInput('41 gris', ['Talla', 'Color']).attrs, [{ name: 'Talla', value: '41' }, { name: 'Color', value: 'Gris' }]);
  assert.deepEqual(parseVariantInput('Chocolate'), { label: 'Chocolate', attrs: [] });
  assert.deepEqual(parseVariantInput('Chocolate, Talla M'), { label: 'Chocolate, Talla M', attrs: [] }, 'mezclado: queda como nombre');
});

test('lo que el dueño registró se vuelve búsqueda', async () => {
  const { searchTerms } = await import('./catalog.ts');
  assert.deepEqual(
    searchTerms({ name: 'Tenis de lona', section: 'Tenis', audience: [] }, [{ name: 'Color', value: 'Vinotinto' }, { name: 'Talla', value: '40' }]),
    ['tenis', 'lona', 'vinotinto', 'talla 40'],
  );
});

test('los filtros rápidos solo salen si parten la lista', async () => {
  const { quickFilters } = await import('./catalog.ts');
  const it = (price: number, duration_min: number) => ({ price, duration_min });
  assert.deepEqual(quickFilters([it(12000, 15), it(18000, 25), it(22000, 35), it(30000, 45)]), { maxPrice: 20000, maxMin: 30 });
  assert.deepEqual(quickFilters([it(12000, 15), it(18000, 25)]), { maxPrice: null, maxMin: null }, 'con poco no hay filtro');
  assert.deepEqual(quickFilters([it(10000, 20), it(10000, 20), it(10000, 20), it(10000, 20)]).maxPrice, null, 'todos iguales no se parten');
});
