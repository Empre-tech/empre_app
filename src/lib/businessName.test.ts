import { test } from 'node:test';
import assert from 'node:assert/strict';
import { otherZone, rowNames, splitZone } from './businessName.ts';

const ZONES = ['Centro', 'El Rodadero', 'Mamatoco', 'Pescaíto', 'Almendros', 'Los Almendros'];

test('splitZone quita el barrio del final del nombre', () => {
  assert.deepEqual(splitZone('Helados del Mar Mamatoco', ZONES), { base: 'Helados del Mar', sede: 'Mamatoco' });
  assert.deepEqual(splitZone('El Rincón Samario Mamatoco', ZONES), { base: 'El Rincón Samario', sede: 'Mamatoco' });
});

test('splitZone entiende guiones, paréntesis, «sede» y tildes', () => {
  assert.equal(splitZone('Corte Fino - Centro', ZONES).base, 'Corte Fino');
  assert.equal(splitZone('Corte Fino (Centro)', ZONES).base, 'Corte Fino');
  assert.equal(splitZone('Corte Fino Sede Centro', ZONES).base, 'Corte Fino');
  assert.deepEqual(splitZone('Fritos Pescaito', ZONES), { base: 'Fritos', sede: 'Pescaíto' });
});

test('splitZone prefiere el barrio más largo', () => {
  assert.deepEqual(splitZone('Tienda Los Almendros', ZONES), { base: 'Tienda', sede: 'Los Almendros' });
});

test('splitZone no toca nombres que no terminan en un barrio entero', () => {
  assert.deepEqual(splitZone('Supercentro', ZONES), { base: 'Supercentro', sede: null });
  assert.deepEqual(splitZone('Barbería El Prado Norte', ZONES), { base: 'Barbería El Prado Norte', sede: null });
  // El nombre es solo el barrio: se deja
  assert.deepEqual(splitZone('Mamatoco', ZONES), { base: 'Mamatoco', sede: null });
  // Sin barrios conocidos, igual
  assert.deepEqual(splitZone('Helados del Mar Mamatoco', []), { base: 'Helados del Mar Mamatoco', sede: null });
});

test('rowNames deja completos los que quedarían iguales (dos sedes juntas)', () => {
  assert.deepEqual(rowNames(['Corte Fino Mamatoco', 'Corte Fino Centro', 'Helados del Mar Mamatoco'], ZONES), [
    { name: 'Corte Fino Mamatoco', sede: null },
    { name: 'Corte Fino Centro', sede: null },
    { name: 'Helados del Mar', sede: 'Mamatoco' },
  ]);
});

test('otherZone solo dice la sede si es otro barrio y sabemos dónde estás', () => {
  assert.equal(otherZone('Mamatoco', 'Mamatoco'), null);
  assert.equal(otherZone('Pescaíto', 'pescaito'), null);
  assert.equal(otherZone('Centro', 'Mamatoco'), 'Centro');
  assert.equal(otherZone('Centro', null), null);
  assert.equal(otherZone(null, 'Mamatoco'), null);
});
