/**
 * Concordancia del sistema (3.65): las pantallas de Empre AI usan solo la paleta, la única animación en bucle vive en
 * la Chispa y lo que se toca mide al menos 44 px. Se revisa el código, igual que la revisión de los tableros.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const SRC = join(import.meta.dirname, '..');
const read = (f: string) => readFileSync(join(SRC, f), 'utf8');

// La paleta: lo que define theme.ts más el blanco y los grises del anillo de la Chispa.
const THEME = new Set([...read('theme.ts').matchAll(/#[0-9A-Fa-f]{6}\b/g)].map((m) => m[0].toUpperCase()));
const LOGO = ['#FFFFFF', '#D9DCE1', '#CBCED4', '#EFF0F2', '#8E929A'];
const PALETTE = new Set([...THEME, ...LOGO]);

const SCREENS = [
  'components/ai/Chispa.tsx',
  'components/ai/VoiceOrb.tsx',
  'components/ai/EmpreAISheet.tsx',
  'components/ledger/VoiceSheet.tsx',
  'components/offers/AskManySheet.tsx',
  'components/chat/ChatVoices.tsx',
  'components/search/SearchFilters.tsx',
  'components/EmpreButton.tsx',
];

for (const f of SCREENS) {
  test(`${f}: solo colores de la paleta`, () => {
    const off = [...read(f).matchAll(/#[0-9A-Fa-f]{6}\b/g)].map((m) => m[0].toUpperCase()).filter((c) => !PALETTE.has(c));
    assert.deepEqual([...new Set(off)], [], `colores fuera de la paleta en ${f}`);
  });

  test(`${f}: lo que se toca mide al menos 44 px`, () => {
    const small = [...read(f).matchAll(/minHeight: (\d+)/g)].map((m) => Number(m[1])).filter((n) => n < 44);
    assert.deepEqual(small, [], `alturas mínimas por debajo de 44 en ${f}`);
  });
}

test('el único bucle de animación es el de la Chispa', () => {
  for (const f of SCREENS.filter((x) => !x.endsWith('Chispa.tsx'))) {
    assert.ok(!/Animated\.loop\(/.test(read(f)), `${f} tiene su propio bucle`);
  }
});
