import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTapGate } from './doubleTap.ts';

// Reloj y temporizadores falsos: el tiempo solo avanza cuando la prueba lo dice.
function fakeClock() {
  let t = 0;
  let timers: { at: number; fn: () => void; id: number }[] = [];
  let next = 1;
  return {
    now: () => t,
    schedule: (fn: () => void, ms: number) => {
      const id = next++;
      timers.push({ at: t + ms, fn, id });
      return id;
    },
    clear: (id: unknown) => {
      timers = timers.filter((x) => x.id !== id);
    },
    advance(ms: number) {
      t += ms;
      const due = timers.filter((x) => x.at <= t);
      timers = timers.filter((x) => x.at > t);
      due.forEach((x) => x.fn());
    },
  };
}

function gate() {
  const clock = fakeClock();
  const calls: string[] = [];
  const g = createTapGate({ onSingle: () => calls.push('single'), onDouble: () => calls.push('double'), ...clock });
  return { g, clock, calls };
}

test('un toque abre lo de siempre después de la ventana', () => {
  const { g, clock, calls } = gate();
  g.tap();
  clock.advance(100);
  assert.deepEqual(calls, []);
  clock.advance(200);
  assert.deepEqual(calls, ['single']);
});

test('dos toques rápidos abren Finance y no lo de siempre', () => {
  const { g, clock, calls } = gate();
  g.tap();
  clock.advance(150);
  g.tap();
  clock.advance(1000);
  assert.deepEqual(calls, ['double']);
});

test('un triple toque abre una sola vez', () => {
  const { g, clock, calls } = gate();
  g.tap();
  clock.advance(80);
  g.tap();
  clock.advance(80);
  g.tap();
  clock.advance(80);
  g.tap();
  clock.advance(1000);
  assert.deepEqual(calls, ['double']);
});

test('dos toques separados son dos toques sencillos', () => {
  const { g, clock, calls } = gate();
  g.tap();
  clock.advance(400);
  g.tap();
  clock.advance(400);
  assert.deepEqual(calls, ['single', 'single']);
});

test('después de la pausa, un doble vuelve a funcionar', () => {
  const { g, clock, calls } = gate();
  g.tap();
  clock.advance(100);
  g.tap();
  clock.advance(700);
  g.tap();
  clock.advance(100);
  g.tap();
  assert.deepEqual(calls, ['double', 'double']);
});

test('cancelar descarta el toque pendiente', () => {
  const { g, clock, calls } = gate();
  g.tap();
  g.cancel();
  clock.advance(1000);
  assert.deepEqual(calls, []);
});
