import assert from 'node:assert/strict';
import { test } from 'node:test';
import { catalogCopy, defaultItemKind, listTitle, publicCatalog } from './catalog.ts';

test('cada tipo de negocio pide lo que le corresponde', () => {
  assert.equal(catalogCopy('Mercado y tienda').kind, 'shop');
  assert.equal(catalogCopy('Comida y restaurantes').kind, 'food');
  assert.equal(catalogCopy('Panadería, café y postres').kind, 'food');
  assert.equal(catalogCopy('Belleza').kind, 'service');
  assert.equal(catalogCopy('Salud y bienestar').kind, 'service');
  assert.equal(catalogCopy(null).kind, 'service'); // lo desconocido conserva el comportamiento de siempre
});

test('una tienda habla de productos, no de servicios', () => {
  const c = catalogCopy('Mercado y tienda');
  assert.equal(c.one, 'producto');
  assert.equal(c.plural, 'productos');
});

test('lo que se vende sale del tipo guardado, no del nombre', () => {
  // Un restaurante que el dueño marcó como tienda pide productos de tienda.
  assert.equal(catalogCopy('Comida y restaurantes', 'shop').kind, 'shop');
  assert.equal(catalogCopy('Comida y restaurantes', 'shop').one, 'producto');
  // Si el nombre coincide con el tipo, se conservan sus textos finos.
  assert.equal(catalogCopy('Panadería, café y postres', 'food').plural, 'productos');
  // Una categoría renombrada o nueva funciona igual con su tipo.
  assert.equal(catalogCopy('Sabores de la casa', 'food').kind, 'food');
  assert.equal(catalogCopy('Barbería', 'service').kind, 'service');
  assert.equal(catalogCopy('Joyería fina', 'valuable').kind, 'shop');
  // «other» no impone: usa los textos por nombre o los genéricos.
  assert.equal(catalogCopy('Mercado y tienda', 'other').kind, 'shop');
});

test('la lista se nombra según lo que hay', () => {
  const peluqueria = catalogCopy('Belleza', 'service');
  assert.equal(defaultItemKind(peluqueria), 'service');
  assert.equal(defaultItemKind(catalogCopy('Comida y restaurantes', 'food')), 'product');
  assert.equal(listTitle([{ kind: 'service' }], peluqueria), 'Servicios');
  assert.equal(listTitle([{ kind: 'service' }, { kind: 'product' }], peluqueria), 'Servicios y productos');
  assert.equal(listTitle([{ kind: 'product' }], peluqueria), 'Productos');
  assert.equal(listTitle([{ kind: 'product' }], catalogCopy('Comida y restaurantes', 'food')), 'Carta');
  assert.equal(listTitle([], catalogCopy('Mercado y tienda', 'shop')), 'Productos');
});

test('el público ve las variantes, no el producto que las agrupa', () => {
  const list = publicCatalog([{ id: 'p' }, { id: 'a', parent_id: 'p' }, { id: 'b', parent_id: 'p' }, { id: 'x' }]);
  assert.deepEqual(list.map((i) => i.id), ['a', 'b', 'x']);
});
