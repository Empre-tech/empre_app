import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { VoiceAction } from '../api/ledger.ts';
import { amountMask, barHeights, bumpLine, cleanSpeech, draftTotal, expenseInputsFrom, capsuleView, colombiaDay, prepareVoiceActions, typedLine, withTyped, qtyOf, removeLine, saleInputFrom, usualExpenseItems, voiceToDraft, weekBars, type DraftLine } from './finance.ts';

test('el dictado sin las repeticiones del reconocedor', () => {
  // El caso real de la prueba en el teléfono (23 oct).
  assert.equal(
    cleanSpeech('registra $20,000 por dos cortes de cabello 30,000 en almuerzos 70 70,000 en impuestos 300,000 en arriendo'),
    'registra $20,000 por dos cortes de cabello 30,000 en almuerzos 70,000 en impuestos 300,000 en arriendo',
  );
  assert.equal(cleanSpeech('vendí vendí dos cortes'), 'vendí dos cortes');
  assert.equal(cleanSpeech('  20 2000 '), '2000');
  // Dos números distintos seguidos no se tocan.
  assert.equal(cleanSpeech('pagué 20 30.000'), 'pagué 20 30.000');
  assert.equal(cleanSpeech(''), '');
});

test('los montos del dictado se resaltan completos', () => {
  const mark = (t: string) => {
    const w = t.split(' ');
    return amountMask(w).map((m, i) => (m ? w[i] : null)).filter(Boolean).join(' ');
  };
  assert.equal(mark('vendí dos cortes a veinte mil en efectivo'), 'veinte mil');
  assert.equal(mark('compré cera por ocho mil y gel por treinta y cinco mil pesos'), 'ocho mil treinta y cinco mil pesos');
  assert.equal(mark('registra $20,000 por dos cortes 300,000 en arriendo'), '$20,000 300,000');
  assert.equal(mark('pagué dos millones de pesos de arriendo'), 'dos millones de pesos');
  // «dos cortes», «una barba» o un 3 suelto no son montos.
  assert.equal(mark('dos cortes y una barba en la silla 3'), '');
});

test('una venta con productos sin precio se guarda por su total', () => {
  const base = { client_id: 'x', words: '', days_ago: 0, method: 'cash' as const };
  const out = prepareVoiceActions([
    { ...base, type: 'sale', amount: 20000, lines: [{ name: 'corte de cabello', qty: 2, unit_price: null }] },
    { ...base, type: 'sale', amount: 40000, lines: [{ name: 'Corte', qty: 2, unit_price: 20000, item_id: 'i1' }] },
    { ...base, type: 'expense', amount: 30000, category: 'otro', note: 'almuerzos' },
  ]);
  assert.equal(out[0].lines, undefined);
  assert.equal(out[0].note, '2 × corte de cabello');
  assert.equal(out[0].amount, 20000);
  assert.equal(out[1].lines?.length, 1); // con precio, los productos se conservan
  assert.equal(out[2].note, 'almuerzos');
});

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

test('de siempre: el nombre es la nota o la categoría', () => {
  const label = (k: string) => (k === 'transporte' ? 'Transporte' : 'Otro');
  const f = usualExpenseItems(
    [
      { key: 'note:cera', note: 'Cera', category: 'mercancia', amount: 8000, count: 2 },
      { key: 'cat:transporte', note: '  ', category: 'transporte', amount: 9000, count: 3 },
    ],
    label,
  );
  assert.deepEqual(f.map((x) => [x.key, x.name, x.amount]), [
    ['note:cera', 'Cera', 8000],
    ['cat:transporte', 'Transporte', 9000],
  ]);
});

test('lo escrito a mano cuenta sin tocar «Agregar»', () => {
  const draft: DraftLine[] = [{ key: 'item:1', name: 'Corte', qty: 1, unitPrice: 20000, source: 'known' }];
  assert.equal(typedLine('m1', 0, 'Barba', 'Otro'), null);
  const t = typedLine('m1', 45000, '  ', 'Otro');
  assert.deepEqual(t, { key: 'm1', name: 'Otro', qty: 1, unitPrice: 45000, category: undefined, source: 'manual' });
  assert.equal(draftTotal(withTyped(draft, t)), 65000);
  assert.equal(withTyped(draft, null), draft);
  assert.equal(typedLine('m2', 7000, 'Taxi', 'Transporte', 'transporte')?.category, 'transporte');
});

test('sin resumen no se muestra un $0 falso', () => {
  assert.deepEqual(capsuleView(45000, false, false, '$45.000'), { amount: 45000, label: 'Hoy te quedó', a11y: 'Te quedó hoy $45.000. Abrir Empre Finance' });
  const server = capsuleView(0, true, false, '$0');
  assert.equal(server.amount, null);
  assert.equal(server.label, 'Resumen no disponible');
  assert.ok(!server.a11y.includes('$0'));
  assert.equal(capsuleView(0, true, true, '$0').label, 'Sin conexión · registra igual');
});

test('la semana viene sumada del servidor; hoy suma lo que está en camino', () => {
  const days = ['19', '20', '21', '22', '23', '24', '25'].map((d, i) => ({ date: `2026-10-${d}`, sales: i === 0 ? 50000 : i === 2 ? 30000 : 0, expenses: i === 2 ? 10000 : 0 }));
  const bars = weekBars(days, '2026-10-23', 4000);
  assert.deepEqual(bars.map((b) => b.label).join(''), 'LMMJVSD');
  assert.deepEqual(bars.map((b) => b.net), [50000, 0, 20000, 0, 4000, 0, 0]);
  assert.equal(bars.findIndex((b) => b.today), 4);
  assert.equal(colombiaDay(new Date('2026-10-24T03:00:00Z')), '2026-10-23'); // 10 pm del 23 en Colombia
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
