import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FINANCE_PAIRS } from '../finance/palette.ts';
import { colors } from '../theme.ts';
import { contrastRatio, meetsAA, parseHex } from './contrast.ts';

test('razones de contraste conocidas', () => {
  assert.equal(Math.round(contrastRatio('#000000', '#FFFFFF')), 21);
  assert.equal(contrastRatio('#777', '#777'), 1);
  assert.ok(Math.abs(contrastRatio('#767676', '#FFFFFF') - 4.54) < 0.01);
  assert.deepEqual(parseHex('#abc'), [170, 187, 204]);
  assert.throws(() => parseHex('rgba(0,0,0,.5)'));
});

test('cada par de color de Empre Finance pasa AA', () => {
  const table = colors as unknown as Record<string, string>;
  const failing = FINANCE_PAIRS.filter((p) => {
    const fg = table[p.fg];
    const bg = table[p.bg];
    assert.ok(fg && bg, `token inexistente en ${p.fg}/${p.bg}`);
    return !meetsAA(fg, bg, p.use !== 'text');
  }).map((p) => `${p.fg} sobre ${p.bg} (${p.where}): ${contrastRatio(table[p.fg], table[p.bg]).toFixed(2)}:1`);
  assert.deepEqual(failing, []);
});
