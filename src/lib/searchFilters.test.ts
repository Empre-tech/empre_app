import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeCount, applyFilters, fromAsk, NO_FILTERS, quickChips, resultsTitle, seeLabel, sheetSections, toAsk, toggleQuick, type Filterable, type SearchFilters } from './searchFilters.ts';

const ALL = { rating: true, cheap: true, distance: true };
const ASK = { rating: false, cheap: true, distance: true };

interface P extends Filterable {
  name: string;
}
const places: P[] = [
  { name: 'Fogón', open: true, meters: 320, offer: true, delivery: true, verified: true, group: 'comer', rating: 4.7, price: 15000 },
  { name: 'Toño', open: true, meters: 560, offer: true, delivery: false, verified: false, group: 'comer', rating: 4.4, price: 8000 },
  { name: 'Lucho', open: true, meters: 400, offer: true, delivery: false, verified: true, group: 'salud', rating: 4.8, price: null },
  { name: 'Pan', open: false, meters: 960, offer: true, delivery: false, verified: false, group: 'comer', rating: null, price: 3000 },
  { name: 'Sin horario', open: null, meters: null, offer: false, delivery: true, verified: false, group: 'compras' },
];
const names = (f: SearchFilters) => applyFilters(places, f, (p) => p).map((p) => p.name);

test('filtrar: cada condición, sin inventar lo que no se sabe', () => {
  assert.deepEqual(names(NO_FILTERS), ['Fogón', 'Toño', 'Lucho', 'Pan', 'Sin horario'], 'sin filtros, el orden que vino');
  assert.deepEqual(names({ ...NO_FILTERS, open: true }), ['Fogón', 'Toño', 'Lucho'], 'sin horario no se afirma que está abierto');
  assert.deepEqual(names({ ...NO_FILTERS, walk: 5 }), ['Fogón', 'Lucho'], '5 min a pie son 400 m: entra hasta 400 justo');
});

test('distancia: 5 min son 400 m, y sin distancia no pasa', () => {
  assert.deepEqual(names({ ...NO_FILTERS, walk: 10 }), ['Fogón', 'Toño', 'Lucho']);
  assert.ok(!names({ ...NO_FILTERS, walk: 15 }).includes('Sin horario'));
});

test('ordenar: mejor valorados y más económico, sin datos al final', () => {
  assert.deepEqual(names({ ...NO_FILTERS, sort: 'rating' }), ['Lucho', 'Fogón', 'Toño', 'Pan', 'Sin horario']);
  assert.deepEqual(names({ ...NO_FILTERS, sort: 'cheap' }), ['Pan', 'Toño', 'Fogón', 'Lucho', 'Sin horario']);
  assert.deepEqual(names({ ...NO_FILTERS, group: 'comer', offer: true, verified: true }), ['Fogón']);
});

test('filtros rápidos y cuenta', () => {
  assert.deepEqual(quickChips(NO_FILTERS, ALL).map((c) => c.label), ['Abierto ahora', 'Cerca', 'Con oferta', 'Domicilio', 'Tipo']);
  assert.deepEqual(quickChips(NO_FILTERS, { ...ALL, distance: false }).map((c) => c.key), ['open', 'offer', 'delivery', 'group'], 'sin ubicación no hay «Cerca»');
  const f = toggleQuick(toggleQuick(NO_FILTERS, 'walk'), 'open');
  assert.equal(f.walk, 10);
  assert.equal(quickChips({ ...f, group: 'salud' }, ALL, 'Belleza y salud').find((c) => c.key === 'group')?.label, 'Belleza y salud');
  assert.equal(activeCount({ ...f, sort: 'rating' }), 3);
  assert.equal(toggleQuick(f, 'walk').walk, null);
});

test('la hoja solo ofrece lo que se puede filtrar', () => {
  const groups = [{ id: 'comer' as const, name: 'Comer y beber' }];
  const ask = sheetSections(NO_FILTERS, ASK, groups);
  assert.deepEqual(ask.map((s) => s.title), ['Ordenar', 'Qué tan cerca', 'Qué tipo de negocio', 'Lo que necesitas']);
  assert.deepEqual(ask[0].options.map((o) => o.label), ['Más cerca', 'Más económico'], 'sin calificaciones no hay «Mejor valorados»');
  assert.ok(!JSON.stringify(ask).includes('reservar'), 'sin ese dato no se ofrece');
  const noLoc = sheetSections(NO_FILTERS, { rating: false, cheap: false, distance: false }, []);
  assert.deepEqual(noLoc.map((s) => s.title), ['Lo que necesitas'], 'sin nada que ordenar ni distancia, solo lo que se necesita');
  const w = ask[1].options.find((o) => o.id === 'w5');
  assert.equal(w?.apply(NO_FILTERS).walk, 5);
  assert.equal(w?.apply({ ...NO_FILTERS, walk: 5 }).walk, null, 'tocar de nuevo lo quita');
});

test('títulos y botón', () => {
  assert.equal(resultsTitle(3, NO_FILTERS, ALL), '3 lugares · más cerca primero');
  assert.equal(resultsTitle(1, { ...NO_FILTERS, sort: 'cheap' }, ALL), '1 lugar · más económicos primero');
  assert.equal(resultsTitle(0, NO_FILTERS, ALL), 'Sin lugares');
  assert.equal(seeLabel(0), 'Nada con estos filtros');
  assert.equal(seeLabel(7), 'Ver 7 lugares');
});

test('ida y vuelta con los filtros del servidor de Pregúntale', () => {
  const f: SearchFilters = { ...NO_FILTERS, open: true, offer: true, sort: 'cheap', walk: 10 };
  assert.deepEqual(toAsk(f), { open_now: true, with_offer: true, delivery: false, cheapest: true });
  const back = fromAsk({ open_now: false, with_offer: false, delivery: true, cheapest: false }, f);
  assert.equal(back.walk, 10, 'lo que el servidor no conoce se mantiene');
  assert.equal(back.sort, 'near');
  assert.equal(back.delivery, true);
});
