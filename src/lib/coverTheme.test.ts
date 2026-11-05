import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coverTheme } from './coverTheme.ts';

test('coverTheme elige por categoría sin confundir parecidos', () => {
  assert.equal(coverTheme('Barbería', 'cut-outline').kind, 'barberia');
  assert.equal(coverTheme('Bar', 'beer-outline').kind, 'bar');
  assert.equal(coverTheme('Café y postres').kind, 'cafe');
  assert.equal(coverTheme('Restaurante', 'restaurant-outline').kind, 'comida');
  assert.equal(coverTheme('Ropa').kind, 'ropa');
  assert.equal(coverTheme('Clases de inglés').kind, 'clases');
  assert.equal(coverTheme('Buceo').kind, 'agua');
});

test('coverTheme usa el icono si el nombre no dice nada y cae en tienda', () => {
  assert.equal(coverTheme('', 'shirt-outline').kind, 'ropa');
  assert.equal(coverTheme('Ferretería', 'hammer-outline').kind, 'tienda');
  assert.equal(coverTheme(null, null).kind, 'tienda');
});
