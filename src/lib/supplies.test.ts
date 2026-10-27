import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  blocksByGroup,
  cleanLabel,
  filterByStatus,
  groupCounts,
  groupSummary,
  hasExact,
  knownGroups,
  marginOf,
  NO_GROUP,
  searchSupplies,
  sectionCounts,
} from './supplies.ts';

const s = (name: string, group = '', status = 'ok') => ({ name, group, status });
const list = [s('Pimentón rojo', 'Verduras'), s('Carne molida', 'Carnes', 'out'), s('Sal'), s('Arroz', 'Granos', 'low'), s('Pimentón en polvo', 'Especias'), s('Chorizo', 'Carnes', 'low')];

test('los grupos cuentan y «Sin grupo» va al final', () => {
  assert.deepEqual(groupCounts(list), [
    { name: 'Carnes', count: 2 },
    { name: 'Especias', count: 1 },
    { name: 'Granos', count: 1 },
    { name: 'Verduras', count: 1 },
    { name: NO_GROUP, count: 1 },
  ]);
  assert.deepEqual(knownGroups(list), ['Carnes', 'Especias', 'Granos', 'Verduras']);
});

test('los bloques van por grupo y A–Z adentro', () => {
  const b = blocksByGroup(list);
  assert.equal(b[0].title, 'Carnes');
  assert.deepEqual(b[0].items.map((i) => i.name), ['Carne molida', 'Chorizo']);
  assert.equal(b[b.length - 1].title, NO_GROUP);
});

test('la búsqueda ignora tildes y pone primero lo que empieza igual', () => {
  assert.deepEqual(searchSupplies(list, 'pimenton').map((i) => i.name), ['Pimentón en polvo', 'Pimentón rojo']);
  assert.deepEqual(searchSupplies(list, 'polvo').map((i) => i.name), ['Pimentón en polvo']);
  assert.deepEqual(searchSupplies(list, 'carnes').map((i) => i.name), ['Carne molida', 'Chorizo']);
  assert.equal(searchSupplies(list, '').length, list.length);
});

test('no ofrece crear algo que ya existe', () => {
  assert.equal(hasExact(list, ' sal '), true);
  assert.equal(hasExact(list, 'ARROZ'), true);
  assert.equal(hasExact(list, 'Pimentón'), false);
});

test('limpia el nombre de un grupo o sección', () => {
  assert.equal(cleanLabel('  carnes   rojas '), 'Carnes rojas');
  assert.equal(cleanLabel('   '), '');
});

test('filtra por estado y resume un grupo', () => {
  assert.equal(filterByStatus(list, 'attention').length, 3);
  assert.equal(filterByStatus(list, 'out').length, 1);
  assert.deepEqual(groupSummary([s('a', '', 'out'), s('b', '', 'low'), s('c', '', 'low')]), { text: '1 se acabó · 2 poco', tone: 'out' });
  assert.deepEqual(groupSummary([s('a', '', 'low')]), { text: '1 queda poco', tone: 'low' });
  assert.deepEqual(groupSummary([s('a'), s('b')]), { text: '2', tone: 'muted' });
});

test('las secciones cuentan productos sin variantes y sin repetir por tildes', () => {
  const r = sectionCounts([{ section: 'Bebidas' }, { section: 'bebidas ' }, { section: 'Aseo' }, { section: '' }, { section: 'Aseo', parent_id: 'x' }]);
  assert.deepEqual(r, [
    { name: 'Bebidas', count: 2 },
    { name: 'Aseo', count: 1 },
  ]);
});

test('el margen sale en pesos y porcentaje', () => {
  assert.deepEqual(marginOf(25000, 18000), { amount: 7000, pct: 28 });
  assert.deepEqual(marginOf(25000, 27000), { amount: -2000, pct: -8 });
  assert.equal(marginOf(null, 1000), null);
  assert.equal(marginOf(1000, 0), null);
});
