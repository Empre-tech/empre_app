import assert from 'node:assert/strict';
import { test } from 'node:test';
import { liveRows, micLevel, phaseCopy, voicePhase, wordTone } from './voiceStage.ts';

const base = { listening: false, busy: false, text: '', error: null as string | null };

test('fases en orden de prioridad', () => {
  assert.equal(voicePhase(base), 'ready');
  assert.equal(voicePhase({ ...base, listening: true, text: 'vendí' }), 'listening');
  assert.equal(voicePhase({ ...base, busy: true, listening: true }), 'thinking', 'armando gana a escuchando');
  assert.equal(voicePhase({ ...base, text: 'vendí dos' }), 'heard');
  assert.equal(voicePhase({ ...base, error: 'No se escuchó nada.', errorCode: 'no-speech' }), 'missed');
  assert.equal(voicePhase({ ...base, error: 'No se escuchó nada.', errorCode: 'no-speech', text: 'vendí' }), 'error', 'con texto ya dicho no es «no te escuché»');
  assert.equal(voicePhase({ ...base, error: 'Sin permiso', errorCode: 'not-allowed' }), 'error');
});

test('lo que dice cada fase, con la Chispa en su estado', () => {
  assert.equal(phaseCopy('listening', 'finance', true).mood, 'reposo');
  assert.equal(phaseCopy('thinking', 'finance', true).mood, 'pensando');
  assert.equal(phaseCopy('missed', 'finance', true).mood, 'nosabe');
  assert.equal(phaseCopy('ready', 'inventory', true).body, 'Dile qué se acabó, qué queda poco o cuánto llegó. Tú confirmas antes de cambiar.');
  assert.equal(phaseCopy('ready', 'finance', false).title, 'Escríbelo', 'sin dictado no se promete hablar');
  assert.equal(phaseCopy('heard', 'search', true).status, 'Toca seguir y busco', 'buscar no guarda nada');
  assert.equal(phaseCopy('heard', 'finance', true).status, 'Nada se guarda hasta que confirmes');
  assert.equal(phaseCopy('error', 'finance', true, 'Necesitas conexión').body, 'Necesitas conexión');
  assert.ok(phaseCopy('ready', 'finance', true).big && !phaseCopy('listening', 'finance', true).big);
});

test('volumen del micrófono a nivel del aura', () => {
  assert.equal(micLevel(-2), 0, 'bajo 0 no se oye');
  assert.equal(micLevel(0), 0);
  assert.equal(micLevel(5), 0.5);
  assert.equal(micLevel(14), 1, 'nunca más de 1');
  assert.equal(micLevel(Number.NaN), 0);
});

test('cada palabra con su tono de la paleta', () => {
  assert.equal(wordTone('item'), 'item');
  assert.equal(wordTone('filter'), 'good');
  assert.equal(wordTone('stock_out'), 'bad');
  assert.equal(wordTone('stock_low'), 'warn');
  assert.equal(wordTone(undefined), null);
});

const none = { lines: [], stock: [], expense: null, searchFilters: { open_now: false, with_offer: false, delivery: false, cheapest: false }, method: null, fiadoTo: null };
const money = (n: number) => `$${n}`;

test('filas en vivo: ventas con su medio, gasto y existencias', () => {
  const rows = liveRows(
    {
      ...none,
      lines: [
        { name: 'Empanada', qty: 2, price: 3000, fixed: false },
        { name: 'Jugo', qty: 1, price: null, fixed: true },
      ],
      method: 'Nequi',
      expense: { amount: 20000, what: 'gas' },
      stock: [
        { name: 'Harina', level: 'out' },
        { name: 'Café', level: 'low' },
        { name: 'Pan', level: 'ok', counted: 30 },
      ],
    },
    'finance',
    'x',
    money,
  );
  assert.deepEqual(
    rows.map((r) => [r.tag, r.title, r.value, r.tone]),
    [
      ['VENTA · NEQUI', '2 × Empanada', '$6000', 'good'],
      ['VENTA · NEQUI', '1 × Jugo (corregido)', '', 'good'],
      ['GASTO', 'gas', '−$20000', 'bad'],
      ['SE ACABÓ', 'Harina', 'Agotado', 'bad'],
      ['QUEDA POCO', 'Café', 'Poco', 'warn'],
      ['HAY', 'Pan', 'Hay 30', 'good'],
    ],
  );
  assert.equal(liveRows({ ...none, lines: [{ name: 'Pan', qty: 1, price: 1000, fixed: false }], fiadoTo: 'Rosa' }, 'finance', 'x', money)[0].tag, 'FIADO · ROSA');
});

test('filas en vivo de búsqueda: lo buscado y sus condiciones; sin texto, nada', () => {
  assert.deepEqual(liveRows(none, 'search', '  ', money), []);
  const rows = liveRows({ ...none, searchFilters: { open_now: true, with_offer: true, delivery: false, cheapest: false } }, 'search', 'comida rápida abierta con oferta', money);
  assert.deepEqual(
    rows.map((r) => r.title),
    ['comida rápida abierta con oferta', 'Abierto ahora', 'Con oferta'],
  );
});
