import assert from 'node:assert/strict';
import test from 'node:test';

import { withTimeout } from './requestTimeout.ts';

test('se corta por tiempo y lo dice', async () => {
  const t = withTimeout(undefined, 20);
  assert.equal(t.signal.aborted, false);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(t.signal.aborted, true);
  assert.equal(t.timedOut(), true);
  t.clear();
});

test('si quien llama cancela, se cancela pero no es por tiempo', () => {
  const outer = new AbortController();
  const t = withTimeout(outer.signal, 1000);
  outer.abort();
  assert.equal(t.signal.aborted, true);
  assert.equal(t.timedOut(), false);
  t.clear();
});

test('una señal ya cancelada cancela enseguida', () => {
  const outer = new AbortController();
  outer.abort();
  const t = withTimeout(outer.signal, 1000);
  assert.equal(t.signal.aborted, true);
  t.clear();
});

test('al terminar a tiempo, el reloj se quita', async () => {
  const t = withTimeout(undefined, 20);
  t.clear();
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(t.signal.aborted, false);
  assert.equal(t.timedOut(), false);
});
