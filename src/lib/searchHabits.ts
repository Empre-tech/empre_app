/**
 * Lo que más buscas, contado solo en este teléfono (3.59). Nada de esto sale del teléfono: las búsquedas que llegan al
 * servidor siguen siendo anónimas (`POST /api/events`).
 */
export interface SearchHabit {
  /** La búsqueda como la escribiste la última vez. */
  term: string;
  /** Clave sin mayúsculas ni tildes, para contar «Droguería» y «drogueria» como lo mismo. */
  key: string;
  n: number;
  /** Última vez, en milisegundos. */
  last: number;
}

const DAY = 24 * 60 * 60 * 1000;
export const HABIT_WINDOW_DAYS = 30;
const MAX_HABITS = 40;

export function habitKey(q: string): string {
  return q
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

/** La lista con esta búsqueda contada una vez más; borra lo que pasó de 30 días. */
export function recordSearch(list: SearchHabit[], q: string, now: number): SearchHabit[] {
  const key = habitKey(q);
  if (key.length < 2) return list;
  const fresh = list.filter((h) => now - h.last <= HABIT_WINDOW_DAYS * DAY && h.key !== key);
  const prev = list.find((h) => h.key === key && now - h.last <= HABIT_WINDOW_DAYS * DAY);
  const next: SearchHabit = { term: q.trim(), key, n: (prev?.n ?? 0) + 1, last: now };
  return [next, ...fresh].slice(0, MAX_HABITS);
}

/**
 * Las búsquedas que más repites en los últimos 30 días, de la más fuerte a la más débil. Cuenta más lo reciente: una
 * búsqueda de esta semana pesa el doble que una de hace un mes.
 */
export function topHabits(list: SearchHabit[], now: number, k = 3): SearchHabit[] {
  return list
    .filter((h) => now - h.last <= HABIT_WINDOW_DAYS * DAY)
    .map((h) => ({ h, w: h.n * (1 + Math.max(0, 1 - (now - h.last) / (HABIT_WINDOW_DAYS * DAY))) }))
    .sort((a, b) => b.w - a.w || b.h.last - a.h.last)
    .slice(0, k)
    .map((x) => x.h);
}

/** Lo que se puede leer del archivo: cualquier cosa rara se descarta. */
export function parseHabits(raw: unknown): SearchHabit[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (x): x is SearchHabit =>
      typeof x === 'object' &&
      x !== null &&
      typeof (x as SearchHabit).term === 'string' &&
      typeof (x as SearchHabit).key === 'string' &&
      typeof (x as SearchHabit).n === 'number' &&
      typeof (x as SearchHabit).last === 'number',
  );
}
