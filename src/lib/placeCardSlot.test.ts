import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dayWhen, nextSlotText } from './placeCard.ts';

const now = new Date('2026-11-05T14:00:00-05:00'); // jueves

test('dayWhen dice el día como en la agenda, en hora de Colombia', () => {
  assert.equal(dayWhen(new Date('2026-11-05T21:00:00-05:00'), now), 'hoy');
  assert.equal(dayWhen(new Date('2026-11-06T08:00:00-05:00'), now), 'mañana');
  assert.equal(dayWhen(new Date('2026-11-07T10:00:00-05:00'), now), 'el sábado');
  assert.equal(dayWhen(new Date('2026-11-20T10:00:00-05:00'), now), null);
  assert.equal(dayWhen(new Date('2026-11-04T10:00:00-05:00'), now), null);
});

test('nextSlotText dice cuándo en hora de Colombia', () => {
  assert.equal(nextSlotText('2026-11-05T16:30:00-05:00', now), 'Hora libre hoy a las 4:30 pm');
  assert.equal(nextSlotText('2026-11-06T13:00:00-05:00', now), 'Hora libre mañana a la 1 pm');
  assert.equal(nextSlotText('2026-11-09T09:00:00-05:00', now), 'Hora libre el lunes a las 9 am');
});

test('nextSlotText calla sin dato, en el pasado o muy lejos', () => {
  assert.equal(nextSlotText(undefined, now), null);
  assert.equal(nextSlotText('2026-11-05T10:00:00-05:00', now), null);
  assert.equal(nextSlotText('2026-11-20T10:00:00-05:00', now), null);
  assert.equal(nextSlotText('no es fecha', now), null);
});
