import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contactProblem, dayCO, holidaysCO } from './contactRules.ts';

// Instantes en hora de Colombia (UTC−5).
const co = (s: string) => new Date(`${s}-05:00`);

test('holidaysCO: festivos de 2026 (fijos, Emiliani y de Pascua)', () => {
  const h = holidaysCO(2026);
  for (const d of ['2026-01-01', '2026-01-12', '2026-03-23', '2026-04-02', '2026-04-03', '2026-05-18', '2026-06-08', '2026-06-15', '2026-06-29', '2026-07-20', '2026-08-07', '2026-08-17', '2026-10-12', '2026-11-02', '2026-11-16', '2026-12-08', '2026-12-25']) {
    assert.ok(h.has(d), d);
  }
  assert.equal(h.size, 18);
});

test('contactProblem: horario de lunes a viernes, sábado, domingo y festivo', () => {
  assert.equal(contactProblem(co('2026-11-25T10:00:00')), null);
  assert.match(contactProblem(co('2026-11-25T19:30:00')) ?? '', /horario/);
  assert.match(contactProblem(co('2026-11-25T06:30:00')) ?? '', /horario/);
  assert.equal(contactProblem(co('2026-11-28T14:00:00')), null);
  assert.match(contactProblem(co('2026-11-28T15:30:00')) ?? '', /horario/);
  assert.match(contactProblem(co('2026-11-29T10:00:00')) ?? '', /domingo/);
  assert.match(contactProblem(co('2026-12-08T10:00:00')) ?? '', /festivo/);
});

test('contactProblem: una vez al día por persona', () => {
  const at = co('2026-11-25T10:00:00');
  assert.match(contactProblem(at, dayCO(at)) ?? '', /una vez al día/);
  assert.equal(contactProblem(at, '2026-11-24'), null);
});
