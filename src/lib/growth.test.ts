import assert from 'node:assert/strict';
import { test } from 'node:test';
import { growthView, missingLine } from './growth.ts';

const KEYS = ['photo', 'cover', 'photos', 'hours', 'tagline', 'description', 'catalog', 'offer'] as const;
const all = (done: string[]) =>
  growthView(
    KEYS.map((key) => ({
      key,
      group: key === 'catalog' || key === 'offer' ? ('sell' as const) : key === 'hours' || key === 'tagline' ? ('found' as const) : ('look' as const),
      done: done.includes(key),
    })),
  );

test('missingLine dice cuántos faltan y los dos primeros', () => {
  assert.deepEqual(missingLine(all(['photo', 'cover', 'photos', 'tagline', 'description', 'catalog'])), {
    count: 2,
    title: 'Te faltan 2 para completar tu perfil',
    sub: 'Horario de atención y tu primera oferta',
  });
  assert.equal(missingLine(all(['photo', 'cover', 'photos', 'hours', 'tagline', 'description', 'catalog']))?.title, 'Te falta 1 para completar tu perfil');
  assert.equal(missingLine(all(['photo']))?.sub, 'Foto de portada, 3 fotos de tu negocio y 5 más');
});

test('missingLine no dice nada cuando está completo o sin datos', () => {
  assert.equal(missingLine(all([...KEYS])), null);
  assert.equal(missingLine(undefined), null);
  assert.equal(missingLine(growthView([])), null);
});
