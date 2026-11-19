import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lookedLabel, understoodLabel, voice } from './chatVoice.ts';

const svc = (name: string, price: number | null) => ({ id: name, name, price, price_from: false });

test('la carta: una frase con cuántos y el rango, y la lista en la tarjeta', () => {
  const v = voice({ intent: 'services', unanswered: false, actions: [], blocks: [{ kind: 'services', title: '4 en su carta', items: [svc('Corrientazo', 16000), svc('Bandeja', 25000), svc('Sopa', 7000), svc('Jugo', 7000)], more: 0 }] });
  assert.equal(v.lead.a, 'Tienen 4 en su carta, de $7.000 a $25.000.');
  assert.equal(v.card.length, 1);
});

test('un dato con dos puntos lleva el dato en negrita', () => {
  const v = voice({ intent: 'price', unanswered: false, actions: [], blocks: [{ kind: 'text', title: 'Corte clásico: $20.000 · 30 min' }] });
  assert.deepEqual(v.lead, { a: 'Corte clásico: ', b: '$20.000 · 30 min', c: '.' });
  assert.equal(v.card.length, 0);
});

test('un texto simple es la frase y su cuerpo va como nota', () => {
  const v = voice({ intent: 'availability', unanswered: false, actions: [], blocks: [{ kind: 'text', title: 'Hoy: 11:00 a. m. a 3:30 p. m.', body: 'Para saber si tienen cupo ahora, pregúntale.' }] });
  assert.deepEqual(v.lead, { a: 'Hoy: ', b: '11:00 a. m. a 3:30 p. m', c: '.' });
  assert.equal(v.note, 'Para saber si tienen cupo ahora, pregúntale.');
  const d = voice({ intent: 'delivery', unanswered: false, actions: [], blocks: [{ kind: 'text', title: 'Atiende solo en el local' }] });
  assert.equal(d.lead.a, 'Atiende solo en el local.');
});

test('una oferta se nombra en la frase y se ve en la tarjeta', () => {
  const v = voice({ intent: 'offers', unanswered: false, actions: [], blocks: [{ kind: 'offer', title: 'Corrientazo a $13.000', endsAt: '2026-11-10T20:30:00Z' }] });
  assert.equal(v.lead.b, 'Corrientazo a $13.000');
  assert.equal(v.card.length, 1);
});

test('los pasos dicen qué entendió y dónde buscó', () => {
  assert.equal(understoodLabel('services', 'Carta'), 'Entendí: lo que hay en su carta');
  assert.equal(understoodLabel('services', 'Catálogo', 'Bloqueador solar'), 'Entendí: si tienen bloqueador solar');
  assert.equal(lookedLabel('delivery', 'Carta'), 'Revisé cómo atiende');
  assert.equal(understoodLabel('unknown', 'Carta'), 'Leyendo tu mensaje');
});
