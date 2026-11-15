import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Expense, Sale } from '../api/ledger.ts';
import type { Review } from '../api/types.ts';
import { daySummary, filterCounts, fromExpenses, fromReviews, fromSales, goalProgress, onDay, suggestedTarget } from './activity.ts';

// «Actividad y meta»: lo que pasó, de dónde vino, y la meta del mes con su ritmo.

const sale = (id: string, total: number, extra: Partial<Sale> = {}): Sale =>
  ({ id, client_id: id, occurred_at: '2026-11-13T16:40:00Z', total, method: 'cash', source: 'manual', status: 'active', note: '', lines: [{ name: 'Corte degradado', qty: 1, unit_price: total }], ...extra }) as Sale;
const gasto = (id: string, amount: number): Expense => ({ id, client_id: id, occurred_at: '2026-11-13T15:20:00Z', amount, category: 'supplies', method: 'cash', source: 'manual', status: 'active', note: 'Cuchillas y cera' }) as Expense;

test('cada venta dice de dónde vino', () => {
  const items = fromSales([
    sale('a', 18000, { source: 'appointment' }),
    sale('b', 6000, { source: 'offer_claim' }),
    sale('c', 16000, { method: 'credit', party: { id: 'p', client_id: 'p', kind: 'customer', name: 'Jorge', phone: '', credit_limit: null } }),
    sale('d', 9000, { status: 'voided' }),
  ]);
  assert.deepEqual(items.map((i) => [i.kind, i.from, i.tag]), [
    ['cita', 'Cita por Empre', 'Cobrada'],
    ['oferta', 'Empre Offers · canje', 'Oferta'],
    ['fiado', 'Fiado · Jorge', 'Por cobrar'],
  ], 'lo anulado no entra');
  assert.equal(items[0].title, 'Corte degradado');
});

test('el día: filtros con su número y un resumen solo con lo que hubo', () => {
  const items = onDay([...fromSales([sale('a', 18000), sale('c', 16000, { method: 'credit' })]), ...fromExpenses([gasto('g', 34000)]), ...fromReviews([{ id: 'r', rating: 5, comment: 'Me encantó', created_at: '2026-11-13T16:52:00Z', updated_at: '', user: { name: 'Laura G' } } as unknown as Review])], '2026-11-13');
  assert.equal(items[0].kind, 'resena', 'lo más nuevo primero');
  assert.deepEqual(filterCounts(items).map((f) => `${f.key}:${f.n}`), ['todo:4', 'ventas:1', 'gastos:1', 'fiado:1', 'clientes:1']);
  assert.equal(daySummary(items), '4 movimientos · entró $18.000 · salió $34.000 · fiaste $16.000');
  assert.deepEqual(onDay(items, '2026-11-12'), [], 'otro día, nada');
  assert.equal(daySummary([]), 'Sin movimientos este día');
});

test('la meta: cuánto va, cuánto falta al día y el día normal', () => {
  const g = goalProgress({ month: '2026-11', kind: 'sales', target: 3_000_000 }, 1_920_000, '2026-11-13');
  assert.equal(g.pct, 64);
  assert.equal(g.daysLeft, 17);
  assert.equal(g.left, 1_080_000);
  assert.equal(g.perDay, 64_000, 'redondeado a mil hacia arriba');
  assert.equal(g.normalDay, 148_000);
  assert.equal(goalProgress({ month: '2026-11', kind: 'sales', target: 1000 }, 5000, '2026-11-13').reached, true);
  assert.equal(suggestedTarget(2_710_000), 3_000_000);
  assert.equal(suggestedTarget(0), null, 'sin historia no se propone una cifra');
});
