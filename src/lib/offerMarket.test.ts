import assert from 'node:assert/strict';
import { test } from 'node:test';

test('con pocas ofertas, el barrio vecino es el más cercano que no es donde estás ni el que ves', async () => {
  const { nearestOtherZone } = await import('./offerMarket.ts');
  const z = (id: string, d: number | null, here = false) => ({ id, name: id, distance_meters: d, here, looks: [] });
  const zones = [z('centro', 0, true), z('taganga', 1800), z('rodadero', 900), z('lejos', null)];
  assert.equal(nearestOtherZone(zones)?.id, 'rodadero');
  assert.equal(nearestOtherZone(zones, ['rodadero'])?.id, 'taganga', 'si ya ves El Rodadero, el siguiente');
  assert.equal(nearestOtherZone([z('centro', 0, true), z('lejos', null)]), null, 'sin distancia no se adivina');
});
