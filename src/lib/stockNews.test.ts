import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stockNews } from './stockNews.ts';

const aceite = { ids: ['a', 'ref-a'], name: 'Aceite', qty: 2 };
const cera = { ids: ['c'], name: 'Cera', qty: 0 };
const sale = (id: string, at: string, lines: { item_id?: string; name: string; qty: number }[], status = 'active') => ({ id, status, occurred_at: `2026-11-05T${at}:00-05:00`, lines });

test('avisa lo vendido que descontó existencias y cuánto queda', () => {
  const n = stockNews([sale('1', '09:00', [{ item_id: 'a', name: 'Aceite', qty: 1 }]), sale('2', '10:00', [{ item_id: 'c', name: 'Cera', qty: 2 }, { item_id: 'a', name: 'Aceite', qty: 1 }])], [aceite, cera], null);
  assert.equal(n?.id, '2');
  assert.equal(n?.text, 'Vendiste 2 Cera (ya no quedan), 2 Aceite (quedan 2).');
});

test('no avisa de servicios, anuladas ni lo que ya viste', () => {
  assert.equal(stockNews([sale('1', '09:00', [{ item_id: 'x', name: 'Corte', qty: 1 }])], [aceite], null), null);
  assert.equal(stockNews([sale('1', '09:00', [{ item_id: 'a', name: 'Aceite', qty: 1 }], 'voided')], [aceite], null), null);
  assert.equal(stockNews([sale('1', '09:00', [{ item_id: 'a', name: 'Aceite', qty: 1 }])], [aceite], '1'), null);
});

test('después de visto solo cuenta lo nuevo', () => {
  const n = stockNews([sale('1', '09:00', [{ item_id: 'a', name: 'Aceite', qty: 5 }]), sale('2', '10:00', [{ item_id: 'a', name: 'Aceite', qty: 1 }])], [aceite], '1');
  assert.equal(n?.text, 'Vendiste 1 Aceite (quedan 2).');
});

test('resume cuando son muchos', () => {
  const list = ['a', 'b', 'c'].map((id) => ({ ids: [id], name: id.toUpperCase(), qty: 1 }));
  const n = stockNews([sale('1', '09:00', list.map((t) => ({ item_id: t.ids[0], name: t.name, qty: 1 })))], list, null);
  assert.equal(n?.text, 'Vendiste 1 A (queda 1), 1 B (queda 1) y 1 más.');
});
