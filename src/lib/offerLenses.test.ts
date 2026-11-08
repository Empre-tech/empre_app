import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyFilters, availableLenses, bizFaces, endsToday, lensItems, savePct } from './offerLenses.ts';
import type { MarketItem, MarketResponse } from './offerMarket.ts';

const NOW = new Date(2026, 10, 7, 12, 0).getTime();
const H = 3_600_000;

function item(p: Partial<MarketItem> & Pick<MarketItem, 'id'>): MarketItem {
  return { entity_id: 'e-' + p.id, title: p.id, type: 'discount', ends_at: new Date(NOW + 2 * H).toISOString(), entity_name: 'N' + p.id, category_name: 'Comida', distance_meters: 300, kind: 'offer', ...p } as MarketItem;
}

function market(p: Partial<MarketResponse> = {}): MarketResponse {
  return { has_location: true, city: 'Santa Marta', zone: 'Centro', zones: [], featured: null, near: [], searched: { terms: [], term: '', items: [] }, trending: [], for_you: { top_rated: false, items: [] }, routes: [], ...p };
}

test('termina hoy: mismo día y todavía vigente', () => {
  assert.ok(endsToday(new Date(NOW + H).toISOString(), NOW));
  assert.ok(!endsToday(new Date(NOW - H).toISOString(), NOW), 'ya terminó');
  assert.ok(!endsToday(new Date(NOW + 20 * H).toISOString(), NOW), 'termina mañana');
});

test('cada lente sale de su sección y nunca trae servicios del catálogo', () => {
  const svc = item({ id: 's1', kind: 'service' });
  const d = market({
    near: [item({ id: 'a', ends_at: new Date(NOW + 5 * H).toISOString() }), svc],
    trending: [item({ id: 'b', ends_at: new Date(NOW + H).toISOString() })],
    for_you: { top_rated: false, items: [item({ id: 'c', ends_at: new Date(NOW + 30 * H).toISOString() }), svc] },
    searched: { terms: [{ term: 'pan', label: 'Pan' }], term: 'pan', items: [] },
  });
  assert.deepEqual(lensItems('parati', d, NOW).map((o) => o.id), ['c']);
  assert.deepEqual(lensItems('terminan', d, NOW).map((o) => o.id), ['b', 'a'], 'la que termina primero arriba; c es de mañana');
  assert.deepEqual(lensItems('canjea', d, NOW).map((o) => o.id), ['b']);
  assert.deepEqual(lensItems('valoradas', d, NOW), [], 'sin reseñas no hay lente de mejor valoradas');
  assert.deepEqual(
    availableLenses(d, NOW).map((l) => l.key),
    ['parati', 'terminan', 'buscado', 'canjea'],
    '«Lo más buscado» sale por sus términos aunque ahora no tenga ofertas',
  );
});

test('sin datos no hay lentes; con reseñas «Para ti» usa lo cercano', () => {
  assert.deepEqual(availableLenses(undefined, NOW), []);
  assert.deepEqual(availableLenses(market(), NOW), []);
  const d = market({ near: [item({ id: 'n' })], for_you: { top_rated: true, items: [item({ id: 'r' })] } });
  assert.deepEqual(lensItems('parati', d, NOW).map((o) => o.id), ['n']);
  assert.deepEqual(lensItems('valoradas', d, NOW).map((o) => o.id), ['r']);
});

test('filtros: solo abiertos y orden', () => {
  const a = item({ id: 'a', open_now: false, price: '$10.000', normal_price: '$20.000', ends_at: new Date(NOW + 3 * H).toISOString() });
  const b = item({ id: 'b', price: '$9.000', normal_price: '$10.000', ends_at: new Date(NOW + H).toISOString() });
  assert.equal(savePct(a), 50);
  assert.equal(savePct(item({ id: 'x', price: '$10.000', normal_price: '$8.000' })), 0, 'un precio «normal» menor no es ahorro');
  assert.deepEqual(applyFilters([a, b], { openOnly: true, sort: 'near' }).map((o) => o.id), ['b']);
  assert.deepEqual(applyFilters([a, b], { openOnly: false, sort: 'save' }).map((o) => o.id), ['a', 'b']);
  assert.deepEqual(applyFilters([a, b], { openOnly: false, sort: 'ends' }).map((o) => o.id), ['b', 'a']);
});

test('negocios ofreciendo: con oferta primero, luego solo catálogo; sin nada no salen', () => {
  const faces = bizFaces(
    [
      { id: 'cat', name: 'Solo catálogo', distance_meters: 50 },
      { id: 'nada', name: 'Sin nada', distance_meters: 10 },
      { id: 'e-o', name: 'Con oferta', profile_url: 'foto', distance_meters: 400 },
    ],
    [item({ id: 'o', distance_meters: 400 }), item({ id: 's', kind: 'service' })],
    { cat: [{}], nada: [] },
  );
  assert.deepEqual(faces.map((f) => [f.id, f.hasOffer]), [['e-o', true], ['cat', false]]);
  assert.equal(faces[0].photo, 'foto', 'toma la foto del negocio');
});
