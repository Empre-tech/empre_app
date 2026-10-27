import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addDays,
  bestSlot,
  bucketLabel,
  compareText,
  daysBetween,
  deltaLabel,
  heatLevel,
  lowMargin,
  marginPct,
  monthGrid,
  pickDay,
  presetRange,
  rangeFromParams,
  rangeLabel,
  rangeTitle,
  rankProducts,
  todayCO,
  topMismatch,
  weekdayIndex,
} from './finance.ts';

test('hoy en Colombia (UTC−5)', () => {
  assert.equal(todayCO(new Date('2026-10-28T03:00:00Z')), '2026-10-27');
  assert.equal(todayCO(new Date('2026-10-28T06:00:00Z')), '2026-10-28');
});

test('sumar días y contar días', () => {
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(daysBetween('2026-10-05', '2026-10-18'), 14);
  assert.equal(daysBetween('2026-10-05', '2026-10-05'), 1);
  assert.equal(weekdayIndex('2026-10-26'), 0); // lunes
});

test('atajos de fechas y con qué se comparan', () => {
  const t = '2026-10-27';
  assert.deepEqual(presetRange('7d', t), { from: '2026-10-21', to: t, compare: 'prev', preset: '7d' });
  assert.deepEqual(presetRange('month', t), { from: '2026-10-01', to: t, compare: 'month', preset: 'month' });
  assert.deepEqual(presetRange('lastMonth', t), { from: '2026-09-01', to: '2026-09-30', compare: 'month', preset: 'lastMonth' });
  assert.deepEqual(presetRange('lastMonth', '2026-01-15'), { from: '2025-12-01', to: '2025-12-31', compare: 'month', preset: 'lastMonth' });
  assert.equal(presetRange('year', t).compare, 'year');
});

test('nombres de rangos', () => {
  const t = '2026-10-27';
  assert.equal(rangeLabel('2026-10-18', '2026-10-18', t), '18 oct');
  assert.equal(rangeLabel('2026-10-05', '2026-10-18', t), '5 – 18 oct');
  assert.equal(rangeLabel('2026-09-28', '2026-10-03', t), '28 sep – 3 oct');
  assert.equal(rangeLabel('2025-12-28', '2026-01-03', t), '28 dic 2025 – 3 ene 2026');
  assert.equal(rangeTitle({ from: '2026-10-05', to: '2026-10-18' }, t), '5 – 18 oct · 14 días');
});

test('cambios: subir ventas es bueno, subir gastos no', () => {
  assert.deepEqual(deltaLabel(112, 100), { text: '▲ 12 %', tone: 'good' });
  assert.deepEqual(deltaLabel(90, 100), { text: '▼ 10 %', tone: 'bad' });
  assert.deepEqual(deltaLabel(110, 100, true), { text: '▲ 10 %', tone: 'bad' });
  assert.deepEqual(deltaLabel(5, 0), { text: 'Sin datos antes', tone: 'flat' });
  assert.equal(deltaLabel(0, 0), null);
});

test('etiquetas de las barras', () => {
  assert.equal(bucketLabel('day', '2026-10-26', 7), 'L');
  assert.equal(bucketLabel('day', '2026-10-26', 27), '26');
  assert.equal(bucketLabel('week', '2026-10-05', 9), '5/10');
  assert.equal(bucketLabel('month', '2026-10-01', 10), 'oct');
});

test('mapa de calor y mejor momento', () => {
  assert.equal(heatLevel(0, 10), 0);
  assert.equal(heatLevel(10, 10), 3);
  assert.equal(heatLevel(5, 10), 2);
  assert.equal(heatLevel(1, 10), 1);
  const heat = Array.from({ length: 7 }, () => [0, 0, 0, 0]);
  assert.equal(bestSlot(heat), null);
  heat[5][1] = 900;
  heat[2][3] = 100;
  assert.equal(bestSlot(heat), 'sábado al mediodía');
});

test('calendario: octubre 2026 empieza jueves', () => {
  const g = monthGrid(2026, 10);
  assert.equal(g.filter((x) => x === null).length, 3);
  assert.equal(g[3], '2026-10-01');
  assert.equal(g.length, 3 + 31);
});

test('elegir un rango con dos toques', () => {
  let r = pickDay({ from: null, to: null }, '2026-10-10');
  assert.deepEqual(r, { from: '2026-10-10', to: null });
  r = pickDay(r, '2026-10-05');
  assert.deepEqual(r, { from: '2026-10-05', to: '2026-10-10' });
  assert.deepEqual(pickDay(r, '2026-10-20'), { from: '2026-10-20', to: null });
});

test('productos: lo que más vendes contra lo que más te deja', () => {
  const list = [
    { name: 'Gaseosa', revenue: 968, profit: 116, margin_pct: 12 },
    { name: 'Aceite', revenue: 680, profit: 212, margin_pct: 31 },
    { name: 'Bolsa', revenue: 50, profit: null, margin_pct: null },
    { name: 'Leche', revenue: 300, profit: -20, margin_pct: -6.7 },
  ];
  assert.deepEqual(rankProducts(list, 'revenue').map((p) => p.name), ['Gaseosa', 'Aceite', 'Leche', 'Bolsa']);
  assert.deepEqual(rankProducts(list, 'profit').map((p) => p.name), ['Aceite', 'Gaseosa', 'Leche', 'Bolsa']);
  assert.deepEqual(lowMargin(list).map((p) => p.name), ['Leche']);
  assert.match(topMismatch(list) ?? '', /«Gaseosa» es lo que más vendes, pero te deja el 12 %/);
});


test('margen, parámetros y comparación', () => {
  assert.equal(marginPct({ gross_margin: 6000, costed_revenue: 20000 }), 30);
  assert.equal(marginPct({ gross_margin: 0, costed_revenue: 0 }), null);
  assert.deepEqual(rangeFromParams({ from: '2026-10-05', to: '2026-10-18', compare: 'year' }, '2026-10-27'), { from: '2026-10-05', to: '2026-10-18', compare: 'year', preset: 'custom' });
  assert.equal(rangeFromParams({ from: 'x' }, '2026-10-27').preset, 'month');
  assert.equal(compareText({ compare_from: '2026-09-01', compare_to: '2026-09-27' }, '2026-10-27'), 'comparado con 1 – 27 sep');
});
