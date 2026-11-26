// Ley 2300 de 2023 («Dejen de fregar»), arts. 3 y 5: los mensajes de cobro y los comerciales o publicitarios solo de
// lunes a viernes de 7:00 a. m. a 7:00 p. m. y sábados de 8:00 a. m. a 3:00 p. m.; nunca domingos ni festivos; y no
// más de una vez al día por persona. El ticket de una compra no entra (es información de lo que compró). Hora de
// Colombia. Sin imports de la app: corre con `node --test`.

export type ContactKind = 'debt' | 'offer';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Domingo de Pascua (algoritmo de Meeus/Butcher), en UTC. */
function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const key = (d: Date) => iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
/** Ley Emiliani (Ley 51 de 1983): el festivo que no cae lunes pasa al lunes siguiente. */
const nextMonday = (d: Date) => addDays(d, (8 - d.getUTCDay()) % 7);

/** Los festivos de Colombia de un año, como «AAAA-MM-DD». */
export function holidaysCO(year: number): Set<string> {
  const fixed = [
    [1, 1],
    [5, 1],
    [7, 20],
    [8, 7],
    [12, 8],
    [12, 25],
  ].map(([m, d]) => iso(year, m, d));
  const moved = [
    [1, 6],
    [3, 19],
    [6, 29],
    [8, 15],
    [10, 12],
    [11, 1],
    [11, 11],
  ].map(([m, d]) => key(nextMonday(new Date(Date.UTC(year, m - 1, d)))));
  const e = easter(year);
  const easterBased = [addDays(e, -3), addDays(e, -2), addDays(e, 43), addDays(e, 64), addDays(e, 71)].map(key);
  return new Set([...fixed, ...moved, ...easterBased]);
}

/** La fecha y hora de Colombia (UTC−5, sin horario de verano) de un instante. */
function colombia(at: Date): { day: string; weekday: number; minutes: number; year: number } {
  const t = new Date(at.getTime() - 5 * 3_600_000);
  return { day: key(t), weekday: t.getUTCDay(), minutes: t.getUTCHours() * 60 + t.getUTCMinutes(), year: t.getUTCFullYear() };
}

/** El día en Colombia («AAAA-MM-DD»): para contar un mensaje por persona al día. */
export function dayCO(at: Date): string {
  return colombia(at).day;
}

/**
 * Por qué no se puede mandar ahora un cobro o una oferta, o null si se puede. `lastSentDay` es el día (en Colombia) del
 * último mensaje de cobro u oferta a esa persona.
 */
export function contactProblem(at: Date, lastSentDay?: string | null): string | null {
  const c = colombia(at);
  const rule = 'Por ley (Ley 2300 de 2023), los cobros y las ofertas solo se mandan de lunes a viernes de 7 a. m. a 7 p. m. y los sábados de 8 a. m. a 3 p. m.';
  if (c.weekday === 0 || holidaysCO(c.year).has(c.day)) return `Hoy es ${c.weekday === 0 ? 'domingo' : 'festivo'}. ${rule}`;
  const [from, to] = c.weekday === 6 ? [8 * 60, 15 * 60] : [7 * 60, 19 * 60];
  if (c.minutes < from || c.minutes >= to) return `Ya no es horario para escribirle. ${rule}`;
  if (lastSentDay && lastSentDay === c.day) return 'Ya le escribiste hoy un cobro o una oferta: por ley, máximo una vez al día por persona.';
  return null;
}
