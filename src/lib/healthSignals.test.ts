import assert from 'node:assert/strict';
import test from 'node:test';

import { createThrottle, errorMessage, normalizeRoute, shouldReport } from './healthSignals.ts';

test('la ruta queda como plantilla, sin ids ni consulta', () => {
  assert.equal(normalizeRoute('/api/entities/0eee910b-f632-4bf6-99cf-5e4718e58215/ledger/summary?period=day'), '/api/entities/:id/ledger/summary');
  assert.equal(normalizeRoute('/api/images/12345'), '/api/images/:id');
  assert.equal(normalizeRoute('/api/offers/market'), '/api/offers/market');
});

test('solo se reporta lo que es un problema', () => {
  assert.equal(shouldReport(0, 100), true); // sin respuesta
  assert.equal(shouldReport(503, 100), true);
  assert.equal(shouldReport(200, 3500), true); // lenta
  assert.equal(shouldReport(200, 800), false);
  assert.equal(shouldReport(404, 200), false); // una respuesta normal
});

test('un reporte por ruta por minuto', () => {
  const allow = createThrottle(60_000);
  assert.equal(allow('/api/x', 0), true);
  assert.equal(allow('/api/x', 30_000), false);
  assert.equal(allow('/api/y', 30_000), true);
  assert.equal(allow('/api/x', 61_000), true);
});

test('el mensaje del error no lleva datos de la persona', () => {
  assert.equal(errorMessage(new Error('No se encontró ana@correo.com con cédula 1098765432')), 'No se encontró [correo] con cédula [número]');
  assert.equal(errorMessage('x'.repeat(200)).length, 80);
  assert.equal(errorMessage(new TypeError('')), 'TypeError');
});
