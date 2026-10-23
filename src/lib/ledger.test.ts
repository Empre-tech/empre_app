import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  amountField, cancelPending, changeText, enqueue, flushOrder, formatPesos, isRetryable, markFailed, newClientId,
  parseAmountInput, pendingTotals, restoreOutbox, retryFailed,
} from './ledger.ts';

test('formatPesos', () => {
  assert.equal(formatPesos(0), '$0');
  assert.equal(formatPesos(999), '$999');
  assert.equal(formatPesos(25000), '$25.000');
  assert.equal(formatPesos(1234567), '$1.234.567');
  assert.equal(formatPesos(-5000), '-$5.000');
});

test('parseAmountInput', () => {
  assert.equal(parseAmountInput(''), 0);
  assert.equal(parseAmountInput('$ 25.000'), 25000);
  assert.equal(parseAmountInput('abc'), 0);
  assert.equal(parseAmountInput('9999999999'), 100_000_000); // tope
  assert.equal(amountField(25000), '25.000');
  assert.equal(amountField(0), '');
});

test('newClientId es un uuid v4 distinto cada vez', () => {
  const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const a = newClientId();
  const b = newClientId();
  assert.match(a, re);
  assert.notEqual(a, b);
});

test('changeText', () => {
  assert.equal(changeText(120, 100, 'ayer'), '+20 % frente a ayer');
  assert.equal(changeText(50, 100, 'ayer'), '−50 % frente a ayer');
  assert.equal(changeText(100, 100, 'ayer'), 'Igual que ayer');
  assert.equal(changeText(100, 0, 'ayer'), null);
});

test('cola: no duplica, ordena por dependencia y totaliza', () => {
  let q = enqueue([], { id: 'p1', entityId: 'e1', kind: 'party', payload: { name: 'Don Jorge' }, createdAt: 3 });
  q = enqueue(q, { id: 's1', entityId: 'e1', kind: 'sale', payload: { total: 30000 }, createdAt: 1 });
  q = enqueue(q, { id: 's1', entityId: 'e1', kind: 'sale', payload: { total: 30000 }, createdAt: 1 }); // reenvío
  q = enqueue(q, { id: 'x1', entityId: 'e1', kind: 'expense', payload: { amount: 8000 }, createdAt: 2 });
  q = enqueue(q, { id: 'a1', entityId: 'e1', kind: 'payment', payload: { amount: 5000 }, createdAt: 0 });
  q = enqueue(q, { id: 's9', entityId: 'e2', kind: 'sale', payload: { total: 999 }, createdAt: 5 });
  assert.equal(q.length, 5);
  assert.deepEqual(flushOrder(q).map((x) => x.id), ['p1', 's1', 'x1', 's9', 'a1']);
  assert.deepEqual(pendingTotals(q, 'e1'), { count: 4, failed: 0, sales: 30000, expenses: 8000 });

  q = markFailed(q, 's1', 'rechazado');
  assert.deepEqual(pendingTotals(q, 'e1'), { count: 3, failed: 1, sales: 0, expenses: 8000 });
  assert.equal(flushOrder(q).some((x) => x.id === 's1'), false);
  q = retryFailed(q, 's1');
  assert.equal(flushOrder(q).some((x) => x.id === 's1'), true);
});

test('deshacer sin señal quita de la cola solo lo pendiente', () => {
  const q = enqueue([], { id: 's1', entityId: 'e1', kind: 'sale', payload: { total: 1000 } });
  assert.deepEqual(cancelPending(q, 's1'), []);
  assert.equal(cancelPending(q, 'otro'), null);
  assert.equal(cancelPending(markFailed(q, 's1', 'x'), 's1'), null);
});

test('isRetryable', () => {
  assert.equal(isRetryable(0), true);
  assert.equal(isRetryable(503), true);
  assert.equal(isRetryable(400), false);
  assert.equal(isRetryable(403), false);
});

test('restoreOutbox descarta basura', () => {
  assert.deepEqual(restoreOutbox(null), []);
  const ok = { id: 'a', entityId: 'e', kind: 'sale', payload: {}, createdAt: 1, status: 'pending' };
  assert.deepEqual(restoreOutbox([ok, { id: 1 }, null, { ...ok, kind: 'raro' }]), [ok]);
});
