import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answer, detectIntent, matchTaught, suggestQuestions, type AnswerData } from './answers.ts';

const base: AnswerData = {
  name: 'Barbería Samaria',
  noun: 'Servicios',
  services: [{ id: 's1', name: 'Corte clásico', price: 18000, price_from: false }],
  offers: [],
  hours: [],
  isOpenNow: null,
  availability: null,
  serviceMode: '',
  agendaOn: false,
};
const opts = { weekday: 1, now: Date.parse('2026-11-09T15:00:00Z') };

test('una pregunta propia del dueño se reconoce y se responde tal cual', () => {
  const d = { ...base, taught: [{ id: 't1', intent: '', question: '¿Atienden niños?', keywords: ['atienden', 'ninos'], answer: 'Sí, desde los 3 años.' }] };
  const found = detectIntent('hola, ¿atienden a niños pequeños?', d.services, d.taught);
  assert.equal(found.intent, 'custom');
  assert.equal(found.taughtId, 't1');
  const a = answer(d, 'custom', { ...opts, taughtId: 't1' });
  assert.equal(a.unanswered, false);
  assert.equal(a.blocks[0].title, 'Sí, desde los 3 años.');
  assert.equal(a.source, 'Respuesta de Barbería Samaria');
  // Sin esa respuesta enseñada, la misma pregunta queda sin reconocer.
  assert.equal(detectIntent('¿atienden niños?', base.services).intent, 'unknown');
});

test('una palabra de las varias no alcanza para reconocer la pregunta', () => {
  const t = [{ id: 't1', intent: '', question: '', keywords: ['parqueadero', 'carros', 'motos'], answer: 'Sí' }];
  assert.equal(matchTaught('¿y para motos?', t), undefined);
  assert.equal(matchTaught('¿tienen parqueadero para motos?', t)?.id, 't1');
});

test('lo enseñado completa una intención sin dato y se suma cuando sí lo hay', () => {
  const d = { ...base, taught: [{ id: 't2', intent: 'delivery', question: '', keywords: [], answer: 'No hacemos domicilio, pero te lo guardamos.' }] };
  const a = answer(d, 'delivery', opts);
  assert.equal(a.unanswered, false, 'sin modo de atención publicado, lo enseñado responde');
  assert.equal(a.blocks[0].title, 'No hacemos domicilio, pero te lo guardamos.');
  assert.ok(suggestQuestions(d, new Set(), 8).some((q) => q.intent === 'delivery'), 'ahora se puede sugerir');

  const d2 = { ...base, taught: [{ id: 't3', intent: 'price', question: '', keywords: [], answer: 'Los martes el corte vale menos.' }] };
  const p = answer(d2, 'price', { ...opts, serviceId: 's1' });
  assert.match(p.blocks[0].title, /Corte clásico/);
  assert.equal(p.blocks.at(-1)?.title, 'Además, Barbería Samaria dice:');
  assert.equal(p.blocks.at(-1)?.kind === 'text' ? p.blocks.at(-1)?.body : '', 'Los martes el corte vale menos.');
});
