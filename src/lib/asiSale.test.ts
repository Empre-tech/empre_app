import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Expense, PeriodTotals, Sale } from '../api/ledger.ts';
import type { OfferClaim } from '../api/types.ts';
import { hasFacts, keptOf, keptPreview, saleLabel, savedPreview, totalPreview } from './asiSale.ts';

// «Así sale» (tablero «Cada cifra con su porqué»): una vista previa corta y verdadera de por qué sale cada cifra.

const totals = (p: Partial<PeriodTotals>): PeriodTotals =>
  ({ sales_total: 0, sales_count: 0, expenses_total: 0, profit: 0, avg_ticket: 0, by_method: { cash: 0, transfer: 0, card: 0, credit: 0 }, expenses_by_category: {}, gross_margin: 0, margin_coverage_pct: 0, costed_revenue: 0, ...p }) as PeriodTotals;
const sale = (total: number, name: string, extra = 0): Sale => ({ id: name, client_id: name, occurred_at: '2026-11-14T15:00:00Z', total, method: 'cash', source: 'manual', status: 'active', note: '', lines: [{ name, qty: 1, unit_price: total }, ...Array.from({ length: extra }, (_, i) => ({ name: `x${i}`, qty: 1, unit_price: 0 }))] }) as Sale;
const gasto = (amount: number, category: string, note = ''): Expense => ({ id: note || category, client_id: category, occurred_at: '2026-11-14T15:00:00Z', amount, category, method: 'cash', source: 'manual', status: 'active', note }) as Expense;

test('te quedó = entró − salió, y lo fiado no cuenta', () => {
  const k = keptOf(totals({ sales_total: 204000, sales_count: 4, expenses_total: 44000, entered: 186000, out: 44000, left: 142000, by_method: { cash: 0, transfer: 0, card: 0, credit: 18000 } }))!;
  assert.deepEqual(k, { entered: 186000, out: 44000, left: 142000, count: 4, credit: 18000 });
  const p = keptPreview('Barbería El Prado', k, [sale(30000, 'Corte + barba'), sale(120000, 'Tinte completo'), sale(36000, 'Corte degradado')], [gasto(26000, 'supplies', 'cuchillas y talco'), gasto(18000, 'other', 'almuerzo')], '4:12 p. m.');
  assert.equal(p.equation.map((x) => x.t).join(''), 'Entró $186.000 − salió $44.000 = te quedó $142.000');
  assert.equal(p.equation.find((x) => x.result)?.t, '$142.000');
  assert.equal(p.rows[0].title, 'Entró · 4 ventas');
  assert.equal(p.rows[0].sub, 'La más grande: tinte completo, $120.000', 'lo principal, no todo');
  assert.equal(p.rows[1].sub, 'Cuchillas y talco $26.000 · Almuerzo $18.000');
  assert.match(p.note!, /No cuenta lo fiado \(\$18\.000\)/);
  assert.equal(p.warning, undefined);
});

test('si no anotó gastos, lo dice en vez de fingir una ganancia completa', () => {
  const k = keptOf(totals({ sales_total: 71000, sales_count: 2, entered: 71000, out: 0, left: 71000 }))!;
  const p = keptPreview('Rodadero', k, [], [], '4:12 p. m.');
  assert.ok(p.warning?.startsWith('No anotaste gastos hoy'));
  assert.equal(p.rows.length, 1, 'sin gastos no hay fila de «Salió»');
});

test('sin hechos, sin cifra', () => {
  assert.equal(hasFacts(keptOf(totals({}))), false);
  assert.equal(hasFacts(keptOf(undefined)), false);
  assert.equal(hasFacts(keptOf(totals({ sales_count: 1, sales_total: 5000 }))), true);
  // Un servidor viejo sin «entered/out/left»: se arma con ventas sin lo fiado y gastos.
  assert.deepEqual(keptOf(totals({ sales_total: 50000, sales_count: 2, expenses_total: 10000, by_method: { cash: 0, transfer: 0, card: 0, credit: 5000 } })), { entered: 45000, out: 10000, left: 35000, count: 2, credit: 5000 });
});

test('el total suma solo los negocios con movimiento y cada uno dice lo suyo', () => {
  const p = totalPreview([
    { id: 'a', name: 'Barbería El Prado', kept: { entered: 186000, out: 44000, left: 142000, count: 3, credit: 0 } },
    { id: 'b', name: 'El Prado Rodadero', kept: { entered: 71000, out: 0, left: 71000, count: 2, credit: 0 } },
    { id: 'c', name: 'Lavadero La 5', kept: { entered: 0, out: 0, left: 0, count: 0, credit: 0 } },
  ]);
  assert.equal(p.equation.map((x) => x.t).join(''), '$142.000 + $71.000 = te quedó $213.000');
  assert.deepEqual(p.rows.map((r) => r.value), ['$142.000', '$71.000', 'No suma']);
  assert.equal(p.rows[1].sub, 'Entró $71.000 · sin gastos anotados');
  assert.equal(p.warning, 'El Prado Rodadero no anotó gastos hoy: ahí «te quedó» es todo lo que entró.');
});

test('lo ahorrado: cada canje con su negocio y su fecha', () => {
  const claim = (id: string, entity: string, title: string) => ({ id, entity_name: entity, offer: { title } }) as unknown as OfferClaim;
  const p = savedPreview(
    [
      { claim: claim('1', 'Panadería Ana', '2×1 en pan de bono'), saved: 3000, at: '2026-11-03T15:00:00Z' },
      { claim: claim('2', 'Heladería La 22', '−30% en la copa'), saved: 4200, at: '2026-11-08T15:00:00Z' },
      { claim: claim('3', 'Barbería El Prado', '−10% en el corte'), saved: 4800, at: '2026-11-12T15:00:00Z' },
      { claim: claim('4', 'Sin precio', 'Oferta sin precios'), saved: 0, at: '2026-11-13T15:00:00Z' },
    ],
    'noviembre',
  );
  assert.equal(p.equation.map((x) => x.t).join(''), '3 ofertas canjeadas: $4.800 + $4.200 + $3.000 = $12.000');
  assert.equal(p.rows[0].title, 'Barbería El Prado', 'la más nueva primero');
  assert.match(p.rows[0].sub!, /^−10% en el corte · 12 nov/);
  assert.equal(p.rows.length, 3, 'sin precio no hay ahorro que mostrar');
});

test('qué fue una venta, en pocas palabras', () => {
  assert.equal(saleLabel(sale(1000, 'Corte', 2)), 'Corte y 2 más');
  assert.equal(saleLabel({ ...sale(1000, 'x'), lines: [], note: 'Domicilio' } as Sale), 'Domicilio');
});
