import assert from 'node:assert/strict';
import test from 'node:test';

import type { LedgerSummary } from '../api/ledger';
import { categoryLabel, formatPesos } from './ledger.ts';
import { categoryRows, dayName, dayNets, insights, insightText, methodSlices, periodResult, topRows } from './ledgerInsights.ts';

const W = { pesos: formatPesos, category: categoryLabel };

function summary(over: Partial<LedgerSummary> = {}): LedgerSummary {
  return {
    from: '2026-10-24T05:00:00Z',
    to: '2026-10-25T05:00:00Z',
    period: 'day',
    sales_total: 256000,
    sales_count: 9,
    expenses_total: 140000,
    profit: 116000,
    by_method: { cash: 156000, transfer: 60000, card: 0, credit: 40000 },
    expenses_by_category: { mercancia: 90000, servicios: 35000, transporte: 15000 },
    gross_margin: 0,
    margin_coverage_pct: 30,
    top_items: [
      { name: 'Corte clásico', qty: 4, revenue: 80000 },
      { name: 'Barba', qty: 5, revenue: 60000 },
      { name: 'Corte + barba', qty: 2, revenue: 56000 },
      { name: 'Cejas', qty: 2, revenue: 30000 },
    ],
    debts_collected: 0,
    debts_paid: 0,
    receivable: 85000,
    payable: 0,
    cash_in: 216000,
    cash_out: 140000,
    prev_sales_total: 210000,
    prev_expenses_total: 120000,
    ...over,
  };
}

test('el resultado: te quedó, de cada $100 y la comparación', () => {
  const r = periodResult(summary());
  assert.equal(r.net, 116000);
  assert.equal(r.per100, 45);
  assert.equal(r.changePct, 29); // 116.000 frente a 90.000
  assert.ok(Math.abs(r.keepShare + r.spendShare - 1) < 1e-9);
  // Lo que está en camino también cuenta.
  assert.equal(periodResult(summary(), { sales: 20000, expenses: 0 }).net, 136000);
});

test('no compara con una base pequeña ni con pérdida', () => {
  assert.equal(periodResult(summary({ prev_sales_total: 15000, prev_expenses_total: 0 })).changePct, null);
  const loss = periodResult(summary({ sales_total: 60000, expenses_total: 185000 }));
  assert.equal(loss.net, -125000);
  assert.equal(loss.changePct, null);
  assert.equal(loss.per100, 308); // por cada $100 vendidos se gastaron $308
  assert.equal(loss.keepShare, 0);
  // Un día que apenas empieza no se compara con ayer.
  assert.equal(periodResult(summary({ sales_total: 0, expenses_total: 0 })).changePct, null);
});

test('caja, gastos y lo más vendido, con su parte', () => {
  assert.deepEqual(methodSlices(summary()).map((m) => m.key), ['cash', 'transfer', 'credit']); // tarjeta en cero no sale
  const cats = categoryRows(summary(), W);
  assert.deepEqual(cats.map((c) => [c.label, Math.round(c.share * 100)]), [['Mercancía', 64], ['Servicios', 25], ['Transporte', 11]]);
  assert.equal(cats[0].rel, 1);
  const top = topRows(summary());
  assert.equal(top.length, 3);
  assert.deepEqual([top[0].label, top[0].qty, Math.round(top[0].share * 100)], ['Corte clásico', 4, 31]);
});

test('las barras por día marcan hoy y el mejor día', () => {
  const week = summary({
    period: 'week',
    days: ['19', '20', '21', '22', '23', '24', '25'].map((d, i) => ({ date: `2026-10-${d}`, sales: [90, 120, 80, 140, 260, 116, 0][i] * 1000, expenses: 0 })),
  });
  const bars = dayNets(week, '2026-10-24', 4000);
  assert.equal(bars.map((b) => b.label).join(''), 'LMMJVSD');
  assert.equal(bars.find((b) => b.today)?.net, 120000);
  assert.equal(bars.find((b) => b.best)?.date, '2026-10-23');
  assert.equal(dayName('2026-10-23', 'week'), 'el viernes');
  assert.equal(dayName('2026-10-05', 'month'), 'el 5 de octubre');
});

test('lo que dicen tus números: un día normal', () => {
  const s = summary();
  const list = insights(s, periodResult(s), '2026-10-24', W);
  assert.deepEqual(list.map((i) => i.key), ['category', 'top-item', 'credit']);
  assert.equal(insightText(list[0]), 'Mercancía fue el 64 % de tus gastos ($90.000).');
  assert.equal(list[2].action, 'debts');
});

test('lo que dicen tus números: pérdida primero, y nada sin movimientos', () => {
  const s = summary({ sales_total: 60000, expenses_total: 185000, by_method: { cash: 60000, transfer: 0, card: 0, credit: 0 }, expenses_by_category: { mercancia: 150000, transporte: 35000 }, top_items: [{ name: 'Corte clásico', qty: 2, revenue: 40000 }] });
  const list = insights(s, periodResult(s), '2026-10-24', W);
  assert.equal(list[0].key, 'loss');
  assert.equal(insightText(list[0]), 'Gastaste $125.000 más de lo que vendiste. Lo que más pesó: Mercancía ($150.000).');
  assert.deepEqual(list.map((i) => i.key), ['loss', 'top-item', 'costs']);
  const empty = summary({ sales_total: 0, expenses_total: 0, top_items: [], expenses_by_category: {}, by_method: { cash: 0, transfer: 0, card: 0, credit: 0 } });
  assert.deepEqual(insights(empty, periodResult(empty), '2026-10-24', W), []);
});

test('lo que dicen tus números: gastos altos y el mejor día de la semana', () => {
  const s = summary({
    period: 'week',
    sales_total: 100000,
    expenses_total: 70000,
    expenses_by_category: { arriendo: 40000, mercancia: 30000 },
    by_method: { cash: 100000, transfer: 0, card: 0, credit: 0 },
    top_items: [{ name: 'Corte', qty: 5, revenue: 25000 }],
    margin_coverage_pct: 80,
    days: [{ date: '2026-10-20', sales: 60000, expenses: 10000 }, { date: '2026-10-21', sales: 40000, expenses: 60000 }],
  });
  const list = insights(s, periodResult(s), '2026-10-24', W);
  assert.deepEqual(list.map((i) => i.key), ['spend', 'best-day']);
  assert.equal(insightText(list[0]), 'Tus gastos se llevaron el 70 % de lo que vendiste. El más grande: Arriendo ($40.000).');
  assert.equal(insightText(list[1]), 'Tu mejor día fue el martes: te quedaron $50.000.');
});

test('lo que dicen tus números: nada obvio con una sola categoría o un solo día', () => {
  const s = summary({
    period: 'week',
    sales_total: 65000,
    expenses_total: 15000,
    expenses_by_category: { transporte: 15000 },
    by_method: { cash: 65000, transfer: 0, card: 0, credit: 0 },
    top_items: [{ name: 'Corte', qty: 1, revenue: 45000 }],
    margin_coverage_pct: 80,
    days: [{ date: '2026-10-24', sales: 65000, expenses: 15000 }, { date: '2026-10-25', sales: 0, expenses: 0 }],
  });
  assert.deepEqual(insights(s, periodResult(s), '2026-10-25', W).map((i) => i.key), ['top-item']);
});
