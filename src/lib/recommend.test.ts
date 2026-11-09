import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isRecommendAsk, pickRecommendations, recommendLead, type RecPlace } from './recommend.ts';

test('pedir una recomendación sin decir de qué', () => {
  assert.ok(isRecommendAsk('me podés recomendar algún negocio'));
  assert.ok(isRecommendAsk('¿Qué me recomiendas por aquí?'));
  assert.ok(isRecommendAsk('recomiéndame algo bueno cerca'));
  assert.ok(isRecommendAsk('alguna sugerencia para hoy'));
  assert.ok(!isRecommendAsk('recomiéndame una barbería'), 'nombra algo: es una búsqueda');
  assert.ok(!isRecommendAsk('droguería abierta'), 'no pide recomendación');
  assert.ok(!isRecommendAsk('negocio'));
});

const p = (x: Partial<RecPlace> & Pick<RecPlace, 'id'>): RecPlace => ({ name: x.id, category_name: 'Comida', distance_meters: 500, is_open_now: true, has_active_offer: false, ...x });

test('abiertos y cerca primero, uno por categoría, con razones verdaderas', () => {
  const list = [
    p({ id: 'lejos', distance_meters: 3000 }),
    p({ id: 'cerrado', is_open_now: false, distance_meters: 100, category_name: 'Belleza' }),
    p({ id: 'oferta', distance_meters: 350, has_active_offer: true, active_offer_title: '2x1', category_name: 'Comida' }),
    p({ id: 'otra-comida', distance_meters: 300 }),
    p({ id: 'farmacia', distance_meters: 700, category_name: 'Salud', avg_rating: 4.8, review_count: 12 }),
    p({ id: 'sin-reseñas', distance_meters: 700, category_name: 'Tienda', avg_rating: 5, review_count: 0 }),
  ];
  const recs = pickRecommendations(list);
  assert.deepEqual(recs.map((r) => r.place.id), ['oferta', 'farmacia', 'sin-reseñas'], 'una comida, no dos');
  assert.deepEqual(recs[0].reasons, ['Abierto ahora', 'a 4 min a pie', 'Oferta: 2x1']);
  assert.deepEqual(recs[1].reasons, ['Abierto ahora', 'a 9 min a pie', '★ 4,8']);
  assert.ok(!recs[2].reasons.some((r) => r.startsWith('★')), 'sin reseñas no se muestran estrellas');
  assert.match(recommendLead(recs), /^Abiertos ahora y cerca de ti/);
});

test('las frases según lo que hay', () => {
  assert.match(recommendLead([]), /Todavía no hay negocios/);
  const closed = pickRecommendations([p({ id: 'a', is_open_now: false })]);
  assert.match(recommendLead(closed), /no hay nada abierto/);
  assert.equal(pickRecommendations([p({ id: 'x', distance_meters: 2500 })])[0].reasons[1], 'a 2,5 km');
});
