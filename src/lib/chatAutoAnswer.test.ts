import assert from 'node:assert/strict';
import { test } from 'node:test';
import { autoAnswerStep, chatActions, ownerRepliedSince, WAIT_ONLINE_MS } from './chatAutoAnswer.ts';

const base = { answerable: true, intent: 'hours', ownerOnline: false, ownerReplied: false, elapsedMs: 0, answered: new Set<string>() };

test('desconectado responde al instante; en línea espera 45 s', () => {
  assert.equal(autoAnswerStep(base), 'answer');
  assert.equal(autoAnswerStep({ ...base, ownerOnline: true, elapsedMs: 10_000 }), 'wait');
  assert.equal(autoAnswerStep({ ...base, ownerOnline: true, elapsedMs: WAIT_ONLINE_MS }), 'answer');
});

test('si el dueño ya contestó, Empre AI no dice nada', () => {
  assert.equal(autoAnswerStep({ ...base, ownerReplied: true }), 'skip');
  assert.equal(autoAnswerStep({ ...base, answerable: false, ownerReplied: true }), 'skip');
});

test('sin dato no adivina, y no repite una intención', () => {
  assert.equal(autoAnswerStep({ ...base, answerable: false, intent: 'unknown' }), 'status');
  assert.equal(autoAnswerStep({ ...base, answered: new Set(['hours']) }), 'skip');
  assert.equal(autoAnswerStep({ ...base, intent: 'price', answered: new Set(['hours']) }), 'answer');
});

test('en el chat no se ofrece «Escribir al negocio»', () => {
  const acts = chatActions([{ kind: 'message', label: 'Escribir' }, { kind: 'open_offer', label: 'Ver la oferta' }]);
  assert.deepEqual(acts.map((a) => a.kind), ['open_offer']);
});

test('detecta si el dueño escribió después de la pregunta', () => {
  const msgs = [
    { sent_by_entity: false, created_at: '2026-11-07T10:00:00Z' },
    { sent_by_entity: true, created_at: '2026-11-07T09:59:00Z' },
  ];
  assert.equal(ownerRepliedSince(msgs, '2026-11-07T10:00:00Z'), false, 'una respuesta anterior no cuenta');
  assert.equal(ownerRepliedSince([...msgs, { sent_by_entity: true, created_at: '2026-11-07T10:00:30Z' }], '2026-11-07T10:00:00Z'), true);
});
