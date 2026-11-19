import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FRAME_MIN_SPAN, searchFrame } from './proximity.ts';

const you = { latitude: 11.235, longitude: -74.17 };

test('searchFrame encuadra todos los resultados de la ciudad y a ti', () => {
  const pts = [
    { latitude: 11.24, longitude: -74.2 },
    { latitude: 11.2, longitude: -74.22 },
    { latitude: 11.25, longitude: -74.18 },
  ];
  const f = searchFrame(pts, you);
  for (const p of [...pts, you]) assert.ok(f.some((x) => x.latitude === p.latitude && x.longitude === p.longitude));
});

test('searchFrame con un solo resultado cerca no se acerca más que un barrio', () => {
  const f = searchFrame([{ latitude: 11.2352, longitude: -74.1702 }], you);
  const lats = f.map((p) => p.latitude);
  const lngs = f.map((p) => p.longitude);
  assert.ok(Math.max(...lats) - Math.min(...lats) >= FRAME_MIN_SPAN - 1e-9);
  assert.ok(Math.max(...lngs) - Math.min(...lngs) >= FRAME_MIN_SPAN - 1e-9);
});

test('searchFrame deja fuera lo de otra ciudad y no encuadra nada sin resultados', () => {
  const bogota = { latitude: 4.711, longitude: -74.072 };
  const f = searchFrame([{ latitude: 11.24, longitude: -74.2 }, bogota], you);
  assert.equal(f.some((p) => p.latitude === bogota.latitude), false);
  assert.deepEqual(searchFrame([], you), []);
  assert.deepEqual(searchFrame([bogota], you), []);
});
