import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MarketItem } from './offerMarket.ts';
import { attendantLine, bandHook, bestByGroup, blocksLabel, neighborName, personInitial, redeemedWhen, ringUrgent, routeName, savingPesos, savingText, spotlightLabel, trustDistances, walkLabel } from './offerBarrio.ts';

const item = (o: Partial<MarketItem>): MarketItem => ({
  id: 'x', entity_id: 'e', title: 'Oferta', type: 'DIA', ends_at: new Date(Date.now() + 3_600_000).toISOString(), entity_name: 'Café Ribera',
  category_name: 'Cafeterías y postres', distance_meters: null, ...o,
});

test('lejos de toda ciudad no se muestran distancias', () => {
  assert.equal(trustDistances(true, 'Santa Marta'), true);
  assert.equal(trustDistances(true, ''), false); // el caso del emulador: «5575,7 km»
  assert.equal(trustDistances(false, 'Santa Marta'), false);
});

test('la distancia en cuadras, como se habla en el barrio', () => {
  assert.equal(blocksLabel(40), 'a 1 cuadra');
  assert.equal(blocksLabel(220), 'a 2 cuadras');
  assert.equal(blocksLabel(690), 'a 7 cuadras');
  assert.equal(blocksLabel(1221), 'a 1,2 km');
  assert.equal(blocksLabel(null), null);
  assert.equal(blocksLabel(-1), null);
  assert.equal(walkLabel(389), 'A pie · 4 cuadras');
  assert.equal(walkLabel(2400), '2,4 km de recorrido');
});

test('el ahorro solo si es real', () => {
  assert.equal(savingPesos({ special_price: 28000, reference_price: 35000 }), 7000);
  assert.equal(savingText({ special_price: 28000, reference_price: 35000 }), '$7.000');
  assert.equal(savingPesos({ special_price: 9000, reference_price: 9000 }), 0);
  assert.equal(savingText({ special_price: 9000 }), null);
});

test('el titular de la franja: primero lo de tu barrio, nunca inventado', () => {
  const near = item({ special_price: 9000, reference_price: 14000, distance_meters: 135 }); // 5.000
  const far = item({ special_price: 210000, reference_price: 280000, distance_meters: 4400 }); // 70.000, lejos
  assert.equal(bandHook([near, far]), 5000);
  assert.equal(bandHook([far]), 70000); // sin nada cerca, lo de la ciudad
  assert.equal(bandHook([item({})]), 0); // sin ahorro no hay titular
});

test('la regla de cada diapositiva se lee en la etiqueta', () => {
  assert.equal(spotlightLabel('save_today').text, 'Mayor ahorro de hoy');
  assert.equal(spotlightLabel('ends_first').text, 'La que termina antes');
  assert.equal(spotlightLabel('new_week', 'Centro Histórico').text, 'Nueva esta semana en Centro Histórico');
});

test('el nombre de la ruta sale de la mezcla de negocios', () => {
  assert.equal(routeName(['salud', 'comer', 'compras']), 'Tarde de consentirse');
  assert.equal(routeName(['servicios', 'comer', 'compras']), 'Día de vueltas');
  assert.equal(routeName(['planes', 'servicios', 'compras']), 'Plan de paseo');
  assert.equal(routeName(['servicios', 'compras', undefined]), 'Ruta por el barrio');
});

test('quién atiende', () => {
  assert.equal(attendantLine(item({ attendant_name: 'Ana' })), 'Ana, quien atiende');
  assert.equal(attendantLine(item({})), '');
  assert.equal(personInitial(item({ attendant_name: 'Doña Marta' })), 'M');
  assert.equal(personInitial(item({ entity_name: 'La Brasa del Parque' })), 'B');
  assert.equal(neighborName(item({ attendant_name: ' ' })), 'Café Ribera');
});

test('cuándo canjeó quien recomienda', () => {
  const now = Date.parse('2026-10-24T15:00:00Z');
  assert.equal(redeemedWhen('2026-10-24T09:00:00Z', now), 'canjeó hoy');
  assert.equal(redeemedWhen('2026-10-23T09:00:00Z', now), 'canjeó ayer');
  assert.equal(redeemedWhen('2026-10-21T09:00:00Z', now), 'canjeó hace 3 días');
  assert.equal(redeemedWhen('2026-10-15T09:00:00Z', now), 'canjeó la semana pasada');
  assert.equal(redeemedWhen('no', now), 'canjeó aquí');
});

test('anillo naranja a menos de una hora', () => {
  const now = Date.now();
  assert.equal(ringUrgent(new Date(now + 40 * 60_000).toISOString(), now), true);
  assert.equal(ringUrgent(new Date(now + 3 * 3_600_000).toISOString(), now), false);
  assert.equal(ringUrgent(new Date(now - 60_000).toISOString(), now), false);
});

test('el mayor ahorro de cada grupo, solo con ahorro real', () => {
  const groupOf = (n: string) => (n.startsWith('Caf') ? 'comer' : n.startsWith('Bel') ? 'salud' : undefined);
  const got = bestByGroup(
    [
      item({ category_name: 'Cafeterías y postres', special_price: 8000, reference_price: 16000 }),
      item({ category_name: 'Cafeterías y postres', special_price: 9000, reference_price: 14000 }),
      item({ category_name: 'Belleza y peluquería', special_price: 30000, reference_price: 38000 }),
      item({ category_name: 'Otros', special_price: 1, reference_price: 100 }),
    ],
    groupOf,
  );
  assert.deepEqual(got, { comer: 50, salud: 21 });
});
