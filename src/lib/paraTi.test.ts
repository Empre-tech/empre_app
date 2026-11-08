import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matches, pickParaTi, type ParaTiCandidate, type ParaTiContext } from './paraTi.ts';
import { recordSearch, topHabits } from './searchHabits.ts';

const NOW = Date.parse('2026-11-10T12:00:00-05:00');
const H = 60 * 60 * 1000;
const D = 24 * H;

function c(p: Partial<ParaTiCandidate> & Pick<ParaTiCandidate, 'key' | 'kind' | 'entityId'>): ParaTiCandidate {
  return { id: p.key.split(':')[1], entityName: 'Negocio', title: 'Algo', category: 'Tienda', open: true, distanceM: 1200, ...p };
}

const ctx = (over: Partial<ParaTiContext> = {}): ParaTiContext => ({ now: NOW, topTerms: [], usualEntityIds: [], hourWords: [], busyEntityIds: [], busyOfferIds: [], ...over });

test('lo que más buscas: cuenta, junta tildes y olvida lo de hace más de 30 días', () => {
  let list = recordSearch([], 'Droguería', NOW - 40 * D);
  list = recordSearch(list, 'barbería', NOW - 2 * D);
  list = recordSearch(list, 'drogueria', NOW - D);
  list = recordSearch(list, 'Barberia', NOW);
  list = recordSearch(list, 'corrientazo', NOW);
  const top = topHabits(list, NOW);
  assert.equal(top[0].key, 'barberia');
  assert.equal(top[0].n, 2);
  // La de hace 40 días no se suma: «drogueria» cuenta 1.
  assert.equal(list.find((h) => h.key === 'drogueria')?.n, 1);
  assert.equal(recordSearch(list, ' ', NOW), list);
});

test('coincidencia por raíz y sin tildes', () => {
  assert.ok(matches('barbería', { title: 'Corte clásico', category: 'Barbero', entityName: 'El Prado' }));
  assert.ok(matches('Droguería', { title: 'Abierto 24 h', category: 'Droguerías', entityName: 'Del Mar' }));
  assert.ok(!matches('pan', { title: 'Panadería', category: 'Comida', entityName: 'X' }), 'palabras de menos de 4 letras no cuentan');
});

test('elige como mucho 3, un negocio y un tipo por espacio, con su motivo', () => {
  const cands = [
    c({ key: 'service:s1', kind: 'service', entityId: 'e1', title: 'Corrientazo del día', category: 'Restaurante', distanceM: 300 }),
    c({ key: 'service:s2', kind: 'service', entityId: 'e2', title: 'Corrientazo', category: 'Restaurante', distanceM: 900 }),
    // Más cerca que o2: sin la regla de un espacio por negocio, ganaría ella.
    c({ key: 'offer:o1', kind: 'offer', entityId: 'e1', title: '2x1 en jugos', endsAt: new Date(NOW + H).toISOString(), distanceM: 100 }),
    c({ key: 'offer:o2', kind: 'offer', entityId: 'e3', title: 'Postre gratis', endsAt: new Date(NOW + 2 * H).toISOString(), distanceM: 240, rating: 4.7 }),
    c({ key: 'business:e4', kind: 'business', entityId: 'e4', title: 'Droguería del Mar', category: 'Droguería', closesAt: '24h' }),
    c({ key: 'business:e5', kind: 'business', entityId: 'e5', title: 'Otra droguería', category: 'Droguería', open: false, distanceM: 50 }),
  ];
  const picks = pickParaTi(cands, ctx({ topTerms: ['corrientazo', 'droguería'] }));
  assert.equal(picks.length, 3);
  assert.deepEqual(new Set(picks.map((p) => p.candidate.kind)).size, 3);
  assert.equal(new Set(picks.map((p) => p.candidate.entityId)).size, 3);
  const service = picks.find((p) => p.candidate.kind === 'service')!;
  assert.equal(service.candidate.key, 'service:s1');
  assert.equal(service.why, 'Porque buscas corrientazo');
  assert.equal(service.cta, 'Ver el servicio');
  // La oferta de e1 queda fuera porque e1 ya salió; entra la de e3, que termina pronto y está cerca.
  assert.equal(picks.find((p) => p.candidate.kind === 'offer')?.candidate.key, 'offer:o2');
  const biz = picks.find((p) => p.candidate.kind === 'business')!;
  assert.equal(biz.candidate.key, 'business:e4', 'la droguería cerrada nunca sale');
  assert.match(biz.proof, /abierto 24 horas/);
});

test('no recomienda lo que ya está en «Lo tuyo» ni lo terminado', () => {
  const cands = [
    c({ key: 'offer:o1', kind: 'offer', entityId: 'e1', endsAt: new Date(NOW + H).toISOString(), distanceM: 100 }),
    c({ key: 'offer:o2', kind: 'offer', entityId: 'e2', endsAt: new Date(NOW - H).toISOString(), distanceM: 100 }),
    c({ key: 'business:e3', kind: 'business', entityId: 'e3', distanceM: 100 }),
  ];
  const picks = pickParaTi(cands, ctx({ busyOfferIds: ['o1'], busyEntityIds: ['e3'] }));
  assert.deepEqual(picks, []);
});

test('sin señales fuertes no rellena: mejor un espacio menos', () => {
  const far = [c({ key: 'business:e1', kind: 'business', entityId: 'e1', distanceM: 3000 })];
  assert.deepEqual(pickParaTi(far, ctx()), []);
  // Sin historial: lo típico de la hora y lo cerca sí bastan.
  const picks = pickParaTi([c({ key: 'service:s1', kind: 'service', entityId: 'e1', title: 'Corrientazo', distanceM: 3000 })], ctx({ hourWords: ['corrientazo'] }));
  assert.equal(picks[0]?.why, 'Para esta hora');
});

test('lo de siempre pesa más que lo cercano', () => {
  const cands = [
    c({ key: 'business:e1', kind: 'business', entityId: 'e1', distanceM: 100 }),
    c({ key: 'business:e2', kind: 'business', entityId: 'e2', distanceM: 1500 }),
  ];
  const picks = pickParaTi(cands, ctx({ usualEntityIds: ['e2'] }));
  assert.equal(picks.length, 1);
  assert.equal(picks[0].candidate.entityId, 'e2');
  assert.equal(picks[0].why, 'Lo de siempre');
});
