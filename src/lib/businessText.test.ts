import assert from 'node:assert/strict';
import { test } from 'node:test';
import { guessCategory, guessName, parseHours, understandBusiness } from './businessText.ts';

const cats = [
  { id: 'b', name: 'Barbería y peluquería' },
  { id: 'r', name: 'Comida y restaurantes' },
  { id: 't', name: 'Tiendas de ropa' },
];

test('entiende los días y el horario como se dicen', () => {
  const h = parseHours('barbería en el centro, corte a 18 mil, de lunes a sábado de 9 a 8');
  assert.ok(h);
  assert.equal(h.text, 'Lun a sáb · 9 a 8');
  assert.deepEqual(h.hours[1], { weekday: 1, closed: false, is_24h: false, open_time: '09:00', close_time: '20:00' });
  assert.equal(h.hours[0].closed, true, 'el domingo queda cerrado');
  assert.equal(parseHours('todos los días de 7am a 3pm')?.hours.filter((d) => !d.closed).length, 7);
  assert.equal(parseHours('lunes a viernes 8:30 a 5:30')?.hours[5].close_time, '17:30');
  assert.equal(parseHours('vendo empanadas'), null, 'sin horario no se inventa');
});

test('encuentra el tipo de negocio entre las categorías', () => {
  assert.equal(guessCategory('barbería en el centro', cats)?.id, 'b');
  assert.equal(guessCategory('vendo almuerzos caseros', cats)?.id, 'r');
  assert.equal(guessCategory('boutique de ropa para niños', cats)?.id, 't');
  assert.equal(guessCategory('hago trámites', cats), null);
});

test('el nombre solo si lo dice', () => {
  assert.equal(guessName('se llama Barbería El Prado, en el centro'), 'Barbería El Prado');
  assert.equal(guessName('barbería en el centro'), null);
});

test('lo entendido sale como chips', () => {
  const u = understandBusiness('se llama El Prado, barbería, de lunes a sábado de 9 a 8', cats);
  assert.deepEqual(u.chips.map((c) => c.k), ['Nombre', 'Tipo', 'Horario']);
  assert.equal(u.categoryId, 'b');
});

test('«barbería» no cae en «Bar» (palabras completas)', () => {
  const withBar = [{ id: 'x', name: 'Bar' }, ...cats];
  assert.equal(guessCategory('Barberia', withBar)?.id, 'b');
  assert.equal(guessCategory('un bar con música en vivo', withBar)?.id, 'x');
  const noBarber = [{ id: 'x', name: 'Bar' }, { id: 'e', name: 'Belleza y cuidado personal' }];
  assert.equal(guessCategory('Barbería', noBarber)?.id, 'e');
});
