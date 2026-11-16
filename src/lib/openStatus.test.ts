import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStatus, shortClock } from './openStatus.ts';
import { oneListWhenFew } from './fewBusinesses.ts';

const at = (h: number, m = 0) => new Date(2026, 10, 16, h, m).getTime();

test('shortClock', () => {
  assert.equal(shortClock('20:00'), '8 pm');
  assert.equal(shortClock('20:30'), '8:30 pm');
  assert.equal(shortClock('00:00'), '12 am');
  assert.equal(shortClock('12:15'), '12:15 pm');
});

test('openStatus dice lo mismo en Inicio y en Finder', () => {
  assert.deepEqual(openStatus(true, '22:00', at(18)), { text: 'Abierto · cierra 10 pm', soon: false, open: true });
  assert.deepEqual(openStatus(true, '19:00', at(18, 20)), { text: 'Cierra en 40 min', soon: true, open: true });
  assert.deepEqual(openStatus(true, '02:00', at(23)), { text: 'Abierto · cierra 2 am', soon: false, open: true });
  assert.deepEqual(openStatus(true, '24h', at(3)), { text: 'Abierto 24 h', soon: false, open: true });
  assert.deepEqual(openStatus(true, null, at(9)), { text: 'Abierto', soon: false, open: true });
  assert.deepEqual(openStatus(false, '22:00', at(9)), { text: 'Cerrado', soon: false, open: false });
  assert.equal(openStatus(null, '22:00', at(9)), null);
});

test('oneListWhenFew junta las secciones con pocos negocios, cada uno una vez', () => {
  const it = (id: string) => ({ entity_id: id });
  const secs = [
    { id: 'offers', title: 'Con oferta', items: [it('a'), it('b')] },
    { id: 'open', title: 'Abierto ahora', items: [it('a'), it('c'), it('b')] },
    { id: 'new', title: 'Nuevos', items: [it('d'), it('c')] },
  ];
  const one = oneListWhenFew(secs, 5);
  assert.equal(one.length, 1);
  assert.equal(one[0].title, 'Todo lo que hay aquí');
  assert.equal(one[0].merged, true);
  assert.deepEqual(one[0].items.map((x) => x.entity_id), ['a', 'b', 'c', 'd']);
  // Con volumen, quedan como estaban
  assert.equal(oneListWhenFew(secs, 20).length, 3);
  // Una sola sección no se toca
  assert.equal(oneListWhenFew([secs[0]], 3).length, 1);
});
