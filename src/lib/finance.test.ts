import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { VoiceAction } from '../api/ledger.ts';
import { barHeights, bumpLine, draftTotal, expenseInputsFrom, frequentExpenses, qtyOf, removeLine, saleInputFrom, voiceToDraft, weekBars, type DraftLine } from './finance.ts';

const corte = { key: 'i1', name: 'Corte clásico', unitPrice: 20000, itemId: 'i1', source: 'known' as const };

test('el borrador suma lo del catálogo, lo manual y lo de voz', () => {
  let d: DraftLine[] = [];
  d = bumpLine(d, corte, 1);
  d = bumpLine(d, corte, 1);
  d = [...d, { key: 'm1', name: 'Arreglo de barba', qty: 1, unitPrice: 15000, source: 'manual' }];
  d = [...d, { key: 'v1', name: 'Cejas', qty: 1, unitPrice: 5000, source: 'voice' }];
  assert.equal(qtyOf(d, 'i1'), 2);
  assert.equal(draftTotal(d), 60000);
  d = removeLine(d, 'i1');
  assert.equal(draftTotal(d), 20000);
});

test('quitar hasta cero saca la línea; restar a lo que no está no hace nada', () => {
  let d = bumpLine([], corte, 1);
  d = bumpLine(d, corte, -1);
  assert.deepEqual(d, []);
  assert.deepEqual(bumpLine([], corte, -1), []);
});

test('la venta lleva el total y cada línea con su precio', () => {
  const d = bumpLine(bumpLine([], corte, 2), { key: 'm', name: 'Otro', unitPrice: 5000, source: 'manual' }, 1);
  const s = saleInputFrom(d, 'transfer', 'c1');
  assert.equal(s.total, 45000);
  assert.equal(s.method, 'transfer');
  assert.deepEqual(s.lines, [
    { item_id: 'i1', name: 'Corte clásico', qty: 2, unit_price: 20000 },
    { item_id: undefined, name: 'Otro', qty: 1, unit_price: 5000 },
  ]);
});

test('cada línea de gasto es un gasto aparte con su categoría', () => {
  let n = 0;
  const g = expenseInputsFrom(
    [
      { key: 'a', name: 'Cera', qty: 2, unitPrice: 8000, category: 'mercancia', source: 'known' },
      { key: 'b', name: 'Taxi', qty: 1, unitPrice: 7000, category: 'transporte', source: 'manual' },
    ],
    () => `id${++n}`,
  );
  assert.deepEqual(g.map((x) => [x.client_id, x.amount, x.category, x.note]), [
    ['id1', 16000, 'mercancia', '2 × Cera'],
    ['id2', 7000, 'transporte', 'Taxi'],
  ]);
});

test('de siempre: lo repetido, con el último monto; lo de una vez y lo anulado no entran', () => {
  const label = (k: string) => (k === 'transporte' ? 'Transporte' : 'Otro');
  const f = frequentExpenses(
    [
      { occurred_at: '2026-10-01T10:00:00Z', amount: 7000, category: 'mercancia', note: 'Cera', status: 'active' },
      { occurred_at: '2026-10-10T10:00:00Z', amount: 8000, category: 'mercancia', note: 'cera', status: 'active' },
      { occurred_at: '2026-10-05T10:00:00Z', amount: 5000, category: 'transporte', note: '', status: 'active' },
      { occurred_at: '2026-10-06T10:00:00Z', amount: 6000, category: 'transporte', note: '', status: 'active' },
      { occurred_at: '2026-10-07T10:00:00Z', amount: 9000, category: 'transporte', note: '', status: 'active' },
      { occurred_at: '2026-10-08T10:00:00Z', amount: 90000, category: 'otro', note: 'Arreglo silla', status: 'active' },
      { occurred_at: '2026-10-09T10:00:00Z', amount: 3000, category: 'otro', note: 'Gel', status: 'voided' },
      { occurred_at: '2026-10-09T11:00:00Z', amount: 3000, category: 'otro', note: 'Gel', status: 'voided' },
    ],
    label,
  );
  assert.deepEqual(f.map((x) => [x.name, x.amount, x.count]), [
    ['Transporte', 9000, 3],
    ['Cera', 8000, 2],
  ]);
});

test('la semana suma por día local y marca hoy', () => {
  const from = new Date(2026, 9, 19).toISOString(); // lunes 19 oct, medianoche local
  const at = (day: number, h = 12) => new Date(2026, 9, day, h).toISOString();
  const bars = weekBars(
    [
      { occurred_at: at(19), total: 50000, status: 'active' },
      { occurred_at: at(21), total: 30000, status: 'active' },
      { occurred_at: at(21), total: 99999, status: 'voided' },
      { occurred_at: at(26), total: 1, status: 'active' }, // fuera de la semana
    ],
    [{ occurred_at: at(21, 18), amount: 10000, status: 'active' }],
    from,
    new Date(2026, 9, 23, 15),
  );
  assert.deepEqual(bars.map((b) => b.label).join(''), 'LMMJVSD');
  assert.deepEqual(bars.map((b) => b.net), [50000, 0, 20000, 0, 0, 0, 0]);
  assert.equal(bars.findIndex((b) => b.today), 4);
  const h = barHeights(bars);
  assert.equal(h[0], 1);
  assert.equal(h[1], 0.06);
  assert.ok(h[2] > 0.3 && h[2] < 0.5);
});

test('la voz se vuelve líneas del borrador; lo de otro tipo o a crédito se aparta', () => {
  const base = { client_id: 'x', words: '', days_ago: 0 };
  const actions: VoiceAction[] = [
    { ...base, type: 'sale', amount: 40000, method: 'cash', lines: [{ name: 'Corte', qty: 2, unit_price: 20000, item_id: 'i1' }] },
    { ...base, type: 'sale', amount: 5000, method: 'cash', note: 'Cejas' },
    { ...base, type: 'sale', amount: 10000, method: 'credit', note: 'Fiado' },
    { ...base, type: 'expense', amount: 8000, method: 'cash', category: 'mercancia', note: 'Cera' },
  ];
  let n = 0;
  const r = voiceToDraft(actions, 'sale', () => `k${++n}`);
  assert.equal(r.skipped, 2);
  assert.deepEqual(r.lines.map((l) => [l.name, l.qty, l.unitPrice, l.itemId]), [
    ['Corte', 2, 20000, 'i1'],
    ['Cejas', 1, 5000, undefined],
  ]);
  const e = voiceToDraft(actions, 'expense', () => 'e');
  assert.deepEqual(e.lines.map((l) => [l.name, l.unitPrice, l.category]), [['Cera', 8000, 'mercancia']]);
});
