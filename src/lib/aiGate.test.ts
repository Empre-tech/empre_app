import assert from 'node:assert/strict';
import { test } from 'node:test';
import { asksCommitment, fichaAnswer, isFichaIntent } from './answers.ts';
import { lookingLabel, sliceWords, sourceLine, voice, wordCount } from './chatVoice.ts';

// Empre AI aparece solo cuando sabe (tablero «Empre AI · cuándo responde y cómo se ve», 2026-11-14).

test('un compromiso del negocio no lo responde Empre AI', () => {
  for (const q of ['¿Me la apartan a las 5 a nombre de Laura?', 'apártame dos para las 7', '¿me lo dejan en 20 mil?', '¿Me hacen un descuento?', 'Quiero encargar una torta', 'si llevo dos ¿hay descuento?', '¿me guardan uno?']) {
    assert.equal(asksCommitment(q), true, q);
  }
  for (const q of ['¿Tienen hora hoy a las 5?', '¿Aceptan Nequi?', '¿Tienen descuento hoy?', '¿Hacen domicilio?', '¿Quiero saber el precio del corte', '¿Atienden niños?']) {
    assert.equal(asksCommitment(q), false, q);
  }
});

test('lo que leyó en la ficha se dice tal cual, con de dónde salió', () => {
  assert.ok(isFichaIntent('ficha_carta') && isFichaIntent('ficha_resenas') && !isFichaIntent('price') && !isFichaIntent(undefined));
  const a = fichaAnswer('Sí, aceptan Nequi: lo dice su perfil.', 'ficha_perfil', 'Carta');
  assert.equal(a.source, 'Según su perfil');
  assert.equal(fichaAnswer('x', 'ficha_carta', 'Catálogo').source, 'Según su catálogo');
  const v = voice(a);
  assert.equal(v.lead.a, 'Sí, aceptan Nequi: lo dice su perfil.', 'sin partir en «dato en negrita» por los dos puntos');
  assert.equal(v.lead.b, '');
});

test('se escribe palabra por palabra sin perder la negrita', () => {
  const parts = [{ t: 'Corte + barba cuesta ' }, { t: '$30.000', bold: true }, { t: ' y dura 30 min.' }];
  assert.equal(wordCount(parts), 9);
  assert.deepEqual(sliceWords(parts, 0), []);
  assert.deepEqual(sliceWords(parts, 3).map((p) => p.t), ['Corte + barba']);
  assert.deepEqual(sliceWords(parts, 4).map((p) => p.t), ['Corte + barba cuesta'], 'la negrita aparece con su palabra');
  const five = sliceWords(parts, 5);
  assert.equal(five[1].t, '$30.000');
  assert.equal(five[1].bold, true);
  assert.equal(sliceWords(parts, 99).map((p) => p.t).join(''), 'Corte + barba cuesta $30.000 y dura 30 min.');
});

test('de dónde salió, en una línea', () => {
  assert.equal(sourceLine(['Según su agenda de hoy'], 'El Prado'), 'De su agenda de hoy');
  assert.equal(sourceLine(['Según su vitrina', 'Según su perfil', 'Según su vitrina'], 'El Prado'), 'De su vitrina y su perfil');
  assert.equal(sourceLine([''], 'El Prado'), 'De lo que publicó El Prado');
  assert.equal(sourceLine(['Respuesta de El Prado'], 'El Prado'), 'Respuesta de El Prado');
  assert.equal(lookingLabel('services', 'Carta'), 'Revisando su carta…');
  assert.equal(lookingLabel('unknown', 'Carta'), 'Revisando lo que publicó…');
});
