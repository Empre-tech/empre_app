import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ownerDraft, type AnswerData } from './answers.ts';

// La respuesta que Empre AI le deja lista al dueño (tablero «Mi negocio», teléfono 2): en primera persona y solo con
// lo publicado; si no se sabe o piden un compromiso, la escribe él.

const base: AnswerData = {
  name: 'Barbería El Prado',
  noun: 'Servicios',
  services: [
    { id: 's1', name: 'Corte + barba', price: 30000, price_from: false, duration_min: 30 },
    { id: 's2', name: 'Cera para el pelo', price: 12000, price_from: false, sold_out: true },
  ],
  offers: [],
  hours: [{ weekday: 1, open_time: '08:00', close_time: '20:00', closed: false, is_24h: false }],
  isOpenNow: true,
  availability: null,
  serviceMode: 'in_place',
  agendaOn: false,
};
const opts = { weekday: 1, now: Date.parse('2026-11-16T15:00:00Z') };

test('en primera persona, con lo que publicó', () => {
  assert.equal(ownerDraft(base, '¿cuánto vale el corte + barba?', opts), 'Corte + barba cuesta $30.000.');
  assert.equal(ownerDraft(base, '¿cuánto dura el corte + barba?', opts), 'Corte + barba dura unos 30 minutos.');
  assert.equal(ownerDraft(base, '¿tienen cera para el pelo?', opts), 'Por ahora se nos acabó cera para el pelo. Te aviso cuando vuelva.');
  assert.match(ownerDraft(base, '¿a qué hora abren hoy?', opts)!, /^Hoy atendemos de 8/);
  assert.equal(ownerDraft(base, '¿hacen domicilio?', opts), 'No hacemos domicilios, pero te esperamos en el local.');
  assert.equal(ownerDraft(base, '¿tienen hora a las 5?', opts), 'Sí, ahora estamos atendiendo. ¿A qué hora te queda bien?');
});

test('lo que no se sabe o pide un compromiso lo escribe el dueño', () => {
  assert.equal(ownerDraft(base, '¿aceptan Nequi?', opts), null);
  assert.equal(ownerDraft(base, '¿me la apartan a nombre de Laura?', opts), null);
  assert.equal(ownerDraft({ ...base, serviceMode: '' }, '¿hacen domicilio?', opts), null);
});

test('lo que enseñó el dueño se usa tal cual', () => {
  const d = { ...base, taught: [{ id: 't1', intent: '', question: '¿Atienden niños?', keywords: ['atienden', 'ninos'], answer: 'Sí, desde los 3 años.' }] };
  assert.equal(ownerDraft(d, '¿atienden niños?', opts), 'Sí, desde los 3 años.');
});
