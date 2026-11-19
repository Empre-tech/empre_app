import assert from 'node:assert/strict';
import { test } from 'node:test';
import { itemTab, photoPeriods, profileTabs } from './profileTabs.ts';

test('profileTabs: solo las que tienen algo, con su nombre', () => {
  assert.deepEqual(
    profileTabs({ services: 14, products: 6, photos: 32, noun: 'Servicios', sells: 'service' }).map((t) => `${t.label} ${t.count}`),
    ['Servicios 14', 'Productos 6', 'Fotos 32'],
  );
  assert.deepEqual(profileTabs({ services: 0, products: 22, photos: 40, noun: 'Carta', sells: 'food' }).map((t) => t.label), ['Carta', 'Fotos']);
  assert.deepEqual(profileTabs({ services: 0, products: 3, photos: 0, noun: 'Servicios', sells: 'service' }).map((t) => t.label), ['Productos']);
  assert.deepEqual(profileTabs({ services: 0, products: 0, photos: 0, noun: 'Carta', sells: 'food' }), []);
});

test('itemTab: los ítems viejos sin tipo van según lo que vende el negocio', () => {
  assert.equal(itemTab({ kind: 'product' }, 'service'), 'products');
  assert.equal(itemTab({}, 'service'), 'services');
  assert.equal(itemTab({}, 'food'), 'products');
});

test('photoPeriods: este año por mes, los anteriores por año, lo más nuevo arriba', () => {
  const now = new Date('2026-11-18T12:00:00-05:00');
  const photos = [
    { id: 'a', created_at: '2021-03-02T10:00:00-05:00' },
    { id: 'b', created_at: '2026-11-03T10:00:00-05:00' },
    { id: 'c', created_at: '2026-10-30T10:00:00-05:00' },
    { id: 'd', created_at: '2026-11-17T22:00:00-05:00' },
    { id: 'e', created_at: '2021-08-01T10:00:00-05:00' },
    { id: 'f', created_at: 'no-date' },
  ];
  const p = photoPeriods(photos, now);
  assert.deepEqual(
    p.map((x) => `${x.label}:${x.items.map((i) => i.photo.id).join('')}`),
    ['Noviembre:db', 'Octubre:c', '2021:ea', 'Otras:f'],
  );
  assert.equal(p[0].items[0].index, 3);
});
