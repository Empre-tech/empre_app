import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canLeave, dayKey, FULL_MIN_MS, fullWelcomeToday, MAX_WAIT_MS, openLine } from './finderWelcome.ts';

test('la bienvenida completa sale una vez por día', () => {
  const now = new Date(2026, 10, 7, 9, 30);
  assert.equal(dayKey(now), '2026-11-07');
  assert.equal(fullWelcomeToday(null, now), true);
  assert.equal(fullWelcomeToday('2026-11-06', now), true);
  assert.equal(fullWelcomeToday('2026-11-07', now), false);
});

test('se va cuando el mapa está listo, con un mínimo solo la primera vez del día', () => {
  assert.equal(canLeave({ ready: true, elapsedMs: 300, full: true }), false, 'muy pronto: parpadearía');
  assert.equal(canLeave({ ready: true, elapsedMs: FULL_MIN_MS, full: true }), true);
  assert.equal(canLeave({ ready: true, elapsedMs: 0, full: false }), true, 'las demás veces no hace esperar');
  assert.equal(canLeave({ ready: false, elapsedMs: 5000, full: false }), false);
  assert.equal(canLeave({ ready: false, elapsedMs: MAX_WAIT_MS, full: true }), true, 'nunca deja a nadie esperando');
});

test('solo dice lo que sabe', () => {
  assert.equal(openLine(5, 8), '5 abiertos a 5 min a pie');
  assert.equal(openLine(1, 1), '1 abierto a 5 min a pie');
  assert.equal(openLine(0, 3), '3 abiertos cerca');
  assert.equal(openLine(0, 0), null);
});
