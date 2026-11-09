import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answerMany, askDraft, manyIntentOf, manySuggestions, sameItem, sameItemPeers, toRow, unknownMany } from './askMany.ts';
import type { MarketItem } from './offerMarket.ts';

function svc(p: Partial<MarketItem> & Pick<MarketItem, 'id' | 'entity_id'>): MarketItem {
  return { title: 'Corte clásico', type: 'service', ends_at: '', entity_name: 'N' + p.entity_id, category_name: 'Barbería', distance_meters: 500, kind: 'service', open_now: true, ...p } as MarketItem;
}

const lucho = svc({ id: '1', entity_id: 'L', entity_name: 'Don Lucho', service_price: 18000, duration_min: 30, distance_meters: 350, linked_offer_title: '2x1 los martes', open_until: '20:00' });
const navaja = svc({ id: '2', entity_id: 'N', entity_name: 'Navaja', service_price: 22000, duration_min: 40, distance_meters: 600 });
const norte = svc({ id: '3', entity_id: 'B', entity_name: 'Norte', service_price: null, distance_meters: 1000 });
const fino = svc({ id: '4', entity_id: 'F', entity_name: 'Corte Fino', service_price: 15000, duration_min: 25, distance_meters: 200, open_now: false });
const rows = [lucho, navaja, norte, fino].map(toRow);

test('mismo producto: mismas palabras, sin importar tildes, plural u orden', () => {
  assert.ok(sameItem('Corte clásico', 'cortes CLASICOS'));
  assert.ok(sameItem('Pizza hawaiana', 'Hawaiana pizza'));
  assert.ok(!sameItem('Corte clásico', 'Corte clásico + barba'), 'más palabras es otro producto');
  assert.ok(!sameItem('', ''));
});

test('pares: la ficha primero, uno por negocio, máximo 4, abiertos y cerca primero', () => {
  const dup = svc({ id: '9', entity_id: 'N', entity_name: 'Navaja', service_price: 1 });
  const other = svc({ id: '8', entity_id: 'X', title: 'Tinte' });
  const extra = svc({ id: '7', entity_id: 'Z', distance_meters: 50 });
  const peers = sameItemPeers(norte, [norte, navaja, dup, other, fino, lucho, extra]);
  assert.equal(peers[0], norte);
  assert.equal(peers.length, 4);
  assert.deepEqual(peers.map((p) => p.entity_id), ['B', 'Z', 'L', 'N'], 'el cerrado (Fino) queda fuera por el tope');
  assert.deepEqual(sameItemPeers({ ...lucho, kind: 'offer' }, [navaja]).length, 1, 'una oferta es de un solo negocio');
});

test('precio: rango real, la mejor opción abierta y a quién falta preguntarle', () => {
  const a = answerMany('price', rows, 'Corte clásico');
  assert.equal(a.summary.lead, '3 de 4 publicaron su precio: de $15.000 a $22.000. Abierto y más cerca: ');
  assert.equal(a.summary.bold, 'Don Lucho, $18.000');
  assert.equal(a.top?.row.name, 'Don Lucho', 'Fino está más cerca pero cerrado');
  assert.deepEqual(a.missing.map((r) => r.name), ['Norte']);
  assert.equal(a.rest.find((l) => l.row.name === 'Norte')?.main, null, 'nunca un precio inventado');
  assert.equal(a.rest.at(-1)?.row.name, 'Corte Fino', 'cerrado al final');
});

test('ninguno publicó el precio: lo dice y todos quedan para preguntar', () => {
  const a = answerMany('price', [norte, { ...navaja, service_price: null }].map(toRow), 'Corte clásico');
  assert.equal(a.top, null);
  assert.equal(a.missing.length, 2);
  assert.match(a.summary.lead, /Ninguno publicó/);
});

test('ofertas: solo quien tiene, y el precio normal aparte', () => {
  const a = answerMany('offers', rows, 'Corte clásico');
  assert.equal(a.summary.bold, 'Don Lucho');
  assert.match(a.summary.tail, /2x1 los martes.*precio normal va aparte/);
  assert.equal(a.rest.length, 0);
  assert.equal(a.missing.length, 0);
  assert.match(answerMany('offers', [navaja].map(toRow), 'Corte clásico').summary.lead, /Ninguno tiene una oferta/);
});

test('quién atiende y cuánto demora', () => {
  const o = answerMany('open', rows, 'Corte clásico');
  assert.equal(o.summary.lead, '3 atienden ahora. El más cerca es ');
  assert.equal(o.summary.tail, ', abierto hasta las 20:00.');
  const d = answerMany('duration', rows, 'Corte clásico');
  assert.equal(d.summary.lead, 'Entre 25 y 40 min según lo publicado. El más rápido abierto ahora: ');
  assert.equal(d.summary.bold, 'Don Lucho, 30 min', 'Fino es más rápido pero está cerrado');
  assert.deepEqual(d.missing.map((r) => r.name), ['Norte']);
});

test('sugerencias solo con lo que alguien puede responder', () => {
  assert.deepEqual(manySuggestions(rows), ['price', 'open', 'offers', 'duration']);
  assert.deepEqual(manySuggestions([toRow({ ...norte, open_now: undefined })]), ['offers']);
});

test('intenciones, desconocido y borradores', () => {
  assert.equal(manyIntentOf('hours'), 'open');
  assert.equal(manyIntentOf('delivery'), null);
  assert.equal(unknownMany(rows).missing.length, 4);
  assert.equal(askDraft('price', 'Corte clásico'), 'Hola, ¿cuánto cuesta Corte clásico?');
  assert.equal(askDraft('unknown', 'Corte clásico', '¿Atienden niños?'), 'Hola, ¿atienden niños? (sobre Corte clásico)');
});
