import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NO_PREFS, preferredPart, usable, usualByBusiness } from './agentMemory.ts';

const a = (entity_id: string, service: string, iso: string, status = 'completed') => ({
  entity_id,
  entity: { name: entity_id === 'p' ? 'Barbería El Prado' : 'Uñas Mari' },
  status,
  starts_at: iso,
  service: { id: service, name: service },
});

const hist = [
  a('p', 'Corte degradado', '2026-10-01T15:00:00'),
  a('p', 'Corte degradado', '2026-10-15T16:00:00'),
  a('p', 'Perfilado de barba', '2026-10-20T10:00:00'),
  a('m', 'Manicure', '2026-10-25T15:30:00'),
  a('m', 'Manicure', '2026-11-01T15:30:00', 'cancelled'),
];

test('lo de siempre sale de lo que más te has hecho en cada negocio', () => {
  const u = usualByBusiness(usable(hist, NO_PREFS));
  assert.deepEqual(u.map((x) => [x.entityName, x.service, x.times]), [['Barbería El Prado', 'Corte degradado', 2], ['Uñas Mari', 'Manicure', 1]]);
});

test('pausar un negocio u olvidar deja de usarlo', () => {
  assert.equal(usable(hist, { paused: ['p'], forgetBefore: null }).length, 1);
  assert.equal(usable(hist, { paused: [], forgetBefore: '2026-10-21' }).length, 1, 'solo lo de después de olvidar');
});

test('prefieres las tardes solo con suficientes citas', () => {
  const done = usable(hist, NO_PREFS);
  assert.deepEqual(preferredPart(done), { part: 'tardes', of: '3 de 4 citas' });
  assert.equal(preferredPart(done.slice(0, 2)), null);
});

test('la talla sale de como la dices', async () => {
  const { extractSize } = await import('./agentMemory.ts');
  assert.equal(extractSize('¿Tienen tenis talla 40 para hoy?'), '40');
  assert.equal(extractSize('calzo 38,5'), '38.5');
  assert.equal(extractSize('camisa talla m'), 'M');
  assert.equal(extractSize('corte para hoy a las 5'), null);
});
