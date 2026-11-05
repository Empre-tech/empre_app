import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clockLabel, rangeWords, readClock, readDayRange, readNightRange } from './clockWords.ts';

const day = (a: string, b: string) => {
  const r = readDayRange(a, b);
  return r.ok && r.range ? `${r.range.start}-${r.range.end}` : r.ok ? 'nada' : `error:${r.field}`;
};
const night = (a: string, b: string) => {
  const r = readNightRange(a, b);
  return r.ok && r.range ? `${r.range.start}-${r.range.end}` : `error:${r.ok ? '' : r.field}`;
};

test('el descanso entiende lo que escribe la gente', () => {
  assert.equal(day('12', '1'), '12:00-13:00');
  assert.equal(day('1', '2'), '13:00-14:00');
  assert.equal(day('11', '1'), '11:00-13:00');
  assert.equal(day('12:30', '1:30'), '12:30-13:30');
  assert.equal(day('12 y media', '2'), '12:30-14:00');
  assert.equal(day('130', '230'), '13:30-14:30');
  assert.equal(day('mediodía', '1 pm'), '12:00-13:00');
  assert.equal(day('12:00', '13:00'), '12:00-13:00');
  assert.equal(day('12.30', '1.30 p.m.'), '12:30-13:30');
});

test('el descanso avisa qué campo falla', () => {
  assert.equal(day('', ''), 'nada');
  assert.equal(day('12', ''), 'error:end');
  assert.equal(day('', '1'), 'error:start');
  assert.equal(day('almuerzo', '1'), 'error:start');
  assert.equal(day('3 pm', '1 pm'), 'error:end');
  assert.equal(day('12', '25'), 'error:end');
});

test('el silencio empieza de noche y termina de mañana', () => {
  assert.equal(night('9', '7'), '21:00-07:00');
  assert.equal(night('21:00', '07:00'), '21:00-07:00');
  assert.equal(night('10 pm', '6 am'), '22:00-06:00');
  assert.equal(night('12', '6'), '00:00-06:00');
  assert.equal(night('', '7'), 'error:start');
  assert.equal(night('7 am', '7'), 'error:end');
});

test('readClock no inventa', () => {
  assert.equal(readClock('13 pm'), null);
  assert.equal(readClock('12:75'), null);
  assert.equal(readClock('a'), null);
  assert.deepEqual(readClock('12 am'), { h: 0, m: 0, sure: true });
});

test('se lee como se dice', () => {
  assert.equal(clockLabel('12:00'), '12 m');
  assert.equal(clockLabel('13:30'), '1:30 pm');
  assert.equal(clockLabel('00:00'), '12 am');
  assert.equal(rangeWords({ start: '12:00', end: '13:00' }), 'De 12 m a 1 pm · 1 hora');
  assert.equal(rangeWords({ start: '12:30', end: '14:00' }), 'De 12:30 m a 2 pm · 1 hora y 30 min');
  assert.equal(rangeWords({ start: '21:00', end: '07:00' }), 'De 9 pm a 7 am · 10 horas');
});
