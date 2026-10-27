import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextTableName, openedAgo, projectTabs } from './tabs.ts';

const server = [
  { id: 't1', name: 'Mesa 1', status: 'open', opened_at: '2026-10-27T12:00:00Z', total: 25000, lines: [{ id: 'l1', name: 'Bandeja', qty: 1, unit_price: 25000, removed: false }] },
];
const q = (kind: string, payload: Record<string, unknown>, createdAt: number, status: 'pending' | 'failed' = 'pending') => ({ entityId: 'e', kind, payload, status, createdAt });

test('sin señal: abrir, agregar y quitar se ven al instante', () => {
  const tabs = projectTabs(
    server,
    [
      q('tab_add', { tab_id: 't1', lines: [{ id: 'l2', name: 'Limonada', qty: 2, unit_price: 5000 }] }, 1),
      q('tab_open', { id: 't2', name: 'Mesa 2' }, 2),
      q('tab_add', { tab_id: 't2', lines: [{ id: 'l3', name: 'Sopa', qty: 1, unit_price: 9000 }] }, 3),
      q('tab_remove', { tab_id: 't1', line_id: 'l1' }, 4),
      q('sale', { total: 1 }, 5),
    ],
    'e',
  );
  assert.equal(tabs.length, 2);
  assert.equal(tabs.find((t) => t.id === 't1')!.total, 10000);
  assert.equal(tabs.find((t) => t.id === 't2')!.total, 9000);
  assert.equal(tabs.find((t) => t.id === 't2')!.pending, true);
});

test('cobrar o cancelar sin señal la quita de la lista; lo rechazado no cuenta', () => {
  assert.equal(projectTabs(server, [q('tab_pay', { tab_id: 't1' }, 1)], 'e').length, 0);
  assert.equal(projectTabs(server, [q('tab_pay', { tab_id: 't1' }, 1, 'failed')], 'e').length, 1);
  assert.equal(projectTabs(server, [q('tab_add', { tab_id: 't1', lines: [{ id: 'l1', name: 'x', qty: 9, unit_price: 9 }] }, 1)], 'e')[0].total, 25000);
});

test('sugerencias y tiempos', () => {
  assert.equal(nextTableName([{ name: 'Mesa 1' }, { name: 'mesa 2' }]), 'Mesa 3');
  assert.equal(openedAgo('2026-10-27T12:00:00Z', Date.parse('2026-10-27T12:25:00Z')), 'hace 25 min');
  assert.equal(openedAgo('2026-10-27T12:00:00Z', Date.parse('2026-10-27T14:30:00Z')), 'hace 2 h 30 min');
});
