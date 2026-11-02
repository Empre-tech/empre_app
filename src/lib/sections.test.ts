import assert from 'node:assert/strict';
import { test } from 'node:test';
import { suggestSection } from './sections.ts';

const tienda = ['Granos y abarrotes', 'Bebidas', 'Lácteos y huevos', 'Carnes y pollo', 'Snacks y dulces', 'Aseo del hogar', 'Cuidado personal', 'Otros'].map((name, i) => ({ id: String(i), name }));
const rapida = ['Hamburguesas', 'Perros calientes', 'Salchipapas', 'Bebidas', 'Adicionales', 'Otros'].map((name, i) => ({ id: `r${i}`, name }));
const insumos = ['Desechables y empaques', 'Aseo del local', 'Otros'].map((name, i) => ({ id: `s${i}`, name }));
const name = (n: string, list = tienda) => suggestSection(n, list)?.name ?? null;

test('reconoce productos de una tienda de barrio', () => {
  assert.equal(name('Azúcar Manuelita'), 'Granos y abarrotes');
  assert.equal(name('Gaseosa Manzana Postobon · Naranja'), 'Bebidas');
  assert.equal(name('Huevos AA x 30'), 'Lácteos y huevos');
  assert.equal(name('Pechuga de pollo'), 'Carnes y pollo');
  assert.equal(name('Papas de limón'), 'Snacks y dulces');
  assert.equal(name('Jabón Rey'), 'Aseo del hogar');
  assert.equal(name('Crema dental Colgate'), 'Cuidado personal');
});

test('por el nombre de la sección, en singular o plural', () => {
  assert.equal(name('Hamburguesa doble', rapida), 'Hamburguesas');
  assert.equal(name('Perro sencillo', rapida), 'Perros calientes');
  assert.equal(name('Salchipapa grande', rapida), 'Salchipapas');
  assert.equal(name('Coca-Cola 400', rapida), 'Bebidas');
});

test('solo sugiere entre las secciones del negocio, y no adivina', () => {
  assert.equal(name('Pescado'), null); // la tienda no tiene «Pescados»
  assert.equal(name('Frito'), null);
  assert.equal(name('x'), null);
  assert.equal(name('Para llevar', rapida), null); // «para» no cuenta
});

test('insumos', () => {
  assert.equal(name('Bolsas plásticas', insumos), 'Desechables y empaques');
  assert.equal(name('Vasos de 7 onzas', insumos), 'Desechables y empaques');
  assert.equal(name('Escoba', insumos), 'Aseo del local');
});

test('ropa: por tipo de prenda', () => {
  const ropa = ['Camisetas', 'Camisas y blusas', 'Pantalones', 'Vestidos', 'Ropa interior', 'Calzado', 'Accesorios', 'Otros'].map((n, i) => ({ id: `c${i}`, name: n }));
  assert.equal(name('Camiseta polo', ropa), 'Camisetas');
  assert.equal(name('Blusa de lino', ropa), 'Camisas y blusas');
  assert.equal(name('Jean clásico', ropa), 'Pantalones');
  assert.equal(name('Vestido de baño', ropa), 'Ropa interior');
  assert.equal(name('Zapatos Tommy Hilfiger', ropa), 'Calzado');
  assert.equal(name('Gorra plana', ropa), 'Accesorios');
});
