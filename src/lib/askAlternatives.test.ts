import assert from 'node:assert/strict';
import { test } from 'node:test';
import { areaAround, familyFor, noneTitle, pickAlternatives } from './askAlternatives.ts';

test('familyFor entiende la palabra dentro de la frase y sin tildes', () => {
  assert.equal(familyFor('pizzería')?.plural, 'pizzerías');
  assert.equal(familyFor('Estoy buscando una PIZZERIA')?.family, 'comida');
  assert.equal(familyFor('un cerrajero')?.plural, 'cerrajeros');
  assert.equal(familyFor('alquiler de trajes'), null);
});

test('familyFor no confunde el comienzo de otra palabra', () => {
  assert.equal(familyFor('desayunas'), null);
  assert.equal(familyFor('uñas')?.family, 'belleza');
});

test('noneTitle dice lo que falta sin repetir la frase', () => {
  assert.equal(noneTitle('pizzería', familyFor('pizzería')), 'Aún no hay pizzerías cerca');
  assert.equal(noneTitle('alquiler de trajes', null), 'Aún no hay «alquiler de trajes» cerca');
});

const fam = familyFor('pizzería')!;
const items = [
  { id: 'lejos', category_name: 'Restaurantes', is_open_now: true, has_active_offer: false, distance_meters: 900 },
  { id: 'cerrado', category_name: 'Restaurantes', is_open_now: false, has_active_offer: false, distance_meters: 100 },
  { id: 'cerca', category_name: 'Cafeterías, panaderías y postres', is_open_now: true, has_active_offer: false, distance_meters: 200 },
  { id: 'oferta', category_name: 'Restaurantes', is_open_now: true, has_active_offer: true, distance_meters: 400 },
  { id: 'otro', category_name: 'Automotriz', is_open_now: true, has_active_offer: true, distance_meters: 50 },
];

test('pickAlternatives solo trae la familia, separa ofertas y ordena por abierto y cercanía', () => {
  const r = pickAlternatives(items, fam, { open_now: false, with_offer: false });
  assert.deepEqual(r.offers.map((x) => x.id), ['oferta']);
  assert.deepEqual(r.rest.map((x) => x.id), ['cerca', 'lejos', 'cerrado']);
});

test('pickAlternatives respeta lo pedido y el límite', () => {
  assert.deepEqual(pickAlternatives(items, fam, { open_now: true, with_offer: false }).rest.map((x) => x.id), ['cerca', 'lejos']);
  assert.deepEqual(pickAlternatives(items, fam, { open_now: false, with_offer: true }).rest, []);
  const r = pickAlternatives(items, fam, { open_now: false, with_offer: false }, 1);
  assert.equal(r.offers.length + r.rest.length, 1);
});

test('areaAround encierra a la persona', () => {
  const a = areaAround(11.24, -74.2);
  assert.ok(a.min_lat < 11.24 && a.max_lat > 11.24 && a.min_lng < -74.2 && a.max_lng > -74.2);
});
