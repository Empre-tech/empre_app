import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MarketItem } from './offerMarket.ts';
import { attendantLine, bandHook, bestByGroup, blocksLabel, neighborName, personInitial, redeemedWhen, ringUrgent, routeName, savingPesos, savingText, spotlightLabel, trustDistances, walkLabel, whyWorthIt, routeTitle, clockLabel, levelLabel, routeWhy, legLabel, metersBetween, fromYouLabel, radiusLabel, claimability, claimCta, servicePriceLabel, totalLine, openAtTime, reflowTimes, bestSlot, bogotaDay, pendingArrival } from './offerBarrio.ts';

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

test('«Por qué vale la pena»: solo hechos, en orden, y nada sin dato', () => {
  const now = Date.parse('2026-10-24T15:00:00Z');
  const full = item({ special_price: 9000, reference_price: 14000, rating: 4.8, distance_meters: 230, open_now: true, ends_at: '2026-10-24T15:40:00Z' });
  assert.deepEqual(
    whyWorthIt(full, now).map((l) => `${l.title} | ${l.sub}`),
    ['Ahorras $5.000 (36 %) | Su precio habitual es $14.000', '4,8 de 5 en reseñas | De quienes ya fueron', 'Está a 2 cuadras de ti | Puedes ir a pie', 'Abierto ahora | La oferta termina en 40 min'],
  );
  // Sin ahorro, sin reseñas, sin ubicación y sin horario: no se inventa nada.
  assert.deepEqual(whyWorthIt(item({}), now), []);
  const closed = whyWorthIt(item({ open_now: false, ends_at: '2026-10-26T15:00:00Z' }), now);
  assert.equal(closed[0].title, 'Cerrado ahora');
});

test('3.49: nombre, nivel y porqué de cada ruta', () => {
  // La hora h del 24 (o del día que se diga) de octubre en Colombia, en UTC.
  const at = (h: number, day = 24) => new Date(Date.UTC(2026, 9, day, h + 5, 0)).toISOString();
  assert.equal(routeTitle({ theme: 'pamper', times: [] }, 'Santa Marta'), 'Tarde de consentirse');
  assert.equal(routeTitle({ theme: 'zone', zone: 'El Rodadero', times: [] }, 'Santa Marta'), 'Ruta por El Rodadero');
  assert.equal(routeTitle({ theme: 'day', times: [at(9, 25), at(15, 25)] }, 'Santa Marta'), 'Tu domingo en Santa Marta');
  assert.equal(clockLabel(at(15)), '3:00 pm');
  assert.equal(clockLabel(at(9)), '9:00 am');
  assert.equal(levelLabel({ level: 'walk', zone: 'Centro Histórico', walk_meters: 389, times: [] }, 'Centro Histórico'), 'A pie · 4 cuadras');
  assert.equal(levelLabel({ level: 'walk', zone: 'El Rodadero', walk_meters: 888, times: [] }, 'Centro Histórico'), 'A pie en El Rodadero · 9 cuadras');
  assert.equal(levelLabel({ level: 'zone', zone: 'Centro Histórico', walk_meters: 2400, times: [] }, 'Centro Histórico'), 'En tu barrio · 2,4 km de recorrido');
  assert.equal(levelLabel({ level: 'day', walk_meters: 6000, times: [at(9), at(15), at(19)] }, ''), 'Mañana, tarde y noche');
  assert.equal(routeWhy({ level: 'walk', times: [at(15), null] }), 'Para esta tarde · abiertos a esa hora');
  assert.equal(routeWhy({ level: 'walk', times: [null, null] }), 'Abiertos ahora; revisa el horario de cada uno');
});

test('3.49: los tramos entre paradas', () => {
  const a = { latitude: 11.24, longitude: -74.21 };
  const b = { latitude: 11.2418, longitude: -74.21 }; // ≈ 200 m
  assert.equal(legLabel(metersBetween(a, b)), '2 cuadras, 3 min a pie');
  assert.equal(legLabel(1300), '1,3 km, 16 min a pie');
  assert.equal(legLabel(4300), '4,3 km en carro o taxi');
  assert.equal(legLabel(metersBetween(a, {})), null);
});

test('3.50: las tres distancias y el radio de reclamo', () => {
  assert.equal(fromYouLabel(290), 'A 300 m de ti');
  assert.equal(fromYouLabel(4264), 'A 4,3 km de ti');
  assert.equal(fromYouLabel(null), null);
  assert.equal(radiusLabel(500), 'a menos de 500 m del negocio');
  assert.equal(radiusLabel(3000), 'a menos de 3 km del negocio');
  const you = { latitude: 11.2408, longitude: -74.211 }; // Centro
  const rodadero = { kind: 'offer' as const, radius_meters: 3000, latitude: 11.205, longitude: -74.225 }; // ≈ 4,2 km
  const near = { kind: 'offer' as const, radius_meters: 500, latitude: 11.2412, longitude: -74.2108 };
  assert.equal(claimability(rodadero, you), 'arrive'); // el caso de tu teléfono: «debes estar más cerca»
  assert.equal(claimability(near, you), 'here');
  assert.equal(claimability(near, null), 'unknown');
  assert.equal(claimability({ kind: 'service' }, you), 'service');
  assert.equal(claimCta(1, 2, 0), 'Reclamar 1 ahora · 2 al llegar');
  assert.equal(claimCta(3, 0, 0), 'Reclamar las 3');
  assert.equal(claimCta(0, 3, 0), 'Las 3 se reclaman al llegar');
  assert.equal(claimCta(0, 0, 2), 'Listo: ver mis 2 boletos');
});

test('3.50: servicios, total del plan y por qué entra', () => {
  assert.equal(servicePriceLabel({ service_price: 9000 }), '$9.000 · precio de siempre');
  assert.equal(servicePriceLabel({ service_price: 20000, price_from: true }), 'desde $20.000');
  assert.deepEqual(totalLine({ total_price: 104000, saving: 35000 }), { total: '$104.000 en total', saving: 'ahorras $35.000' });
  assert.equal(totalLine({ total_price: 0, saving: 0 }), null);
  const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 24, h + 5, m)).toISOString();
  assert.equal(
    routeWhy({ level: 'walk', times: [at(15)], stops: [{ kind: 'offer', entity_name: 'Studio Coral' }, { kind: 'service', entity_name: 'Café Ribera', rating: 4.9 }] }),
    'Para esta tarde · abiertos a esa hora · Café Ribera entra por sus reseñas (★ 4,9)',
  );
});

test('3.50: la ruta se reacomoda sola al pedir otra hora', () => {
  const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 24, h + 5, m)).toISOString();
  const stops = [
    { latitude: 11.24, longitude: -74.21, open_until: '19:00' },
    { latitude: 11.2418, longitude: -74.21, open_until: '20:00', duration_min: 30 }, // café, 30 min
    { latitude: 11.2427, longitude: -74.21, open_until: '18:00' }, // sombrero, cierra a las 6
  ];
  const times = [at(15), at(16), at(16, 35)];
  // Pide las 4:30 en el café: el sombrero pasa a 4:30 + 30 min + 5 min a pie = 5:05, y sigue abierto.
  const a = reflowTimes(stops, times, 1, at(16, 30));
  assert.equal(clockLabel(a.times[2] as string), '5:05 pm');
  assert.equal(a.closed, null);
  // Pide las 5:30: el sombrero quedaría a las 6:05, ya cerrado.
  const b = reflowTimes(stops, times, 1, at(17, 30));
  assert.equal(b.closed, 2);
  assert.equal(openAtTime({ open_until: '02:00' }, at(23)), true); // bar que cierra de madrugada
  assert.equal(openAtTime({ open_until: '' }, at(23)), true);
  assert.equal(bestSlot([at(15, 30), at(16, 5), at(16, 30)], at(16)), at(16, 5));
  assert.equal(bestSlot([at(15, 30)], at(16)), at(15, 30));
  assert.equal(bogotaDay(at(23, 30)), '2026-10-24'); // 11:30 pm en Colombia ya es el 25 en UTC
});

test('3.50: el aviso al llegar, solo por lo que ya se puede reclamar', () => {
  const now = Date.parse('2026-10-24T20:00:00Z');
  const soon = new Date(now + 3_600_000).toISOString();
  const hat = item({ id: 'hat', entity_name: 'Mar y Sol', radius_meters: 500, latitude: 11.2427, longitude: -74.21, ends_at: soon });
  const svc = item({ id: 'svc', kind: 'service', entity_name: 'Café Ribera', latitude: 11.2418, longitude: -74.21 });
  const saved = [{ key: 'k', title: 'Tarde de consentirse', route: { stops: [svc, hat] }, claimed: [], dismissed: [] }];
  assert.equal(pendingArrival(saved, { latitude: 11.205, longitude: -74.225 }, now), null); // lejos
  assert.equal(pendingArrival(saved, { latitude: 11.2425, longitude: -74.21 }, now)?.stop.id, 'hat'); // llegaste
  assert.equal(pendingArrival([{ ...saved[0], dismissed: ['hat'] }], { latitude: 11.2425, longitude: -74.21 }, now), null); // «ahora no»
  assert.equal(pendingArrival([{ ...saved[0], claimed: ['hat'] }], { latitude: 11.2425, longitude: -74.21 }, now), null); // ya reclamada
});
