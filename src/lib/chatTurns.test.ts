import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectIntent } from './answers.ts';
import { groupAiAnswers, isGreetingOnly, splitQuestions, unansweredTail, waitNotice } from './chatTurns.ts';

test('el mensaje de la captura: cada pregunta con su intención', () => {
  const services = [{ id: 's1', name: 'Corrientazo del día', price: 16000, price_from: false }];
  const intents = splitQuestions('Hola, ¿hoy tienen corrientazo? ¿Hacen domicilio?').map((q) => detectIntent(q, services).intent);
  assert.deepEqual(intents, ['price', 'delivery'], 'antes solo se contestaba el domicilio');
});

test('separar las preguntas de un mensaje, sin el saludo', () => {
  assert.deepEqual(splitQuestions('Hola, ¿hoy tienen corrientazo? ¿Hacen domicilio?'), ['¿hoy tienen corrientazo?', '¿Hacen domicilio?']);
  assert.deepEqual(splitQuestions('Buenas tardes. Quería saber el precio del corte. ¿Abren mañana?'), ['Quería saber el precio del corte.', '¿Abren mañana?']);
  assert.deepEqual(splitQuestions('¿Tienen disponibilidad hoy?'), ['¿Tienen disponibilidad hoy?']);
  assert.deepEqual(splitQuestions('hola'), ['hola'], 'solo un saludo: queda como está');
  assert.deepEqual(splitQuestions('cuanto vale el corte'), ['cuanto vale el corte']);
});

const at = (min: number) => new Date(Date.UTC(2026, 10, 9, 14, min)).toISOString();

test('respuestas automáticas seguidas, una sola burbuja', () => {
  // Más nueva primero, como la lista invertida.
  const rows = [
    { id: 'dueno', created_at: at(14), ai: false },
    { id: 'ai3', created_at: at(10), ai: true },
    { id: 'yo2', created_at: at(9), ai: false },
    { id: 'ai2', created_at: at(1), ai: true },
    { id: 'ai1', created_at: at(1), ai: true },
    { id: 'yo1', created_at: at(0), ai: false },
  ];
  const g = groupAiAnswers(rows);
  assert.deepEqual(g.lead.get('ai2'), ['ai1', 'ai2'], 'de la más vieja a la más nueva');
  assert.deepEqual(g.lead.get('ai3'), ['ai3']);
  assert.ok(g.hidden.has('ai1') && !g.hidden.has('ai2'));
  assert.equal(g.first, 'ai1', 'el aviso va una sola vez, en la primera');
});

test('dos respuestas separadas por más de 2 minutos no se juntan', () => {
  const g = groupAiAnswers([
    { id: 'b', created_at: at(5), ai: true },
    { id: 'a', created_at: at(1), ai: true },
  ]);
  assert.deepEqual(g.lead.get('b'), ['b']);
  assert.deepEqual(g.lead.get('a'), ['a']);
  assert.equal(g.hidden.size, 0);
  assert.equal(groupAiAnswers([{ id: 'x', created_at: at(1), ai: false }]).first, null);
});

test('un saludo solo no es una pregunta', () => {
  assert.equal(isGreetingOnly('Hola'), true);
  assert.equal(isGreetingOnly('Buenas tardes!'), true);
  assert.equal(isGreetingOnly('Hola, ¿hacen domicilio?'), false);
  assert.equal(isGreetingOnly(''), false);
});

test('lo que quedó sin contestar al final de la conversación, aunque llegó desde otra pantalla', () => {
  const now = Date.parse('2026-11-09T20:00:00Z');
  const m = (id: string, mine: boolean, min: number, extra: object = {}) => ({ id, sender_id: mine ? 'yo' : 'dueno', sent_by_entity: !mine, content: id, created_at: new Date(now - min * 60_000).toISOString(), ...extra });
  // Más nuevo primero, como llega el historial.
  const rows = [m('hola', true, 1), m('disponibilidad', true, 90), m('domicilio', true, 90), m('respuesta', false, 600), m('vieja', true, 700)];
  assert.deepEqual(unansweredTail(rows, 'yo', now).map((x) => x.id), ['domicilio', 'disponibilidad', 'hola']);
  // Si Empre AI ya respondió después, no hay nada pendiente.
  assert.deepEqual(unansweredTail([m('ai', true, 1, { kind: 'ai_answer' }), m('hola', true, 2)], 'yo', now), []);
  // Más de un día: no se responde tarde.
  assert.deepEqual(unansweredTail([m('ayer', true, 25 * 60)], 'yo', now), []);
});

test('el aviso dice cuándo abre el negocio', () => {
  assert.equal(waitNotice('La 22', false, { text: 'Cerrado · abre mañana 11:00 am', tone: 'closed' }), 'Esto lo responde La 22. Abre mañana 11:00 am; te avisamos cuando conteste.');
  assert.equal(waitNotice('La 22', true, null), 'Esto lo responde La 22, que está en línea.');
  assert.equal(waitNotice('La 22', false, { text: 'Abierto · cierra 3:30 pm', tone: 'open' }), 'Esto lo responde La 22. Te avisamos cuando conteste.');
});
