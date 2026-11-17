import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { isProRequired, isProSubscription, proPerks } from './proPlan.ts';

const NOW = Date.parse('2026-11-17T12:00:00Z');

test('Pro solo si está activa y no ha vencido, como el servidor', () => {
  assert.equal(isProSubscription({ status: 'active', current_period_end: '2026-12-17T12:00:00Z' }, NOW), true);
  assert.equal(isProSubscription({ status: 'active', current_period_end: '2026-11-17T11:00:00Z' }, NOW), false);
  assert.equal(isProSubscription({ status: 'active' }, NOW), false);
  assert.equal(isProSubscription({ status: 'inactive', current_period_end: '2026-12-17T12:00:00Z' }, NOW), false);
  assert.equal(isProSubscription(null, NOW), false);
  assert.equal(isProSubscription({ status: 'active', current_period_end: 'no es fecha' }, NOW), false);
});

test('lo que suma Pro: sin agenda si la agenda está apagada', () => {
  assert.deepEqual(proPerks({ agenda: true }).map((p) => p.key), ['ai', 'agenda', 'count']);
  assert.deepEqual(proPerks({ agenda: false }).map((p) => p.key), ['ai', 'count']);
});

test('el 402 del servidor es «pásate a Pro»', () => {
  assert.equal(isProRequired({ status: 402 }), true);
  assert.equal(isProRequired({ status: 429 }), false);
  assert.equal(isProRequired(null), false);
});
