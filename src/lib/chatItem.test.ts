import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chatItemParam, parseChatItem } from './chatItem.ts';

test('la tarjeta va y vuelve por el parámetro', () => {
  const item = { id: 'a1', name: 'Camiseta polo (M)', price: 120000, price_from: false, photo: 'p1', section: 'Camisetas' };
  assert.deepEqual(parseChatItem(chatItemParam(item)), item);
});

test('sin precio ni foto', () => {
  assert.deepEqual(parseChatItem('{"id":"b","name":"Corte"}'), { id: 'b', name: 'Corte', price: null, price_from: false });
});

test('lo raro se ignora', () => {
  for (const raw of [undefined, '', 'no-json', '{"name":"x"}', '{"id":"x"}', '[1]', 'null']) {
    assert.equal(parseChatItem(raw), null, String(raw));
  }
  assert.equal(parseChatItem(['{"id":"a","name":"b"}']), null);
});
