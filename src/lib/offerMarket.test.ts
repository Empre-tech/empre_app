import assert from 'node:assert/strict';
import { test } from 'node:test';

test('con pocas ofertas, el barrio vecino es el más cercano que no es donde estás ni el que ves', async () => {
  const { nearestOtherZone } = await import('./offerMarket.ts');
  const z = (id: string, d: number | null, here = false) => ({ id, name: id, distance_meters: d, here, looks: [] });
  const zones = [z('centro', 0, true), z('taganga', 1800), z('rodadero', 900), z('lejos', null)];
  assert.equal(nearestOtherZone(zones)?.id, 'rodadero');
  assert.equal(nearestOtherZone(zones, ['rodadero'])?.id, 'taganga', 'si ya ves El Rodadero, el siguiente');
  assert.equal(nearestOtherZone([z('centro', 0, true), z('lejos', null)]), null, 'sin distancia no se adivina');
});

test('la portada de Ofertas va por secciones, sin repetir oferta ni foto', async () => {
  const { offerSections, benefitOf } = await import('./offerMarket.ts');
  const now = Date.parse('2026-11-13T12:00:00');
  const hoy = '2026-11-13T20:00:00';
  const luego = '2026-11-15T20:00:00';
  const o = (id: string, title: string, price: string, ends_at: string, photo: string, extra = {}) => ({ id, entity_id: 'e' + id, title, type: 'DIA', ends_at, price, entity_name: 'N', category_name: 'C', distance_meters: 100, photo, ...extra });
  assert.equal(benefitOf({ title: 'Jugo 2x1', price: '' }), 'multi');
  assert.equal(benefitOf({ title: 'Pizza', price: '2 por $18.000' }), 'multi');
  assert.equal(benefitOf({ title: 'Tenis -30%', price: '$119.000' }), 'percent');
  const list = [
    o('a', 'Hamburguesa', '$17.000', hoy, 'f1'), o('b', 'Café', '$4.800', hoy, 'f2'),
    o('c', 'Jugo 2x1', '', luego, 'f3'), o('d', 'Pizza', '2 por $18.000', luego, 'f4'),
    o('e', 'Tenis -30%', '$119.000', luego, 'f5'), o('f', 'Reloj -25%', '$89.000', luego, 'f5'),
    o('g', 'Corte', '$15.000', luego, 'f6'),
  ];
  const s = offerSections(list as never, now);
  assert.deepEqual(s.map((x) => x.key), ['hoy', 'multi'], 'descuentos queda con 1 (la foto f5 ya estaba) y no sale; precio con 1 tampoco');
  assert.deepEqual(s[0].items.map((x) => x.id), ['a', 'b']);
});

test('lo que venden cerca se mezcla por negocio y no repite foto', async () => {
  const { nearbyWall } = await import('./offerMarket.ts');
  const it = (id: string, entityId: string, photo?: string) => ({ id, entityId, photo });
  const wall = nearbyWall([[it('a1', 'A', 'p1'), it('a2', 'A', 'p2'), it('a3', 'A', 'p1')], [it('b1', 'B', 'p3'), it('b2', 'B')]]);
  assert.deepEqual(wall.map((x) => x.id), ['a1', 'b1', 'a2']);
});
