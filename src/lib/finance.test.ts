import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addDays,
  atHour,
  dayReadings,
  deltaWords,
  hourBars,
  hourCO,
  leftOf,
  hourLabel,
  showHours,
  todayTitle,
  type DaySale,
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

const sale = (hhmm: string, amount: number, name: string, qty = 1): DaySale => ({ at: `2026-11-04T${hhmm}:00-05:00`, amount, items: [{ name, qty }] });

test('hourCO lee la hora de Colombia', () => {
  assert.equal(hourCO('2026-11-04T16:30:00Z'), 11);
  assert.equal(hourCO('2026-11-04T23:30:00-05:00'), 23);
});

test('hourLabel y atHour', () => {
  assert.equal(hourLabel(9), '9 am');
  assert.equal(hourLabel(12), '12 m');
  assert.equal(hourLabel(14), '2 pm');
  assert.equal(atHour(13), 'la 1 pm');
  assert.equal(atHour(14), 'las 2 pm');
});

test('hourBars usa el horario y deja caber lo que queda por fuera', () => {
  const bars = hourBars([sale('07:10', 5000, 'Tinto'), sale('11:00', 30000, 'Corte'), sale('11:40', 16000, 'Aceite')], 16, { open: 9, close: 20 });
  assert.equal(bars[0].hour, 7);
  assert.equal(bars[bars.length - 1].hour, 20);
  const eleven = bars.find((b) => b.hour === 11)!;
  assert.equal(eleven.total, 46000);
  assert.equal(eleven.count, 2);
  assert.equal(bars.find((b) => b.hour === 16)!.isNow, true);
  assert.equal(bars.find((b) => b.hour === 17)!.isFuture, true);
});

test('showHours pide 3 ventas en al menos 2 horas', () => {
  assert.equal(showHours([sale('09:00', 1, 'a'), sale('10:00', 1, 'a')]), false);
  assert.equal(showHours([sale('20:00', 1, 'a'), sale('20:05', 1, 'a'), sale('20:10', 1, 'a')]), false);
  assert.equal(showHours([sale('09:00', 1, 'a'), sale('09:30', 1, 'a'), sale('11:00', 1, 'a')]), true);
});

test('dayReadings dice la mejor hora, lo que más salió y el silencio solo si está abierto', () => {
  const list = [sale('09:20', 22000, 'Corte clásico'), sale('11:05', 30000, 'Corte + barba'), sale('11:40', 16000, 'Aceite'), sale('12:15', 22000, 'Corte clásico'), sale('14:10', 18000, 'Arreglo')];
  const now = new Date('2026-11-04T16:30:00-05:00');
  const open = dayReadings(list, now, true);
  assert.deepEqual(open.map((r) => r.title), ['Tu mejor hora: 11 am', 'Lo que más salió: Corte clásico', 'Llevas 2 horas sin ventas']);
  assert.equal(open[0].sub, '$46.000 en 2 ventas');
  assert.equal(open[2].sub, 'La última fue a las 2 pm');
  assert.equal(dayReadings(list, now, false).some((r) => r.kind === 'quiet'), false);
  assert.deepEqual(dayReadings(list.slice(0, 2), now, true), []);
});

test('dayReadings no dice «lo que más salió» si nada se repite', () => {
  const list = [sale('09:00', 1, 'a'), sale('10:00', 1, 'b'), sale('11:00', 1, 'c')];
  assert.equal(dayReadings(list, new Date('2026-11-04T12:00:00-05:00'), true).some((r) => r.kind === 'top'), false);
});

test('todayTitle y deltaWords', () => {
  assert.equal(todayTitle('2026-11-04'), 'miércoles 4');
  assert.equal(deltaWords(112, 100), '12 % más que el anterior');
  assert.equal(deltaWords(90, 100, 'la anterior'), '10 % menos que la anterior');
  assert.equal(deltaWords(100, 100), 'Igual que el anterior');
  assert.equal(deltaWords(100, 0), null);
});

test('leftOf usa el dato del servidor y, sin él, quita lo fiado', () => {
  const t = { sales_total: 100, expenses_total: 25, by_method: { credit: 30 } };
  assert.equal(leftOf(t), 45);
  assert.equal(leftOf({ ...t, left: 55 }), 55);
  assert.equal(leftOf({ ...t, left: 0 }), 0);
});
