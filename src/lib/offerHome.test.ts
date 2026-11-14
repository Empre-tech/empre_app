import assert from 'node:assert/strict';
import { test } from 'node:test';

import { iconGroups, mostPopular, openLine } from './offerHome.ts';
import { artCounts, closeChip, hourLabel } from './offerHome.ts';

const art = (name: string) => (/jugo|almuerzo/i.test(name) ? 'comida' : /corte/i.test(name) ? 'barberia' : 'tienda') as never;

test('iconGroups junta categorías por ilustración y ordena por negocios cerca', () => {
  const cats = [
    { id: 'a', name: 'Jugos' },
    { id: 'b', name: 'Almuerzos' },
    { id: 'c', name: 'Cortes' },
    { id: 'd', name: 'Varios' },
  ];
  const g = iconGroups(cats, [{ category_id: 'c' }, { category_id: 'c' }, { category_id: 'a' }], art);
  assert.deepEqual(
    g.map((x) => [x.key, x.ids, x.near]),
    [
      ['barberia', ['c'], 2],
      ['comida', ['a', 'b'], 1],
      ['tienda', ['d'], 0],
    ],
  );
  assert.equal(iconGroups(cats, [], art, 2).length, 2);
});

test('mostPopular no inventa ranking sin reseñas', () => {
  assert.deepEqual(mostPopular([{ id: '1', avg_rating: 4.5, review_count: 3 }, { id: '2', avg_rating: 0, review_count: 0 }]), []);
  const r = mostPopular([
    { id: '1', avg_rating: 5, review_count: 1 },
    { id: '2', avg_rating: 4.6, review_count: 120 },
    { id: '3', avg_rating: 4.8, review_count: 40 },
  ]);
  assert.deepEqual(
    r.map((x) => [x.item.id, x.rank]),
    [
      ['2', 1],
      ['3', 2],
      ['1', 3],
    ],
  );
});

test('openLine', () => {
  assert.equal(openLine({ is_open_now: true, closes_at: '21:00' }), 'Abierto hasta 9 pm');
  assert.equal(openLine({ is_open_now: true, closes_at: '09:30' }), 'Abierto hasta 9:30 am');
  assert.equal(openLine({ is_open_now: true, closes_at: '24h' }), 'Abierto 24 h');
  assert.equal(openLine({ is_open_now: false }), 'Cerrado ahora');
});

test('resultados por negocio: solo lo que coincide, abiertos y cerca primero', async () => {
  const { groupResults, matchesQuery, untilLabel } = await import('./offerHome.ts');
  assert.ok(matchesQuery('Jugo de mora', 'jugos'));
  assert.ok(matchesQuery('Mojarra frita', 'mojarra'));
  assert.ok(!matchesQuery('Café con leche', 'jugo'));
  const it = (id: string, e: string, title: string, o: Record<string, unknown> = {}) => ({ id, entity_id: e, entity_name: 'N' + e, title, ...o });
  const g = groupResults(
    [
      it('1', 'A', 'Jugo de lulo', { open_now: false, distance_meters: 100 }),
      it('2', 'B', 'Jugo de mora', { open_now: true, distance_meters: 500 }),
      it('3', 'B', 'Café con leche', { open_now: true, distance_meters: 500 }),
      it('ask-9', 'C', 'Limonada natural', { open_now: true, distance_meters: 300 }),
      it('4', 'B', 'Jugo de mora', { open_now: true, distance_meters: 500 }),
    ],
    'jugo',
  );
  assert.deepEqual(g.map((x) => [x.entityId, x.items.map((i) => i.id)]), [['C', ['ask-9']], ['B', ['2']], ['A', ['1']]]);
  assert.equal(untilLabel('21:00'), 'hasta 9 pm');
  assert.equal(untilLabel('09:30'), 'hasta 9:30 am');
});

test('sedes del mismo negocio en una sola fila', async () => {
  const { mergeBranches } = await import('./offerHome.ts');
  const menu = [{ name: 'Mojarra frita' }, { name: 'Arroz con coco' }, { name: 'Patacones' }];
  const r = mergeBranches([
    { biz: { name: 'El Rincón Samario Mamatoco' }, items: menu },
    { biz: { name: 'El Rincón Samario' }, items: menu },
    { biz: { name: 'El Rincón del Sabor' }, items: [{ name: 'Bandeja paisa' }] },
  ]);
  assert.deepEqual(r.map((x) => [x.biz.name, x.branches]), [['El Rincón Samario Mamatoco', 2], ['El Rincón del Sabor', 1]]);
});

test('closeChip avisa cuándo cierra y en rojo si falta una hora o menos', () => {
  const at = (h: number, m: number) => new Date(2026, 10, 14, h, m).getTime();
  assert.deepEqual(closeChip('21:00', at(17, 20)), { text: 'Cierra 9 pm', soon: false });
  assert.deepEqual(closeChip('18:00', at(17, 20)), { text: 'Cierra en 40 min', soon: true });
  assert.deepEqual(closeChip('00:30', at(23, 50)), { text: 'Cierra en 40 min', soon: true });
  assert.deepEqual(closeChip('24h', at(12, 0)), { text: 'Abierto 24 h', soon: false });
  assert.equal(closeChip(undefined, at(12, 0)), null);
});

test('hourLabel dice la hora corta', () => {
  assert.equal(hourLabel(new Date(2026, 10, 14, 18, 0).toISOString()), '6 pm');
  assert.equal(hourLabel(new Date(2026, 10, 14, 9, 30).toISOString()), '9:30 am');
  assert.equal(hourLabel('no es fecha'), null);
});

test('artCounts junta por dibujo, cuenta negocios y no repite dibujos', () => {
  const art = (name: string) => (/jugo|almuerzo/i.test(name) ? 'comida' : /corte/i.test(name) ? 'barberia' : 'tienda') as never;
  const r = artCounts(
    [
      { category_id: 'a', category_name: 'Jugos' },
      { category_id: 'b', category_name: 'Almuerzos' },
      { category_id: 'b', category_name: 'Almuerzos' },
      { category_id: 'c', category_name: 'Cortes' },
    ],
    art,
  );
  assert.deepEqual(r.map((x) => [x.key, x.label, x.ids, x.count]), [['comida', 'Comida', 'a,b', 3], ['barberia', 'Barbería', 'c', 1]]);
  assert.deepEqual(artCounts([], art), []);
});
