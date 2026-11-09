// Familias de negocio (tablero «Cada negocio con su protagonista», plan 3.69). Sin React para probarlo con Node.
// La familia decide qué pieza va primero en el perfil y qué ayuda recibe el dueño al agregar. Sale de datos que ya
// existen (tipo de negocio, categoría y lo que vende): no se guarda aparte ni se inventa nada.

import type { BusinessProfile, ServiceItem } from './catalog.ts';

export type Family = 'cita' | 'comida' | 'cotizar' | 'tienda';

/** Sin tildes, sin «ñ», en minúsculas. */
function plain(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ñ/gi, 'n')
    .toLowerCase()
    .trim();
}

/** Categorías donde el trabajo casi siempre se cotiza antes (reparaciones, a domicilio, eventos). */
const QUOTE_CATEGORIES = ['servicios del hogar', 'automotriz', 'tecnologia', 'eventos y fiestas', 'fotografia y diseno'];

/**
 * La familia del negocio. Comida y tienda salen del tipo guardado; un negocio de servicios es «con cita» si reserva
 * por Empre o su categoría vive de citas, y «a cotizar» si su categoría es de reparaciones o la mayoría de lo que
 * ofrece no tiene precio fijo («desde» o sin publicar).
 */
export function businessFamily(input: { profile?: BusinessProfile | null; category?: string | null; items?: Pick<ServiceItem, 'kind' | 'bookable' | 'price' | 'price_from'>[] }): Family {
  const { profile, category, items = [] } = input;
  if (profile === 'food') return 'comida';
  if (profile === 'shop' || profile === 'valuable') return 'tienda';
  const cat = plain(category ?? '');
  if (!profile || profile === 'other') {
    if (cat === 'restaurantes' || cat.startsWith('cafeterias') || cat.startsWith('bares')) return 'comida';
    if (cat === 'tiendas y comercio') return 'tienda';
  }
  const services = items.filter((i) => i.kind !== 'product');
  if (services.some((i) => i.bookable)) return 'cita';
  if (QUOTE_CATEGORIES.includes(cat)) return 'cotizar';
  const open = services.filter((i) => i.price === null || i.price === undefined || i.price_from).length;
  if (services.length >= 2 && open * 2 > services.length) return 'cotizar';
  if (!profile && items.length && items.every((i) => i.kind === 'product')) return 'tienda';
  return 'cita';
}

// ---------- A cotizar: «Cuéntale qué le pasa» ----------

/**
 * Cómo habla la gente de cada trabajo: si el nombre del servicio tiene la raíz de la izquierda, también lo encuentran
 * estas palabras. Reglas, sin IA (ver templates-before-llm).
 */
const SYNONYMS: [string, string[]][] = [
  ['fren', ['frenar', 'frena', 'chilla', 'pastilla', 'disco']],
  ['aceite', ['aceite', 'bota aceite', 'mantenimiento', 'revision']],
  ['llanta', ['llanta', 'pinch', 'neumatico', 'rueda']],
  ['bateri', ['bateria', 'no prende', 'no arranca', 'no enciende']],
  ['motor', ['motor', 'humo', 'ruido', 'recalienta', 'no prende']],
  ['electric', ['luz', 'corto', 'enchufe', 'toma', 'breaker', 'no prende']],
  ['plomer', ['fuga', 'gotea', 'tubo', 'llave', 'agua', 'taponad', 'desagüe', 'desague']],
  ['pantalla', ['pantalla', 'se rompio', 'vidrio', 'tactil', 'touch']],
  ['pintur', ['pintar', 'pintura', 'pared', 'humedad']],
  ['cerraj', ['llave', 'cerradura', 'chapa', 'puerta']],
  ['aire', ['aire', 'no enfria', 'calor', 'aire acondicionado']],
  ['nevera', ['nevera', 'no enfria', 'refrigerador']],
  ['lavadora', ['lavadora', 'no centrifuga', 'no lava']],
  ['computador', ['computador', 'portatil', 'lento', 'virus', 'no prende']],
  ['celular', ['celular', 'telefono', 'no carga', 'pantalla']],
];

/** Las palabras con las que encuentran un servicio: las del nombre (de 4 letras o más) y las de cómo se habla de él. */
export function itemKeywords(name: string): string[] {
  const n = plain(name);
  const own = n.split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
  const extra = SYNONYMS.filter(([root]) => n.includes(root)).flatMap(([, words]) => words);
  return [...new Set([...own, ...extra.map(plain)])];
}

/**
 * El servicio que más se parece a lo que escribió el cliente, o null. Necesita al menos 3 letras; gana el que
 * comparte más palabras (y, en empate, el primero de la lista del negocio).
 */
export function matchProblem<T extends Pick<ServiceItem, 'name'>>(text: string, items: T[]): T | null {
  const t = ` ${plain(text).replace(/[^a-z0-9 ]+/g, ' ')} `;
  if (t.trim().length < 3) return null;
  let best: T | null = null;
  let score = 0;
  for (const it of items) {
    const s = itemKeywords(it.name).filter((k) => t.includes(k.length < 5 ? ` ${k}` : k)).length;
    if (s > score) {
      best = it;
      score = s;
    }
  }
  return best;
}

/** El mensaje para el negocio con lo que contó el cliente (y el servicio que parece, si hay). */
export function problemMessage(text: string, item?: Pick<ServiceItem, 'name'> | null): string {
  const said = text.trim().replace(/\s+/g, ' ');
  const lead = said ? `Hola, ${said.charAt(0).toLocaleLowerCase('es') + said.slice(1)}${/[.?!]$/.test(said) ? '' : '.'}` : 'Hola.';
  return item ? `${lead} Creo que es para «${item.name}». ¿Me pueden cotizar?` : `${lead} ¿Me pueden cotizar?`;
}

// ---------- Del lado del dueño: «Escríbelo como lo dirías» ----------

export interface SpokenItem {
  name: string;
  /** Minutos, o null si no lo dijo. */
  duration: number | null;
  /** Pesos, o null si no lo dijo. */
  price: number | null;
  /** «desde 40 mil». */
  from: boolean;
}

/**
 * Lee una línea como la diría el dueño: «corte con lavado 30 min 20 mil», «manicure media hora 25 mil»,
 * «barba 15000», «frenos desde 40 mil», «tinte 1 hora y media». Lo que no entiende queda en el nombre.
 */
export function parseSpoken(raw: string): SpokenItem {
  let rest = ` ${raw.toLowerCase().replace(/\s+/g, ' ')} `;
  let duration: number | null = null;
  let price: number | null = null;
  let from = false;
  const take = (re: RegExp): RegExpMatchArray | null => {
    const m = rest.match(re);
    if (m) rest = rest.replace(m[0], ' ');
    return m;
  };
  if (take(/\b(desde|a partir de)\b/)) from = true;
  if (take(/\bmedia hora\b/)) duration = 30;
  const hm = take(/\b(\d+)\s*(?:h|hr|hora|horas)\s*(?:y\s*media)?\b/);
  if (hm && duration === null) duration = Number(hm[1]) * 60 + (/media/.test(hm[0]) ? 30 : 0);
  const mm = take(/\b(\d+)\s*(?:m|min|mins|minuto|minutos)\b/);
  if (mm) duration = (duration ?? 0) + Number(mm[1]);
  const mil = take(/\$?\s*(\d+(?:[.,]\d+)?)\s*(?:mil|lucas|k)\b/);
  if (mil) price = Math.round(Number(mil[1].replace(',', '.')) * 1000);
  if (price === null) {
    const num = take(/\$?\s*(\d{1,3}(?:\.\d{3})+|\d{4,})\b/);
    if (num) price = Number(num[1].replace(/\./g, ''));
  }
  if (duration !== null && (duration < 5 || duration > 480)) duration = null;
  if (price !== null && price > 10_000_000) price = null;
  const words = rest
    .replace(/\s+(de|por|a|y|con)\s*$/g, ' ')
    .replace(/[,;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const name = words ? words.charAt(0).toLocaleUpperCase('es') + words.slice(1) : '';
  return { name, duration, price, from };
}

/** Lo que suelen tener los negocios de cada familia, para agregar con un toque (sin precio: lo pone el dueño). */
export function starterItems(family: Family, category?: string | null): { name: string; duration?: number }[] {
  const cat = plain(category ?? '');
  if (family === 'cita' && cat.startsWith('belleza')) {
    return [
      { name: 'Corte clásico', duration: 30 },
      { name: 'Arreglo de barba', duration: 30 },
      { name: 'Corte + barba', duration: 45 },
      { name: 'Cejas', duration: 15 },
    ];
  }
  if (family === 'cotizar' && cat === 'automotriz') return [{ name: 'Cambio de aceite', duration: 30 }, { name: 'Frenos', duration: 60 }, { name: 'Revisión general', duration: 60 }];
  if (family === 'cotizar' && cat === 'servicios del hogar') return [{ name: 'Visita de diagnóstico', duration: 60 }, { name: 'Arreglo de fuga' }, { name: 'Instalación eléctrica' }];
  if (family === 'cotizar' && cat === 'tecnologia') return [{ name: 'Cambio de pantalla' }, { name: 'Mantenimiento de computador' }, { name: 'Revisión sin costo' }];
  return [];
}
