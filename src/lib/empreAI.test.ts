import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chosenCost, dayToExplain, explainDay, offerTitleIdeas, priceVerdict, quietSlot, suggestedPrice } from './empreAI.ts';

// 2026-11-03 es martes y 2026-11-07, sábado.
const week = {
  series: [
    { start: '2026-11-02', sales: 92000, expenses: 0 },
    { start: '2026-11-03', sales: 79000, expenses: 20000 },
    { start: '2026-11-07', sales: 152000, expenses: 0 },
  ],
  normal: [90000, 101000, 130000],
};

test('dayToExplain elige el día que más se salió de lo normal', () => {
  assert.equal(dayToExplain(week), 1);
  assert.equal(dayToExplain({ series: week.series }), 2);
});

test('un día normal no se explica', () => {
  const e = explainDay(week, 0);
  assert.equal(e.tag, 'Lo de siempre');
  assert.match(e.headline, /no hay nada que explicar/);
  assert.equal(e.unknown, null);
  assert.equal(e.suggestOffer, false);
});

test('un día bajo separa lo que se sabe de lo que no y sugiere probar', () => {
  const e = explainDay(week, 1);
  assert.equal(e.name, 'martes');
  assert.equal(e.tag, '−22 % frente a lo normal');
  assert.deepEqual(e.facts, ['Un martes normal vendes $101.000', 'Ese día gastaste $20.000']);
  assert.match(e.unknown ?? '', /Por qué pasó/);
  assert.equal(e.suggestOffer, true);
});

test('un día alto no empuja a ofertar y sin base no compara', () => {
  assert.equal(explainDay(week, 2).suggestOffer, false);
  const none = explainDay({ series: week.series }, 2);
  assert.match(none.headline, /Aún no hay con qué compararlo/);
  assert.equal(none.tag, null);
});

test('sin normal usa el periodo anterior', () => {
  const e = explainDay({ series: week.series, previous_series: [100000, 100000, 100000] }, 2);
  assert.equal(e.tag, '+52 % frente al anterior');
});

test('quietSlot pide datos y elige la casilla más baja con ventas', () => {
  assert.equal(quietSlot([[5, 0, 0, 0]]), null);
  const heat = [[10, 10, 3, 10], [10, 10, 10, 10]];
  assert.equal(quietSlot(heat), 'lunes en la tarde');
});

test('chosenCost suma y exige costo de todos', () => {
  const products = [
    { name: 'Corte', qty: 10, revenue: 200000, costed_revenue: 200000, profit: 150000 },
    { name: 'Barba', qty: 5, revenue: 50000, costed_revenue: 0, profit: null },
  ];
  assert.equal(chosenCost(['Corte'], products), 5000);
  assert.equal(chosenCost(['Corte', 'Barba'], products), null);
  assert.equal(chosenCost(['Otro'], products), null);
  assert.equal(chosenCost([], products), null);
});

test('priceVerdict avisa si se pierde y calla sin costo', () => {
  assert.deepEqual(priceVerdict(5000, 12000), { text: 'Con este precio te quedan $7.000 por venta.', warn: false });
  assert.equal(priceVerdict(5000, 4000)?.warn, true);
  assert.equal(priceVerdict(5000, 5000)?.warn, true);
  assert.equal(priceVerdict(null, 4000), null);
  assert.equal(priceVerdict(5000, undefined), null);
});

test('suggestedPrice da ahorro sin bajar del costo', () => {
  assert.equal(suggestedPrice(null, 30000), 24000);
  assert.equal(suggestedPrice(25000, 30000), 29000);
  assert.equal(suggestedPrice(29000, 30000), null);
  assert.equal(suggestedPrice(5000, null), null);
});

test('offerTitleIdeas solo dice lo que la oferta es', () => {
  assert.deepEqual(offerTitleIdeas(['Corte', 'Barba'], 30000, 40000), ['Corte + Barba a $30.000', 'Corte + Barba con 25 % menos', 'Corte + Barba solo por hoy']);
  assert.deepEqual(offerTitleIdeas(['Corte'], null, null), ['Corte solo por hoy']);
  assert.deepEqual(offerTitleIdeas([], 30000, 40000), []);
});
