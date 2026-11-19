import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectIntent } from './answers.ts';
import { groupAiAnswers, isGreetingOnly, splitQuestions, timelineOrder, unansweredTail, waitNotice } from './chatTurns.ts';

test('el mensaje de la captura: cada pregunta con su intención', () => {
  const services = [{ id: 's1', name: 'Corrientazo del día', price: 16000, price_from: false }];
  const found = splitQuestions('Hola, ¿hoy tienen corrientazo? ¿Hacen domicilio?').map((q) => detectIntent(q, services));
  // «¿Tienen corrientazo?» se contesta con su menú (sí está, y su precio), no con la agenda (2026-11-14).
  assert.deepEqual(found.map((f) => f.intent), ['services', 'delivery'], 'antes solo se contestaba el domicilio');
  assert.equal(found[0].services[0]?.id, 's1');
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
  assert.deepEqual(g.lead.get('ai1'), ['ai1', 'ai2'], 'la dibuja la más vieja, de la más vieja a la más nueva');
  assert.deepEqual(g.lead.get('ai3'), ['ai3']);
  assert.ok(g.hidden.has('ai2') && !g.hidden.has('ai1'), 'la burbuja no cambia de fila cuando llega otra respuesta');
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
  assert.equal(waitNotice('La 22', false, { text: 'Cerrado · abre mañana 11:00 am', tone: 'closed' }), 'Enviado · esto lo responde La 22 · abre mañana 11:00 am');
  assert.equal(waitNotice('La 22', true, null), 'Enviado · La 22 está en línea');
  assert.equal(waitNotice('La 22', false, { text: 'Abierto · cierra 3:30 pm', tone: 'open' }), 'Enviado · esto lo responde La 22');
});

test('3.71: una pregunta ya respondida o que Empre AI no supo no vuelve a salir al abrir el chat', () => {
  const now = Date.parse('2026-11-09T21:00:00Z');
  const m = (id: string, mine: boolean, min: number, extra: object = {}) => ({ id, sender_id: mine ? 'yo' : 'dueno', sent_by_entity: !mine, content: id, created_at: new Date(now - min * 60_000).toISOString(), ...extra });
  const rows = [
    m('r-carta', true, 1, { kind: 'ai_answer', reply_to_id: 'carta' }),
    m('hola', true, 2),
    m('carta', true, 20),
    m('domicilio', true, 90, { ai_unanswered: true }),
    m('disponibilidad', true, 91),
    m('dueno', false, 300),
  ];
  assert.deepEqual(unansweredTail(rows, 'yo', now).map((x) => x.id), ['disponibilidad', 'hola']);
});

test('3.71: cada respuesta se dibuja justo debajo de su pregunta, aunque se guardó después', () => {
  const t = (min: number) => new Date(Date.parse('2026-11-09T21:00:00Z') + min * 60_000).toISOString();
  const rows = [
    { id: 'q1', created_at: t(0) },
    { id: 'q2', created_at: t(5) },
    { id: 'hola', created_at: t(30) },
    { id: 'a2', created_at: t(31), reply_to_id: 'q2' },
    { id: 'a1', created_at: t(31), reply_to_id: 'q1' },
  ];
  // La lista va de lo más nuevo a lo más viejo (invertida).
  assert.deepEqual(timelineOrder(rows).map((r) => r.id), ['hola', 'a2', 'q2', 'a1', 'q1']);
});
