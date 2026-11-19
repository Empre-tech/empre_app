import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { isProRequired, isProSubscription, proGroups } from './proPlan.ts';

const NOW = Date.parse('2026-11-17T12:00:00Z');

test('Pro solo si está activa y no ha vencido, como el servidor', () => {
  assert.equal(isProSubscription({ status: 'active', current_period_end: '2026-12-17T12:00:00Z' }, NOW), true);
  assert.equal(isProSubscription({ status: 'active', current_period_end: '2026-11-17T11:00:00Z' }, NOW), false);
  assert.equal(isProSubscription({ status: 'active' }, NOW), false);
  assert.equal(isProSubscription({ status: 'inactive', current_period_end: '2026-12-17T12:00:00Z' }, NOW), false);
  assert.equal(isProSubscription(null, NOW), false);
  assert.equal(isProSubscription({ status: 'active', current_period_end: 'no es fecha' }, NOW), false);
});

test('lo que suma Pro, por área: Finance primero, sin agenda si está apagada', () => {
  assert.deepEqual(proGroups({ agenda: true }).map((g) => g.key), ['finance', 'ai', 'inventory', 'agenda']);
  assert.deepEqual(proGroups({ agenda: false }).map((g) => g.key), ['finance', 'ai', 'inventory']);
  const finance = proGroups({ agenda: false })[0];
  assert.deepEqual(finance.items.map((i) => i.title), ['Plata', 'Cuentas', 'Rentabilidad', 'Análisis con Empre AI']);
  assert.deepEqual(proGroups({ agenda: false })[1].items.map((i) => i.title), ['Habla con Empre AI', 'Redactar con Empre AI']);
  for (const g of proGroups({ agenda: true })) assert.ok(g.items.length > 0 && g.short.length > 0);
});

test('el 402 del servidor es «pásate a Pro»', () => {
  assert.equal(isProRequired({ status: 402 }), true);
  assert.equal(isProRequired({ status: 429 }), false);
  assert.equal(isProRequired(null), false);
});
