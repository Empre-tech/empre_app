import assert from 'node:assert/strict';
import { test } from 'node:test';
import { priceNote } from './catalog.ts';

const now = Date.parse('2026-11-16T12:00:00Z');

test('la nota de precios sale del resumen sin bajar el catálogo', () => {
  assert.equal(priceNote({ priced: 0, stale: 0 }, now), null);
  assert.equal(priceNote({ priced: 61, stale: 2, oldest_at: '2026-11-16T10:00:00Z' }, now), 'Algunos precios no se han confirmado hace tiempo');
  assert.equal(priceNote({ priced: 61, stale: 0, oldest_at: '2026-11-16T10:00:00Z' }, now), 'Precios habituales · actualizados hoy');
  assert.equal(priceNote({ priced: 3, stale: 0, oldest_at: '2026-11-15T12:00:00Z' }, now), 'Precios habituales · actualizados hace 1 día');
  assert.equal(priceNote({ priced: 3, stale: 0, oldest_at: '2026-11-06T12:00:00Z' }, now), 'Precios habituales · actualizados hace 10 días');
});
