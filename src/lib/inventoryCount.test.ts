import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countDiffs, countedAgo, countPayload, countRows, matches, parseCount, readDraft, staleSection, type CountSource } from './inventoryCount.ts';

const base: Omit<CountSource, 'ref' | 'name'> = { mode: 'exact', status: 'ok', qty: 0, unit: 'unidad', counted: true, is_service: false, cost: null };
const mk = (o: Partial<CountSource> & { ref: string; name: string }): CountSource => ({ ...base, ...o });

test('se cuentan los productos y las variantes, no los servicios ni lo que no se lleva', () => {
  const gaseosa = mk({ ref: 'g', name: 'Gaseosa 400 ml', variants: 2 });
  const rows = countRows(
    [gaseosa, mk({ ref: 'a', name: 'Agua', qty: 43 }), mk({ ref: 's', name: 'Domicilio', is_service: true }), mk({ ref: 'n', name: 'Hielo', mode: 'none' }), mk({ ref: 'l', name: 'Pan', mode: 'light', status: 'low', level: 'low' }), mk({ ref: 'u', name: 'Nuevo', mode: 'unset', counted: false })],
    [mk({ ref: 'g1', name: 'Gaseosa 400 ml · Cola', parent_id: 'g', variant_label: 'Cola', qty: 3 }), mk({ ref: 'g2', name: 'Gaseosa 400 ml · Limón', parent_id: 'g', variant_label: 'Limón', qty: 22 })],
  );
  assert.deepEqual(rows.map((r) => r.ref), ['g1', 'g2', 'a', 'l', 'u']);
  assert.equal(rows[0].name, 'Cola');
  assert.equal(rows[0].group, 'Gaseosa 400 ml');
  assert.equal(rows[2].expected, 43);
  assert.equal(rows[3].kind, 'light');
  assert.equal(rows[3].level, 'low');
  assert.equal(rows[4].expected, null); // nunca contado: lo contado es lo que hay
});

test('solo lo que no cuadra va a revisar; lo que cuadra igual se manda con su fecha', () => {
  const rows = countRows([mk({ ref: 'a', name: 'Agua', qty: 43 }), mk({ ref: 'b', name: 'Malta', qty: 0 }), mk({ ref: 'c', name: 'Gaseosa 1,5 L', qty: 1, cost: 4100 }), mk({ ref: 'u', name: 'Nuevo', mode: 'unset', counted: false }), mk({ ref: 'l', name: 'Pan', mode: 'light' })], []);
  const entries = { a: { counted: 43 }, b: { counted: 6 }, c: { counted: 0 }, u: { counted: 12 }, l: { level: 'out' as const } };
  assert.ok(matches(rows[0], entries.a));
  const diffs = countDiffs(rows, entries);
  assert.deepEqual(diffs.map((d) => [d.row.ref, d.delta, d.first]), [['b', 6, false], ['c', -1, false], ['u', 12, true], ['l', 0, false]]);
  const lines = countPayload(rows, entries, { c: 'danado', b: 'perdida' });
  assert.equal(lines.length, 5);
  assert.deepEqual(lines.find((l) => l.ref === 'c'), { ref: 'c', counted: 0, expected: 1, reason: 'danado' });
  assert.deepEqual(lines.find((l) => l.ref === 'b'), { ref: 'b', counted: 6, expected: 0 }); // un sobrante no es pérdida
  assert.deepEqual(lines.find((l) => l.ref === 'u'), { ref: 'u', counted: 12 });
  assert.deepEqual(lines.find((l) => l.ref === 'l'), { ref: 'l', level: 'out' });
});

test('cuándo se contó y qué sección lleva más tiempo sin contarse', () => {
  const now = Date.parse('2026-11-16T15:00:00Z');
  assert.equal(countedAgo(null, now), null);
  assert.equal(countedAgo('2026-11-16T08:00:00Z', now), 'contada hoy');
  assert.equal(countedAgo('2026-11-15T10:00:00Z', now), 'contada hace 1 día');
  assert.equal(countedAgo('2026-10-29T10:00:00Z', now), 'contada hace 18 días');
  assert.deepEqual(staleSection([{ name: 'Bebidas', counted_at: '2026-10-29T10:00:00Z' }, { name: 'Bowls', counted_at: '2026-10-13T10:00:00Z' }, { name: 'Postres' }], now), { name: 'Bowls', days: 34 });
  assert.equal(staleSection([{ name: 'Bebidas', counted_at: '2026-11-10T10:00:00Z' }], now), null);
});

test('las cantidades se escriben como se dicen', () => {
  assert.equal(parseCount('12'), 12);
  assert.equal(parseCount('2,5'), 2.5);
  assert.equal(parseCount('1.000'), 1000);
  assert.equal(parseCount('0'), 0);
  assert.equal(parseCount(''), null);
  assert.equal(parseCount('-3'), null);
  assert.equal(parseCount('abc'), null);
});

test('el borrador se lee solo si está completo', () => {
  assert.equal(readDraft(null), null);
  assert.equal(readDraft('{roto'), null);
  assert.equal(readDraft(JSON.stringify({ v: 1, clientId: 'x', tab: 'service', section: 'A', rows: [] })), null);
  const d = readDraft(JSON.stringify({ v: 1, clientId: 'x', tab: 'product', section: 'Bebidas', rows: [], entries: { a: { counted: 2 } } }));
  assert.equal(d?.section, 'Bebidas');
  assert.deepEqual(d?.reasons, {});
});
