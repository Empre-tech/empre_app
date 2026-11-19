import { test } from 'node:test';
import assert from 'node:assert/strict';
import { learnPlaceSuffixes, otherZone, rowNames, splitZone } from './businessName.ts';

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

// Los 40 negocios más cercanos a Mamatoco en la base de prueba (2026-11-16): las zonas registradas no tienen Mamatoco.
const CERCA = ['Farma Caribe Mamatoco', 'La Terraza del Mar Mamatoco', 'Noche Samaria', 'Casa Mar Los Almendros', 'Droguería La Salud Los Almendros', 'Casa Mar', 'Perros del Parque', 'La Picada 19', 'Almuerzos La 22 Mamatoco', 'El Navajazo', 'Café Bolívar Mamatoco', 'La Barba Samaria', 'Casa del Pargo Mamatoco', 'Helados del Mar Mamatoco', 'Fit Samaria Mamatoco', 'Café Bolívar', 'Patitas Felices Mamatoco', 'Tapoz Liza', 'El Rincón Samario Mamatoco', 'Paseos Doña Rita', 'Cell Caribe', 'Almacén La Bahía Los Almendros', 'Paleta Fría Los Almendros', 'Materiales La 30 Los Almendros', 'El Corrientazo de Doña Mery', 'Salón Divina Bastidas', 'Studio Bella', 'Box Caribe', 'Spa Mamatoco', 'Mundo Móvil', 'Veterinaria Colibrí', 'Bar La Bahía', 'Colegio de Idiomas Samario', 'Pescadería El Morro', 'Materiales La 30', 'Eventos Magdalena', 'Taganga Dive', 'Miscelánea El Camellón', 'Café Quinta de San Pedro', 'Casa Canoas'];

test('learnPlaceSuffixes saca los barrios de los nombres cercanos', () => {
  const places = learnPlaceSuffixes(CERCA);
  assert.ok(places.includes('Mamatoco'));
  assert.ok(places.includes('Los Almendros'));
  // Lo que termina pocos nombres o no es lugar, no
  for (const no of ['Samaria', 'Caribe', 'Bastidas', 'Bahía', 'Doña Rita']) assert.ok(!places.includes(no), no);
});

test('con lo aprendido, la fila de tu captura queda sin barrio', () => {
  const places = learnPlaceSuffixes(CERCA);
  assert.deepEqual(
    rowNames(['El Rincón Samario Mamatoco', 'Helados del Mar Mamatoco', 'La Barba Samaria', 'Farma Caribe Mamatoco', 'Casa Mar Los Almendros', 'Spa Mamatoco'], places).map((r) => r.name),
    ['El Rincón Samario', 'Helados del Mar', 'La Barba Samaria', 'Farma Caribe', 'Casa Mar', 'Spa Mamatoco'],
  );
});

test('learnPlaceSuffixes: una sede junto a su negocio basta', () => {
  assert.deepEqual(learnPlaceSuffixes(['Casa Mar', 'Casa Mar Los Almendros', 'Otro']), ['Los Almendros']);
  // Nombres que comparten una palabra genérica no son barrio
  assert.deepEqual(learnPlaceSuffixes(['Pizza Express', 'Burger Express', 'Sushi Express']), []);
});
