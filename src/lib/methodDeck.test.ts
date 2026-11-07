import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDeck, deckCount, deckEntered, expenseEntries, saleEntries } from './methodDeck.ts';

test('mazo: cada venta y gasto cae en su medio, con las ventas partidas en dos', () => {
  const entries = [
    ...saleEntries({ occurred_at: '2026-11-07T14:40:00Z', total: 22000, method: 'cash' }, 'Corte clásico'),
    ...saleEntries({ occurred_at: '2026-11-07T15:00:00Z', total: 30000, method: 'cash', method2: 'transfer', amount2: 10000 }, 'Corte + barba'),
    ...saleEntries({ occurred_at: '2026-11-07T16:00:00Z', total: 18000, method: 'card', method2: 'credit', amount2: 8000 }, 'Arreglo'),
    ...saleEntries({ occurred_at: '2026-11-07T13:00:00Z', total: 9000, method: 'cash', status: 'voided' }, 'Anulada'),
    ...expenseEntries({ occurred_at: '2026-11-07T15:30:00Z', amount: 28000, method: 'cash' }, 'Toallas'),
    ...expenseEntries({ occurred_at: '2026-11-07T15:40:00Z', amount: 60000, method: 'credit' }, 'Compra a crédito'),
  ];
  const deck = buildDeck(entries);
  assert.deepEqual(deck.map((c) => c.method), ['cash', 'transfer', 'card', 'credit']);
  const cash = deck[0];
  assert.deepEqual(cash.moves.map((m) => m.label), ['Corte clásico', 'Corte + barba', 'Toallas']);
  assert.equal(cash.inTotal, 42000);
  assert.equal(cash.outTotal, 28000);
  assert.equal(cash.net, 14000);
  assert.equal(deck[1].inTotal, 10000);
  assert.equal(deck[2].inTotal, 10000);
  assert.equal(deck[3].inTotal, 8000);
  // Lo fiado no es plata que entró.
  assert.equal(deckEntered(deck), 62000);
  assert.equal(deckCount(cash), '3 movimientos');
  assert.equal(deckCount(deck[3]), '1 fiado');
});

test('mazo: sin movimientos no hay tarjetas, salvo la que se pide', () => {
  assert.deepEqual(buildDeck([]), []);
  const only = buildDeck([], ['cash']);
  assert.equal(only.length, 1);
  assert.equal(deckCount(only[0]), 'Sin movimientos hoy');
  // Lo del día sin hora va al final.
  const d = buildDeck([{ at: '', label: 'Fiados que te pagaron', method: 'cash', amount: 5000 }, { at: '2026-11-07T15:00:00Z', label: 'Corte', method: 'cash', amount: 1 }]);
  assert.deepEqual(d[0].moves.map((m) => m.label), ['Corte', 'Fiados que te pagaron']);
});
