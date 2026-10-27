import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alertsLine, firstTab, inventoryAlerts, shoppingList, splitAlerts, type AlertSource } from './alerts.ts';

const mk = (o: Partial<AlertSource> & { name: string }): AlertSource => ({
  ref: o.name,
  kind: 'product',
  mode: 'light',
  status: 'ok',
  qty: 0,
  unit: 'unidad',
  days_left: null,
  sold_28: 0,
  ...o,
});

const items = [
  mk({ name: 'Huevos', mode: 'exact', status: 'out', sold_28: 112 }),
  mk({ name: 'Carne molida', kind: 'supply', status: 'out', used_in: [{ name: 'Bandeja' }, { name: 'Arepa' }] }),
  mk({ name: 'Arroz', mode: 'exact', status: 'low', qty: 6, days_left: 2.4 }),
  mk({ name: 'Aceite', status: 'low' }),
  mk({ name: 'Bandeja paisa', status: 'ok', ingredients: [{ name: 'Carne molida', status: 'out' }] }),
  mk({ name: 'Sancocho', status: 'ok', servings: 2, limit: 'Yuca', sold_28: 140 }),
  mk({ name: 'Corte', is_service: true, mode: 'none', status: 'none' }),
  mk({ name: 'Gaseosa', mode: 'unset', status: 'none' }),
  mk({ name: 'Camiseta', mode: 'none', status: 'out', variants: 3 }),
];

test('agrupa los avisos por tipo y en orden', () => {
  const a = inventoryAlerts(items);
  assert.deepEqual(a.out.map((x) => x.item.name), ['Huevos', 'Carne molida']);
  assert.equal(a.out[0].text, 'Vendías ~4 al día · lo ven agotado');
  assert.equal(a.out[1].text, 'Lo usan 2');
  assert.deepEqual(a.soon.map((x) => [x.item.name, x.text]), [
    ['Arroz', 'Quedan 6 · alcanza ~2 días'],
    ['Aceite', 'Queda poco'],
  ]);
  assert.deepEqual(a.risk.map((x) => [x.item.name, x.text]), [
    ['Bandeja paisa', 'Falta Carne molida'],
    ['Sancocho', 'Alcanza para 2 · limita: Yuca'],
  ]);
  assert.equal(a.unset, 1);
  assert.equal(a.total, 6);
});

test('la frase por tipo, sin nombrar productos', () => {
  const a = inventoryAlerts(items);
  assert.equal(alertsLine(a), '2 se acabaron · 2 se acaban pronto · 2 platos en riesgo');
  assert.equal(alertsLine(inventoryAlerts([items[0], items[3]]), 'producto', 'productos'), '1 se acabó · 1 se acaba pronto');
  assert.equal(alertsLine(inventoryAlerts([])), '');
});

test('la lista de compras para WhatsApp', () => {
  const msg = shoppingList(inventoryAlerts(items), 'Tienda Marta');
  assert.equal(msg, 'Lista de compras · Tienda Marta\n\n• Huevos (se acabó)\n• Carne molida (se acabó)\n• Arroz (quedan 6)\n• Aceite (queda poco)');
});

test('separa lo que vendes de los insumos y elige la pestaña', () => {
  const sp = splitAlerts(inventoryAlerts(items));
  assert.deepEqual(sp.sell.out.map((x) => x.item.name), ['Huevos']);
  assert.deepEqual(sp.supplies.out.map((x) => x.item.name), ['Carne molida']);
  assert.equal(sp.sell.risk.length, 2);
  assert.equal(sp.supplies.risk.length, 0);
  assert.equal(sp.sell.total + sp.supplies.total, 6);
  assert.equal(firstTab(sp), 'sell');
  assert.equal(firstTab(splitAlerts(inventoryAlerts([items[1], items[3]]))), 'supplies');
  assert.equal(inventoryAlerts([mk({ name: 'Sal', kind: 'supply', status: 'out', group: 'Especias' })]).out[0].text, 'Especias');
});
