// Horas como las dice la gente: «12», «1», «1 y media», «1:30 pm», «mediodía». Sin imports: corre igual con `node --test`.
// El contexto decide lo que no se dijo: nadie almuerza a la 1 de la madrugada ni guarda silencio a las 9 de la mañana.

export interface ClockRange {
  start: string;
  end: string;
}

export type RangeResult = { ok: true; range: ClockRange | null } | { ok: false; field: 'start' | 'end'; message: string };

interface Spoken {
  h: number;
  m: number;
  /** Dijo am, pm o usó una hora de 24: ya no hay que adivinar. */
  sure: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
const toText = (mins: number) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

/** Lee una hora. null si no se entiende. */
export function readClock(text: string): Spoken | null {
  const t = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\./g, ':')
    .trim();
  if (!t) return null;
  if (/^(al )?medio ?dia$/.test(t) || t === '12 m') return { h: 12, m: 0, sure: true };
  if (/^(a )?media ?noche$/.test(t)) return { h: 0, m: 0, sure: true };
  const parsed = /^(?:las? )?(\d{1,2})(?::?(\d{2}))?(?: y (media|cuarto))?\s*(a ?:?m:?|p ?:?m:?|de la manana|de la tarde|de la noche)?$/.exec(t);
  if (!parsed) return null;
  let h = Number(parsed[1]);
  let m = parsed[2] ? Number(parsed[2]) : 0;
  if (parsed[3]) m = parsed[3] === 'media' ? 30 : 15;
  if (m > 59 || h > 23) return null;
  const suffix = (parsed[4] ?? '').replace(/[\s:]/g, '');
  const am = suffix === 'am' || suffix === 'delamanana';
  const pm = suffix === 'pm' || suffix === 'delatarde' || suffix === 'delanoche';
  if ((am || pm) && (h === 0 || h > 12)) return null;
  if (am && h === 12) h = 0;
  if (pm && h < 12) h += 12;
  return { h, m, sure: am || pm || h > 12 || h === 0 };
}

/** «3 y 30» también vale pegado: «130» es 1:30 y «1230» es 12:30. */
function readLoose(text: string): Spoken | null {
  const t = text.trim();
  const glued = /^(\d{1,2})(\d{2})$/.exec(t);
  return readClock(glued ? `${glued[1]}:${glued[2]}` : t);
}

const minutes = (s: Spoken, hours: number) => hours * 60 + s.m;

/** Un descanso en el día: lo que no dice am o pm cae entre las 7 am y las 6 pm. */
export function readDayRange(startText: string, endText: string): RangeResult {
  if (!startText.trim() && !endText.trim()) return { ok: true, range: null };
  const a = readLoose(startText);
  if (!a) return { ok: false, field: 'start', message: startText.trim() ? 'No entendí a qué hora empieza. Escribe algo como 12 o 12:30.' : 'Falta a qué hora empieza.' };
  const b = readLoose(endText);
  if (!b) return { ok: false, field: 'end', message: endText.trim() ? 'No entendí a qué hora termina. Escribe algo como 1 o 1:30.' : 'Falta a qué hora termina.' };
  const day = (s: Spoken) => (s.sure || s.h >= 7 ? s.h : s.h + 12);
  const start = minutes(a, day(a));
  let end = minutes(b, day(b));
  if (end <= start && !b.sure && b.h < 12) end += 12 * 60;
  if (end <= start || end > 24 * 60) return { ok: false, field: 'end', message: 'Termina antes de empezar. Revisa las dos horas.' };
  return { ok: true, range: { start: toText(start), end: toText(end) } };
}

/** Un silencio de noche: lo que no dice am o pm empieza en la noche y termina en la mañana. */
export function readNightRange(startText: string, endText: string): RangeResult {
  const a = readLoose(startText);
  if (!a) return { ok: false, field: 'start', message: startText.trim() ? 'No entendí desde qué hora. Escribe algo como 9 pm.' : 'Falta desde qué hora.' };
  const b = readLoose(endText);
  if (!b) return { ok: false, field: 'end', message: endText.trim() ? 'No entendí hasta qué hora. Escribe algo como 7 am.' : 'Falta hasta qué hora.' };
  const startH = a.sure ? a.h : a.h === 12 ? 0 : a.h + 12;
  const start = minutes(a, startH);
  const end = minutes(b, b.h);
  if (start === end) return { ok: false, field: 'end', message: 'Las dos horas son iguales. Elige horas distintas.' };
  return { ok: true, range: { start: toText(start), end: toText(end) } };
}

/** «1 pm», «12:30 m»; 12:00 es el mediodía. */
export function clockLabel(clock: string): string {
  const [h, m] = clock.split(':').map(Number);
  const mm = m ? `:${pad(m)}` : '';
  if (h === 0) return `12${mm} am`;
  if (h === 12) return `12${mm} m`;
  return h > 12 ? `${h - 12}${mm} pm` : `${h}${mm} am`;
}

/** «De 12 m a 1 pm · 1 hora». */
export function rangeWords(r: ClockRange): string {
  const toMin = (c: string) => {
    const [h, m] = c.split(':').map(Number);
    return h * 60 + m;
  };
  const span = (toMin(r.end) - toMin(r.start) + 24 * 60) % (24 * 60);
  const hours = Math.floor(span / 60);
  const mins = span % 60;
  const length = [hours ? (hours === 1 ? '1 hora' : `${hours} horas`) : '', mins ? `${mins} min` : ''].filter(Boolean).join(' y ');
  return `De ${clockLabel(r.start)} a ${clockLabel(r.end)} · ${length}`;
}
