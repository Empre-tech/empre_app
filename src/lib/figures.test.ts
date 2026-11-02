import assert from 'node:assert/strict';
import { test } from 'node:test';
import { figureFor } from './figures.ts';

test('las categorías de Empre tienen figura o caen al ícono', () => {
  const want: Record<string, string | null> = {
    Restaurantes: 'comidas',
    'Cafeterías, panaderías y postres': 'panaderia',
    'Bares y vida nocturna': 'licores',
    'Tiendas y comercio': 'accesorios',
    'Belleza y peluquería': 'cortes',
    'Salud y bienestar': 'suplementos',
    'Servicios del hogar': 'hogar',
    Tecnología: 'tecnologia',
    Educación: 'clases',
    Automotriz: 'talleres',
    Mascotas: 'mascotas',
    'Deporte y recreación': 'deporte',
    Otros: 'insumos',
    'Turismo y hospedaje': null,
    'Fotografía y diseño': null,
  };
  for (const [name, key] of Object.entries(want)) assert.equal(figureFor(name), key, name);
});

test('secciones comunes', () => {
  assert.equal(figureFor('Camisetas'), 'camisetas');
  assert.equal(figureFor('Jeans'), 'pantalones');
  assert.equal(figureFor('Almuerzos del día'), 'comidas');
  assert.equal(figureFor('Bebidas'), 'bebidas');
  assert.equal(figureFor('Uñas'), 'unas');
  assert.equal(figureFor('Pescados y mariscos'), 'pescados');
  assert.equal(figureFor('Frutas'), 'fruver');
  assert.equal(figureFor('Desechables'), 'insumos');
  assert.equal(figureFor(''), null);
  assert.equal(figureFor('Xyz'), null);
});
