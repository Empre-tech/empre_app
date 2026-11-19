import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answer, detectIntent, type AnswerData } from './answers.ts';
import { voice } from './chatVoice.ts';

// Empre AI responde lo que se le pregunta a un negocio (2026-11-14): «¿lo tienen?» con su catálogo, no con la agenda.
const shop: AnswerData = {
  name: 'Droguería La 14',
  noun: 'Catálogo',
  services: [
    { id: 'p1', name: 'Bloqueador solar', price: 42000, price_from: false },
    { id: 'p2', name: 'Crema hidratante', price: 28000, price_from: false, sold_out: true },
  ],
  offers: [],
  hours: [],
  isOpenNow: true,
  availability: null,
  serviceMode: 'both',
  agendaOn: false,
};
const opts = { weekday: 1, now: Date.parse('2026-11-14T15:00:00Z') };

test('«¿tienen bloqueador solar disponible?» se responde con el catálogo', () => {
  const found = detectIntent('¿tienen bloqueador solar disponible?', shop.services);
  assert.equal(found.intent, 'services', 'antes caía en «availability» y hablaba de cupos');
  assert.equal(found.services[0]?.id, 'p1');
  const a = answer(shop, found.intent, { ...opts, serviceId: 'p1' });
  assert.equal(a.unanswered, false);
  assert.equal(a.blocks[0].kind === 'text' && a.blocks[0].title, 'Sí, Bloqueador solar está en su catálogo: $42.000');
  const v = voice(a);
  assert.equal(v.lead.b, '$42.000', 'el dato va en negrita');
  assert.equal(v.note, 'Para confirmar que lo tienen hoy, pregúntale.');
});

test('si lo marcaron agotado, se dice', () => {
  const a = answer(shop, 'services', { ...opts, serviceId: 'p2' });
  assert.equal(voice(a).note, 'Lo marcaron agotado por ahora.');
});

test('preguntar precio, duración o cita de algo nombrado no es «¿lo tienen?»', () => {
  assert.equal(detectIntent('¿cuánto vale el bloqueador solar que tienen?', shop.services).intent, 'price');
  assert.equal(detectIntent('¿tienen cupo hoy?', shop.services).intent, 'availability', 'sin nombrar nada del catálogo sigue siendo la agenda');
});

test('domicilio: primero el sí o el no', () => {
  const title = (mode: AnswerData['serviceMode']) => {
    const b = answer({ ...shop, serviceMode: mode }, 'delivery', opts).blocks[0];
    return b.kind === 'text' ? b.title : '';
  };
  assert.equal(title('delivery'), 'Sí, hace domicilios');
  assert.equal(title('both'), 'Sí, hace domicilios y también atiende en el local');
  assert.equal(title('in_place'), 'No hace domicilios: atiende solo en el local');
});
