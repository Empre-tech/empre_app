/**
 * Una vuelta por el barrio (tablero «Mis salidas y Plan», teléfonos 2 a 4): la persona escribe lo que tiene que hacer
 * («almorzar, cortarme el pelo y comprar unos tenis, antes de las 6»), se separa en paradas, cada una se busca en
 * Empre (abierto, cerca) y se ordena a pie. Todo con reglas: nada de modelo de lenguaje.
 */

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export interface Errand {
  /** Como lo dijo: «cortarme el pelo». */
  label: string;
  /** Lo que se busca en Empre: «corte de pelo». */
  q: string;
  /** Lo que tarda allá, en minutos. */
  stay: number;
}

// Verbos y frases de todos los días → lo que se busca y cuánto se queda uno.
const MAP: [RegExp, string, number][] = [
  [/almorz|almuerzo/, 'almuerzo', 45],
  [/desayun/, 'desayuno', 30],
  [/cenar|comida/, 'comida', 45],
  [/cafe|tinto/, 'cafe', 20],
  [/cort\w* (el )?pelo|motilar|peluquer|barber/, 'corte de pelo', 30],
  [/barba/, 'barba', 20],
  [/unas|manicure|pedicure/, 'manicure', 45],
  [/drogueria|remedio|medicamento|pastillas/, 'drogueria', 10],
  [/mercado|mercar|supermercado/, 'supermercado', 25],
  [/lavar (la )?moto|lavar (el )?carro|lavadero/, 'lavadero', 30],
  [/aceite|taller|mecanic/, 'taller', 40],
];
const FILLER = /\b(comprar|compro|ir a|ir al|pasar por|buscar|unos|unas|un|una|el|la|los|las|me|mi|mis|de|del|algo|que|tengo|hoy|para)\b/g;

/** «antes de las 6» → minutos desde la medianoche (6 pm si no dice am). */
export function deadlineOf(text: string): number | null {
  const m = norm(text).match(/antes de las? (\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!m) return null;
  let h = Number(m[1]);
  if (m[3] === 'pm' && h < 12) h += 12;
  if (!m[3] && h < 8) h += 12; // «antes de las 6» es de la tarde
  return h * 60 + (m[2] ? Number(m[2]) : 0);
}

/** Separa lo escrito en paradas: por comas, «y», «luego», «después». */
export function parseErrands(text: string): Errand[] {
  const body = text.replace(/,?\s*antes de las? [^,]*$/i, '');
  const parts = body
    .split(/,|\by\b|\bluego\b|\bdespu[eé]s\b|\btambi[eé]n\b|;/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 2);
  const out: Errand[] = [];
  for (const label of parts) {
    const n = norm(label);
    const hit = MAP.find(([re]) => re.test(n));
    const q = hit ? hit[1] : n.replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
    if (!q || out.some((e) => e.q === q)) continue;
    out.push({ label, q, stay: hit ? hit[2] : 20 });
  }
  return out.slice(0, 5);
}

export interface Place {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  hasOffer?: boolean;
}

export interface Leg<T extends Place = Place> {
  errand: Errand;
  place: T;
  /** Minutos caminando desde la parada anterior (o desde donde estás). */
  walk: number;
  /** Llegada y salida, en minutos desde la medianoche. */
  arrive: number;
  leave: number;
  meters: number;
}

const WALK_M_PER_MIN = 80;

function meters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Ordena las paradas a pie: siempre la más cercana a donde quedaste (con oferta primero si empatan), y les pone hora.
 * `start` y la respuesta van en minutos desde la medianoche.
 */
export function buildRoute<T extends Place>(from: { latitude: number; longitude: number }, picks: { errand: Errand; place: T }[], start: number): Leg<T>[] {
  const left = [...picks];
  const out: Leg<T>[] = [];
  let here = from;
  let t = start;
  while (left.length) {
    left.sort((a, b) => meters(here, a.place) - meters(here, b.place) || Number(Boolean(b.place.hasOffer)) - Number(Boolean(a.place.hasOffer)));
    const next = left.shift()!;
    const m = meters(here, next.place);
    const walk = Math.max(1, Math.round(m / WALK_M_PER_MIN));
    const arrive = t + walk;
    out.push({ errand: next.errand, place: next.place, walk, arrive, leave: arrive + next.errand.stay, meters: Math.round(m) });
    t = arrive + next.errand.stay;
    here = next.place;
  }
  return out;
}

/** «2 h 10 min · 1,4 km a pie». */
export function routeSummary(legs: Leg[]): string {
  if (!legs.length) return '';
  const total = legs[legs.length - 1].leave - (legs[0].arrive - legs[0].walk);
  const km = legs.reduce((s, l) => s + l.meters, 0) / 1000;
  const h = Math.floor(total / 60);
  const dur = h ? `${h} h${total % 60 ? ` ${total % 60} min` : ''}` : `${total} min`;
  return `${dur} · ${km.toFixed(1).replace('.', ',')} km a pie`;
}

/** «2:15 pm». */
export function clockOf(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** En camino: cuándo salir para llegar a tiempo a la siguiente parada. */
export function leaveIn(leg: Leg, now: number): number {
  return leg.arrive - leg.walk - now;
}
