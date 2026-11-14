import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addSignal, decay, forYou, forYouHeader, myInterests, peopleInterests, seenBusinesses, MAX_SIGNALS, type Signal } from './interests.ts';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 14, 17);
const art = (name: string) => (/jugo|almuerzo|comida/i.test(name) ? 'comida' : /corte|barber/i.test(name) ? 'barberia' : /uña/i.test(name) ? 'unas' : 'tienda') as never;
const biz = (id: string, category_name: string, distance_meters = 300, is_open_now = true, name = id) => ({ id, name, category_name, distance_meters, is_open_now });

test('las señales se apagan a la mitad cada 10 días', () => {
  assert.equal(decay(NOW, NOW), 1);
  assert.ok(Math.abs(decay(NOW - 10 * DAY, NOW) - 0.5) < 1e-9);
});

test('addSignal pone la nueva de primera y olvida lo vencido', () => {
  const old: Signal = { kind: 'view', art: 'comida' as never, at: NOW - 100 * DAY };
  const r = addSignal([old], { kind: 'search', art: 'barberia' as never, at: NOW });
  assert.deepEqual(r.map((s) => s.kind), ['search']);
  const many = Array.from({ length: MAX_SIGNALS + 5 }, (_, i) => ({ kind: 'view', art: 'comida', at: NOW - i }) as Signal);
  assert.equal(addSignal(many, { kind: 'view', art: 'comida' as never, at: NOW }).length, MAX_SIGNALS);
});

test('myInterests: lo que más buscas manda, y lo viejo pesa menos', () => {
  const s: Signal[] = [
    { kind: 'search', art: 'barberia' as never, at: NOW },
    { kind: 'search', art: 'barberia' as never, at: NOW - DAY },
    { kind: 'view', art: 'comida' as never, at: NOW - 30 * DAY },
  ];
  const m = myInterests(s, NOW);
  assert.equal(m.get('barberia' as never), 1);
  assert.ok((m.get('comida' as never) ?? 0) < 0.1);
  assert.equal(myInterests([], NOW).size, 0);
});

test('peopleInterests: el primer término pesa más, y varios del mismo tipo suman', () => {
  const match = (t: string) => (art(t) === 'tienda' ? null : art(t));
  const a = peopleInterests(['corte de pelo', 'almuerzo', 'xyz'], match);
  assert.equal(a.get('barberia' as never), 1);
  assert.ok((a.get('comida' as never) ?? 0) < 1);
  const b = peopleInterests(['corte de pelo', 'almuerzo', 'jugos'], match);
  assert.equal(b.get('comida' as never), 1); // almuerzo + jugos
  assert.equal(b.has('tienda' as never), false);
});

test('forYou: lo tuyo primero, con su porqué, y no más de dos del mismo tipo', () => {
  const mine = myInterests([{ kind: 'search', art: 'barberia' as never, at: NOW }], NOW);
  const list = [biz('b1', 'Barbería', 200), biz('b2', 'Barbería', 400), biz('b3', 'Barbería', 600), biz('c1', 'Comida', 100)];
  const r = forYou(list, mine, new Map(), new Map(), art);
  assert.deepEqual(r.slice(0, 2).map((x) => x.item.id), ['b1', 'b2']);
  assert.equal(r[0].reason, 'Buscas barbería');
  // La fila se completa hasta 4 con lo abierto más cerca, diciendo por qué está.
  assert.deepEqual(r.slice(2).map((x) => [x.item.id, x.reason, x.source]), [['c1', 'Abierto cerca', 'cerca'], ['b3', 'Abierto cerca', 'cerca']]);
});

test('forYou: una sola sede por negocio', () => {
  const mine = myInterests([{ kind: 'search', art: 'comida' as never, at: NOW }], NOW);
  const list = [biz('r1', 'Comida', 200, true, 'El Rincón Samario'), biz('r2', 'Comida', 400, true, 'El Rincón Samario Mamatoco'), biz('v1', 'Comida', 500, true, 'Verde Vivo')];
  const r = forYou(list, mine, new Map(), new Map(), art);
  assert.deepEqual(r.map((x) => x.item.id), ['r1', 'v1']);
});

test('forYou: sin señales tuyas, lo que busca la gente; sin nada, no inventa', () => {
  const people = new Map([['comida' as never, 1]]);
  const r = forYou([biz('c1', 'Almuerzos'), biz('b1', 'Barbería')], new Map(), people, new Map(), art);
  assert.deepEqual(r.map((x) => [x.item.id, x.reason]), [['c1', 'Lo buscan cerca'], ['b1', 'Abierto cerca']]);
  assert.deepEqual(forYou([biz('c1', 'Almuerzos')], new Map(), new Map(), new Map(), art), []);
});

test('forYou: lo que ya miraste vuelve, y entra algo para descubrir', () => {
  const s: Signal[] = [
    { kind: 'search', art: 'barberia' as never, at: NOW },
    { kind: 'search', art: 'comida' as never, at: NOW },
    { kind: 'view', art: 'comida' as never, at: NOW, entityId: 'c2' },
  ];
  const list = [biz('b1', 'Barbería'), biz('b2', 'Barbería'), biz('c1', 'Comida'), biz('c2', 'Comida', 900), biz('u1', 'Uñas')];
  const people = new Map([['unas' as never, 1]]);
  // Con cuatro lugares, lo tuyo los llenaría todos: el tercero se cede a algo de otro tipo.
  const r = forYou(list, myInterests(s, NOW), people, seenBusinesses(s, NOW), art, 4);
  assert.equal(r.length, 4);
  assert.equal(r[0].item.id, 'c2');
  assert.equal(r[0].reason, 'Lo viste hace poco');
  assert.equal(r[2].item.id, 'u1');
  assert.equal(r[2].source, 'descubrir');
  assert.equal(r[2].reason, 'Lo buscan cerca');
});

test('forYouHeader explica de dónde sale la fila', () => {
  assert.deepEqual(forYouHeader(new Map([['barberia' as never, 1], ['comida' as never, 0.4]]), new Map()), { title: 'Para ti', sub: 'Por lo que más buscas: barbería y comida' });
  assert.deepEqual(forYouHeader(new Map(), new Map([['comida' as never, 1]])), { title: 'Lo que más se busca cerca', sub: 'Lo que la gente de tu barrio está buscando' });
  assert.equal(forYouHeader(new Map(), new Map()), null);
});
