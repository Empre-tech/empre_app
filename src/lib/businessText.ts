import type { BusinessHour } from '@/api/types';

/**
 * «¿Qué negocio tienes? Escríbelo como lo dirías» (tablero «Primera vez», teléfono 3). Se entiende con reglas, sin
 * modelo de lenguaje: el tipo de negocio, los días y el horario, y el nombre si lo dice. Lo que no se entiende no se
 * inventa: queda para el formulario.
 */

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

// Palabras de todos los días que apuntan a una categoría (se compara con su nombre, sin tildes).
const HINTS: [RegExp, string[]][] = [
  [/\b(barberia|barbero|peluqueria|corte de pelo|cortes)\b/, ['barberia', 'peluqueria', 'belleza']],
  [/\b(unas|manicure|pedicure|spa|maquillaje|estetica)\b/, ['belleza', 'unas', 'estetica']],
  [/\b(restaurante|almuerzo|almuerzos|comida|corrientazo|asadero|pizzeria|hamburguesa|empanadas|fritos)\b/, ['restaurante', 'comida', 'alimentos']],
  [/\b(cafe|cafeteria|panaderia|pasteleria|reposteria|tortas)\b/, ['panaderia', 'cafe', 'comida']],
  [/\b(ropa|zapatos|calzado|tenis|boutique|accesorios)\b/, ['ropa', 'moda', 'tienda']],
  [/\b(tienda|minimercado|supermercado|abarrotes|miscelanea)\b/, ['tienda', 'mercado']],
  [/\b(taller|mecanico|motos|llantas|lavadero)\b/, ['taller', 'vehiculos', 'motos']],
  [/\b(drogueria|farmacia)\b/, ['drogueria', 'farmacia', 'salud']],
];

const DAYS: [RegExp, number][] = [
  [/^lun/, 1], [/^mar/, 2], [/^mie/, 3], [/^jue/, 4], [/^vie/, 5], [/^sab/, 6], [/^dom/, 0],
];
const DAY_NAMES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function dayOf(word: string): number | null {
  const w = norm(word);
  for (const [re, d] of DAYS) if (re.test(w)) return d;
  return null;
}

/** «9», «9:30», «8 pm» → minutos desde la medianoche; `after` ayuda a leer «de 9 a 8» como 9 am a 8 pm. */
function toMin(h: string, m: string | undefined, ampm: string | undefined, after?: number): number {
  let hour = Number(h);
  const min = m ? Number(m) : 0;
  const ap = ampm ? norm(ampm).replace(/\./g, '') : '';
  if (ap.startsWith('p') && hour < 12) hour += 12;
  if (ap.startsWith('a') && hour === 12) hour = 0;
  let t = hour * 60 + min;
  if (!ap && after !== undefined && t <= after) t += 12 * 60;
  return t;
}

const hhmm = (t: number) => `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
const clock = (t: number) => {
  const h = Math.floor(t / 60) % 24;
  const m = t % 60;
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
};

export interface ParsedHours {
  hours: BusinessHour[];
  text: string;
}

/** Los días y el horario: «de lunes a sábado de 9 a 8», «lunes a viernes 8am a 6pm», «todos los días de 7 a 7». */
export function parseHours(text: string): ParsedHours | null {
  const t = norm(text);
  const time = t.match(/(?:de\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?\s*(?:a|hasta|-)\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?/);
  if (!time) return null;
  const open = toMin(time[1], time[2], time[3]);
  const close = toMin(time[4], time[5], time[6], open);
  if (close <= open || close - open > 20 * 60) return null;

  let days: number[] = [];
  const range = t.match(/(lun\w*|mar\w*|mie\w*|jue\w*|vie\w*|sab\w*|dom\w*)\s*(?:a|hasta|-)\s*(lun\w*|mar\w*|mie\w*|jue\w*|vie\w*|sab\w*|dom\w*)/);
  if (/todos los dias|toda la semana|de lunes a domingo/.test(t)) days = [0, 1, 2, 3, 4, 5, 6];
  else if (range) {
    const a = dayOf(range[1]);
    const b = dayOf(range[2]);
    if (a === null || b === null) return null;
    for (let d = a; ; d = (d + 1) % 7) {
      days.push(d);
      if (d === b || days.length > 7) break;
    }
  } else return null;

  const hours: BusinessHour[] = Array.from({ length: 7 }, (_, weekday) =>
    days.includes(weekday)
      ? { weekday, closed: false, is_24h: false, open_time: hhmm(open), close_time: hhmm(close) }
      : { weekday, closed: true, is_24h: false, open_time: '', close_time: '' },
  );
  const span = days.length === 7 ? 'Todos los días' : `${cap(DAY_NAMES[days[0]])} a ${DAY_NAMES[days[days.length - 1]]}`;
  return { hours, text: `${span} · ${clock(open)} a ${clock(close)}` };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** El tipo de negocio entre las categorías de Empre: por su nombre en el texto o por palabras de todos los días. */
export function guessCategory<T extends { id: string; name: string }>(text: string, categories: T[]): T | null {
  const t = norm(text);
  const byName = categories.find((c) => {
    const n = norm(c.name);
    return t.includes(n) || n.split(/[\s,/y]+/).some((w) => w.length >= 5 && t.includes(w));
  });
  if (byName) return byName;
  for (const [re, keys] of HINTS) {
    if (!re.test(t)) continue;
    const hit = categories.find((c) => keys.some((k) => norm(c.name).includes(k)));
    if (hit) return hit;
  }
  return null;
}

/** El nombre, solo si lo dice: «se llama Barbería El Prado», «mi negocio es Casa Canoas». */
export function guessName(text: string): string | null {
  const m = text.match(/(?:se llama|se llamar[aá]|mi negocio es|el nombre es)\s+[«"']?([^,.«»"'\n]{2,40})/i);
  return m ? m[1].trim() : null;
}

export interface Understood {
  name: string | null;
  categoryId: string | null;
  categoryName: string | null;
  hours: ParsedHours | null;
  chips: { k: string; v: string }[];
}

export function understandBusiness<T extends { id: string; name: string }>(text: string, categories: T[]): Understood {
  const cat = guessCategory(text, categories);
  const hours = parseHours(text);
  const name = guessName(text);
  const chips = [
    ...(name ? [{ k: 'Nombre', v: name }] : []),
    ...(cat ? [{ k: 'Tipo', v: cat.name }] : []),
    ...(hours ? [{ k: 'Horario', v: hours.text }] : []),
  ];
  return { name, categoryId: cat?.id ?? null, categoryName: cat?.name ?? null, hours, chips };
}
