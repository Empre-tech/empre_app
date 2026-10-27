import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cartTotal, fmtQty, groupInventory, itemLine, missingIngredients, packToUnits, sectionize, type InvLike } from './inventory.ts';

const base = { kind: 'product', unit: 'unidad', days_left: null, sold_28: 0, qty: 0 } as const;
const mk = (o: Partial<InvLike> & { name: string }): InvLike => ({ ref: o.name, mode: 'light', status: 'ok', ...base, ...o }) as InvLike;

test('fmtQty usa coma y no deja ceros', () => {
  assert.equal(fmtQty(12), '12');
  assert.equal(fmtQty(2.5), '2,5');
  assert.equal(fmtQty(0.1 + 0.2), '0,3');
});

test('itemLine explica el estado en palabras', () => {
  assert.equal(itemLine(mk({ name: 'a', mode: 'light', status: 'low' })), 'Queda poco');
  assert.equal(itemLine(mk({ name: 'a', mode: 'exact', status: 'unknown' })), 'Cuenta cuántos tienes');
  assert.equal(itemLine(mk({ name: 'a', mode: 'exact', status: 'ok', qty: 8, days_left: 3 })), '8 unidad · alcanzan para ~3 días');
  assert.equal(itemLine(mk({ name: 'a', mode: 'exact', status: 'out' })), 'Se acabó');
  assert.equal(itemLine(mk({ name: 'a', mode: 'unset' })), 'Sin control');
});

test('groupInventory: lo urgente arriba, agotado antes que poco, lo más vendido primero', () => {
  const g = groupInventory([
    mk({ name: 'Pan', status: 'ok', sold_28: 50 }),
    mk({ name: 'Leche', status: 'low', sold_28: 10 }),
    mk({ name: 'Huevos', status: 'out', sold_28: 1 }),
    mk({ name: 'Café', status: 'low', sold_28: 30 }),
    mk({ name: 'Corte', mode: 'none', is_service: true }),
    mk({ name: 'Nuevo', mode: 'unset' }),
  ]);
  assert.deepEqual(g.urgent.map((i) => i.name), ['Huevos', 'Café', 'Leche']);
  assert.deepEqual(g.rest.map((i) => i.name), ['Pan']);
  assert.deepEqual(g.uncontrolled.map((i) => i.name).sort(), ['Corte', 'Nuevo']);
});

test('groupInventory busca sin tildes ni mayúsculas', () => {
  const g = groupInventory([mk({ name: 'Café molido' }), mk({ name: 'Pan' })], 'CAFE');
  assert.equal(g.rest.length, 1);
  assert.equal(g.rest[0].name, 'Café molido');
});

test('packToUnits convierte pacas a unidades y costo por unidad', () => {
  assert.deepEqual(packToUnits(3, 12, 36000), { qty: 36, unitCost: 3000 });
  assert.equal(packToUnits(0, 12, 36000), null);
  assert.equal(packToUnits(2, 0, 100), null);
});

test('cartTotal suma precio por cantidad', () => {
  assert.equal(cartTotal([{ price: 12000, qty: 2 }, { price: 3500, qty: 1 }]), 27500);
  assert.equal(cartTotal([]), 0);
});

test('sectionize agrupa por sección y deja «Otros» al final', () => {
  const blocks = sectionize([
    { name: 'a', section: 'Bebidas' },
    { name: 'b' },
    { name: 'c', section: 'Almuerzos' },
    { name: 'd', section: 'Bebidas' },
  ]);
  assert.deepEqual(blocks.map((b) => [b.title, b.items.length]), [['Almuerzos', 1], ['Bebidas', 2], ['Otros', 1]]);
});

test('un plato con un insumo agotado sube a «se acaba»', () => {
  const base = { kind: 'product', mode: 'none', status: 'none', qty: 0, unit: '', days_left: null, sold_28: 0 } as const;
  const g = groupInventory([
    { ...base, ref: '1', name: 'Bandeja', ingredients: [{ name: 'Carne', status: 'out' }] },
    { ...base, ref: '2', name: 'Jugo' },
  ] as never[]);
  assert.equal(g.urgent.length, 1);
  assert.equal(g.urgent[0].name, 'Bandeja');
  assert.deepEqual(missingIngredients(g.urgent[0]).out, ['Carne']);
});

test('la pastilla dice en una palabra cómo está cada cosa', async () => {
  const { stockPill } = await import('./inventory.ts');
  assert.equal(stockPill(mk({ name: 'Corte', is_service: true, mode: 'none', status: 'none' })).label, 'Servicio');
  assert.equal(stockPill(mk({ name: 'Café', mode: 'light', status: 'low' })).label, 'Queda poco');
  assert.equal(stockPill(mk({ name: 'Aceite', mode: 'exact', status: 'low', qty: 2 })).label, 'Quedan 2');
  assert.equal(stockPill(mk({ name: 'Arroz', mode: 'exact', status: 'ok', qty: 18 })).label, '18 und');
  assert.equal(stockPill(mk({ name: 'Frijol', mode: 'exact', status: 'out' })).tone, 'out');
  assert.equal(stockPill(mk({ name: 'Pasta', mode: 'unset', status: 'none' })).label, 'Sin control');
});

test('insumos y lo que se vende van en pestañas; un producto que también se usa sale en las dos', async () => {
  const { splitTabs } = await import('./inventory.ts');
  const t = splitTabs([
    { kind: 'product' as const, name: 'Champú', also_supply: true },
    { kind: 'product' as const, name: 'Corte' },
    { kind: 'supply' as const, name: 'Tinte' },
  ]);
  assert.deepEqual(t.sell.map((i) => i.name), ['Champú', 'Corte']);
  assert.deepEqual(t.supplies.map((i) => i.name), ['Champú', 'Tinte']);
});

test('las variantes se agrupan bajo su producto, que toma su estado', async () => {
  const { nestVariants, variantPill } = await import('./inventory.ts');
  const top = nestVariants([
    mk({ name: 'Proteína', ref: 'p', mode: 'none', status: 'none', variants: 2 } as never),
    mk({ name: 'Proteína · Chocolate', ref: 'a', parent_id: 'p', mode: 'exact', status: 'ok', qty: 3 } as never),
    mk({ name: 'Proteína · Vainilla', ref: 'b', parent_id: 'p', mode: 'exact', status: 'out' } as never),
    mk({ name: 'Agua', ref: 'w', mode: 'light', status: 'ok' }),
  ] as never[]);
  assert.equal(top.length, 2);
  const p = top.find((i: { ref: string }) => i.ref === 'p')!;
  assert.equal(p.children.length, 2);
  assert.equal(p.status, 'low'); // una se acabó: el producto sube a «se acaba»
  assert.equal(variantPill(p).label, '1 se acaba');
});
