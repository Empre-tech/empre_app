import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRoute, clockOf, deadlineOf, leaveIn, parseErrands, routeSummary } from './vuelta.ts';

test('lo escrito se separa en paradas que se pueden buscar', () => {
  const e = parseErrands('almorzar, cortarme el pelo y comprar unos tenis, antes de las 6');
  assert.deepEqual(e.map((x) => x.q), ['almuerzo', 'corte de pelo', 'tenis']);
  assert.equal(e[0].stay, 45);
  assert.equal(deadlineOf('almorzar y luego tenis, antes de las 6'), 18 * 60);
  assert.equal(deadlineOf('antes de las 11 am'), 11 * 60);
  assert.equal(deadlineOf('almorzar'), null);
  assert.deepEqual(parseErrands('almorzar y almuerzo').map((x) => x.q), ['almuerzo'], 'sin repetir');
});

test('la vuelta va siempre a la parada más cercana y le pone hora', () => {
  const home = { latitude: 11.24, longitude: -74.21 };
  const near = { id: 'a', name: 'Cerca', latitude: 11.241, longitude: -74.21 };
  const far = { id: 'b', name: 'Lejos', latitude: 11.25, longitude: -74.21 };
  const [e1, e2] = parseErrands('cortarme el pelo y almorzar');
  const legs = buildRoute(home, [{ errand: e2, place: far }, { errand: e1, place: near }], 13 * 60);
  assert.deepEqual(legs.map((l) => l.place.id), ['a', 'b']);
  assert.equal(legs[0].arrive, 13 * 60 + legs[0].walk);
  assert.equal(legs[1].arrive, legs[0].leave + legs[1].walk);
  assert.match(routeSummary(legs), /min · \d,\d km a pie$/);
  assert.equal(clockOf(14 * 60 + 15), '2:15 pm');
  assert.equal(leaveIn(legs[1], legs[1].arrive - legs[1].walk - 6), 6, 'sal en 6 min');
});
