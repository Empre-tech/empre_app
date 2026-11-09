import assert from 'node:assert/strict';
import { test } from 'node:test';
import { businessFamily, itemKeywords, matchProblem, parseSpoken, problemMessage, starterItems } from './family.ts';

test('la familia sale del tipo guardado, la categoría y lo que vende', () => {
  assert.equal(businessFamily({ profile: 'food' }), 'comida');
  assert.equal(businessFamily({ profile: 'shop' }), 'tienda');
  assert.equal(businessFamily({ profile: 'valuable' }), 'tienda');
  assert.equal(businessFamily({ profile: 'service', category: 'Belleza y peluquería' }), 'cita');
  assert.equal(businessFamily({ profile: 'service', category: 'Automotriz' }), 'cotizar');
  // Si reserva por Empre, es con cita aunque la categoría sea de reparaciones.
  assert.equal(businessFamily({ profile: 'service', category: 'Automotriz', items: [{ kind: 'service', bookable: true, price: 35000, price_from: false }] }), 'cita');
  // La mayoría sin precio fijo: a cotizar.
  const open = [
    { kind: 'service' as const, price: null, price_from: false },
    { kind: 'service' as const, price: 40000, price_from: true },
    { kind: 'service' as const, price: 20000, price_from: false },
  ];
  assert.equal(businessFamily({ profile: 'service', category: 'Educación', items: open }), 'cotizar');
  // Datos viejos sin tipo: el nombre de la categoría.
  assert.equal(businessFamily({ category: 'Restaurantes' }), 'comida');
  assert.equal(businessFamily({ category: 'Tiendas y comercio' }), 'tienda');
});

test('las palabras de un servicio incluyen cómo habla la gente', () => {
  const k = itemKeywords('Frenos');
  assert.ok(k.includes('frenos'));
  assert.ok(k.includes('chilla'));
  assert.ok(itemKeywords('Cambio de batería').includes('no prende'));
});

test('«Cuéntale qué le pasa» encuentra el servicio que corresponde', () => {
  const items = [{ name: 'Cambio de aceite' }, { name: 'Frenos' }, { name: 'Reparación de motor' }];
  assert.equal(matchProblem('suena al frenar', items)?.name, 'Frenos');
  assert.equal(matchProblem('me chillan los frenos', items)?.name, 'Frenos');
  assert.equal(matchProblem('Bota aceite', items)?.name, 'Cambio de aceite');
  assert.equal(matchProblem('sale humo', items)?.name, 'Reparación de motor');
  assert.equal(matchProblem('no sé', items), null);
  assert.equal(matchProblem('ho', items), null);
});

test('el mensaje lleva lo que contó el cliente y el servicio que parece', () => {
  assert.equal(problemMessage('Me chillan los frenos', { name: 'Frenos' }), 'Hola, me chillan los frenos. Creo que es para «Frenos». ¿Me pueden cotizar?');
  assert.equal(problemMessage('no prende?'), 'Hola, no prende? ¿Me pueden cotizar?');
});

test('«Escríbelo como lo dirías» separa nombre, duración y precio', () => {
  assert.deepEqual(parseSpoken('corte con lavado 30 min 20 mil'), { name: 'Corte con lavado', duration: 30, price: 20000, from: false });
  assert.deepEqual(parseSpoken('manicure media hora 25 mil'), { name: 'Manicure', duration: 30, price: 25000, from: false });
  assert.deepEqual(parseSpoken('barba 15000'), { name: 'Barba', duration: null, price: 15000, from: false });
  assert.deepEqual(parseSpoken('barba $15.000'), { name: 'Barba', duration: null, price: 15000, from: false });
  assert.deepEqual(parseSpoken('frenos desde 40 mil 1 hora'), { name: 'Frenos', duration: 60, price: 40000, from: true });
  assert.deepEqual(parseSpoken('tinte 1 hora y media'), { name: 'Tinte', duration: 90, price: null, from: false });
  assert.deepEqual(parseSpoken('almuerzo 16,5 mil'), { name: 'Almuerzo', duration: null, price: 16500, from: false });
  assert.deepEqual(parseSpoken('Arroz 500 g'), { name: 'Arroz 500 g', duration: null, price: null, from: false });
});

test('las sugerencias para empezar no traen precio', () => {
  const s = starterItems('cita', 'Belleza y peluquería');
  assert.ok(s.length >= 3);
  assert.ok(s.every((x) => !('price' in x)));
  assert.deepEqual(starterItems('tienda'), []);
});
