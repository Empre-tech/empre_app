import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildZoneSlides, groupByNamedBarrio, inCircle, movesToday, type ZoneBiz } from './zoneShowcase.ts';

const biz = (id: string, name: string, cat: string, open: boolean, photo = true, lat = 11.24, lng = -74.21): ZoneBiz => ({
  id,
  name,
  category_name: cat,
  is_open_now: open,
  latitude: lat,
  longitude: lng,
  photos: photo ? [`m/${id}.jpg`] : [],
});

test('inCircle deja los que caen en el radio de la zona', () => {
  const centro = { latitude: 11.2408, longitude: -74.211 };
  const items = [biz('a', 'A', 'Comida', true, true, 11.2410, -74.2112), biz('b', 'B', 'Comida', true, true, 11.2058, -74.2271)];
  assert.deepEqual(inCircle(items, centro, 1200).map((b) => b.id), ['a']);
});

test('groupByNamedBarrio junta por el barrio del nombre', () => {
  const g = groupByNamedBarrio([biz('a', 'Helados del Mar Mamatoco', 'Heladería', true), biz('b', 'Farma Caribe Mamatoco', 'Droguería', true), biz('c', 'Casa Canoas', 'Comida', true)], ['Mamatoco']);
  assert.deepEqual([...g.keys()], ['Mamatoco']);
  assert.deepEqual(g.get('Mamatoco')?.map((b) => b.id), ['a', 'b']);
});

test('movesToday: las dos categorías más comunes entre los abiertos', () => {
  const items = [biz('a', 'A', 'Barbería', true), biz('b', 'B', 'Barbería', true), biz('c', 'C', 'Comida típica', true), biz('d', 'D', 'Ropa', false), biz('e', 'E', 'Ropa', false), biz('f', 'F', 'Ropa', false)];
  assert.equal(movesToday(items), 'Hoy se mueve: barbería y comida típica');
  // Sin abiertos, dice lo que hay
  assert.equal(movesToday([biz('d', 'D', 'Ropa', false)]), 'Aquí hay: ropa');
  assert.equal(movesToday([]), null);
});

test('buildZoneSlides: donde estás primero, luego por abiertos; la foto de arriba no se repite abajo', () => {
  const slides = buildZoneSlides([
    { key: 'rod', name: 'El Rodadero', items: [biz('r1', 'R1', 'Comida', true), biz('r2', 'R2', 'Comida', true), biz('r3', 'R3', 'Surf', true), biz('r4', 'R4', 'Helados', true), biz('r5', 'R5', 'Helados', false)] },
    { key: 'cen', name: 'Centro Histórico', here: true, items: [biz('c1', 'C1', 'Barbería', false, false), biz('c2', 'C2', 'Comida', true), biz('c3', 'C3', 'Postres', true)] },
    { key: 'tag', name: 'Taganga', items: [biz('t1', 'T1', 'Buceo', true)] },
  ]);
  assert.deepEqual(slides.map((s) => s.key), ['cen', 'rod']); // Taganga con un solo negocio no sale
  const cen = slides[0];
  assert.equal(cen.hero.id, 'c2'); // abierto y con foto
  assert.ok(!cen.examples.some((b) => b.id === cen.hero.id));
  assert.equal(slides[1].examples.length, 3);
  assert.equal(slides[1].count, 5);
});

test('buildZoneSlides respeta el máximo', () => {
  const g = (k: string) => ({ key: k, name: k, items: [biz(`${k}1`, 'x', 'Comida', true), biz(`${k}2`, 'y', 'Comida', true)] });
  assert.equal(buildZoneSlides([g('a'), g('b'), g('c'), g('d'), g('e'), g('f')], 5).length, 5);
});
