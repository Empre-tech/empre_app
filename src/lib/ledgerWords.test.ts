import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pesosInWords } from './ledgerWords.ts';

test('pesosInWords (mismos casos que el servidor)', () => {
  const cases: [number, string][] = [
    [0, 'cero pesos'], [1, 'un peso'], [21, 'veintiún pesos'], [100, 'cien pesos'], [101, 'ciento un pesos'],
    [2500, 'dos mil quinientos pesos'], [25000, 'veinticinco mil pesos'], [21000, 'veintiún mil pesos'],
    [1000, 'mil pesos'], [150000, 'ciento cincuenta mil pesos'], [1000000, 'un millón de pesos'],
    [2000000, 'dos millones de pesos'], [1500000, 'un millón quinientos mil pesos'], [31000, 'treinta y un mil pesos'],
  ];
  for (const [n, want] of cases) assert.equal(pesosInWords(n), want, String(n));
});
