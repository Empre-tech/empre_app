/**
 * «Pregúntales a los N» (3.64): una pregunta a varios negocios cercanos que ofrecen lo mismo, respondida con
 * plantillas sobre lo que cada uno publicó en la Vitrina (precio, duración, si atiende ahora y su oferta). Nada de IA
 * aquí: la intención llega ya resuelta (tocada, por reglas o, como último recurso, clasificada en el servidor una sola
 * vez). Si un negocio no publicó el dato, se dice y se ofrece preguntarle al dueño. Sin React para probarlo con Node.
 */
import type { Intent } from './answers';
import type { MarketItem } from './offerMarket';

export type ManyIntent = 'price' | 'open' | 'offers' | 'duration';

/** El negocio de la ficha y hasta 3 más: lo que cabe en una pantalla sin desplazarse. */
export const MANY_MAX = 4;

export interface ManyRow {
  entityId: string;
  name: string;
  item: MarketItem;
  open: boolean | null;
  dist: string | null;
  priceNum: number | null;
  price: string | null;
  minutes: number | null;
  offer: string | null;
  openUntil: string | null;
}

export interface ManyLine {
  row: ManyRow;
  /** El dato que responde la pregunta; null si el negocio no lo publicó. */
  main: string | null;
  sub: string;
  known: boolean;
}

export interface ManyAnswer {
  intent: ManyIntent | 'unknown';
  /** Frase corta: `lead` + `bold` (lo importante) + `tail`. */
  summary: { lead: string; bold: string; tail: string };
  top: ManyLine | null;
  topTag: string;
  rest: ManyLine[];
  /** Los que no publicaron el dato: a ellos se les puede preguntar por chat. */
  missing: ManyRow[];
}

const plain = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const STOP = new Set(['para', 'con', 'sin', 'del', 'los', 'las', 'una', 'uno', 'por']);

/** Raíces de 5 letras de las palabras que importan («Cortes clásicos» y «Corte clásico» dan lo mismo). */
function roots(t: string): string[] {
  return [...new Set(plain(t).split(' ').filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.slice(0, 5)))];
}

/** Mismo producto: las mismas palabras que importan, en cualquier orden. */
export function sameItem(a: string, b: string): boolean {
  const ra = roots(a);
  const rb = roots(b);
  return ra.length > 0 && ra.length === rb.length && ra.every((r) => rb.includes(r));
}

const openRank = (o: boolean | null) => (o === true ? 0 : o === null ? 1 : 2);

/** Abiertos primero y luego los más cerca. Nadie paga por subir. */
export function orderRows<T extends Pick<ManyRow, 'open' | 'item'>>(rows: T[]): T[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((x, y) => openRank(x.r.open) - openRank(y.r.open) || (x.r.item.distance_meters ?? Infinity) - (y.r.item.distance_meters ?? Infinity) || x.i - y.i)
    .map((x) => x.r);
}

/**
 * Los negocios que ofrecen lo mismo que `item`: él primero y hasta `max - 1` más de la Vitrina cargada, uno por
 * negocio. Solo productos y servicios del catálogo (una oferta es de un solo negocio).
 */
export function sameItemPeers(item: MarketItem, pool: MarketItem[], max = MANY_MAX): MarketItem[] {
  if (item.kind !== 'service') return [item];
  const seen = new Set([item.entity_id]);
  const others: MarketItem[] = [];
  for (const it of pool) {
    if (it.kind !== 'service' || seen.has(it.entity_id) || !sameItem(item.title, it.title)) continue;
    seen.add(it.entity_id);
    others.push(it);
  }
  const ordered = orderRows(others.map((o) => ({ item: o, open: o.open_now ?? null }))).map((x) => x.item);
  return [item, ...ordered.slice(0, max - 1)];
}

/** «$25.000» */
export const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-CO').replace(/,/g, '.');

function distLabel(m: number | null | undefined): string | null {
  if (m === null || m === undefined || m < 0) return null;
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

/** Lo que la Vitrina ya sabe de ese negocio para ese producto. Nada más. */
export function toRow(it: MarketItem): ManyRow {
  const n = it.service_price ?? null;
  return {
    entityId: it.entity_id,
    name: it.entity_name,
    item: it,
    open: it.open_now ?? null,
    dist: distLabel(it.distance_meters),
    priceNum: n,
    price: n === null ? null : n === 0 ? 'Gratis' : `${it.price_from ? 'Desde ' : ''}${pesos(n)}`,
    minutes: it.duration_min && it.duration_min > 0 ? it.duration_min : null,
    offer: it.linked_offer_title?.trim() || null,
    openUntil: it.open_until?.trim() || null,
  };
}

/** De una intención del motor de reglas a una que se puede responder para varios; null si no aplica. */
export function manyIntentOf(intent: Intent | string): ManyIntent | null {
  switch (intent) {
    case 'price':
    case 'services':
    case 'book':
      return 'price';
    case 'hours':
    case 'availability':
      return 'open';
    case 'offers':
      return 'offers';
    case 'duration':
      return 'duration';
    default:
      return null;
  }
}

export const MANY_LABEL: Record<ManyIntent, { ask: string; short: string }> = {
  price: { ask: '¿Cuánto cuesta en cada uno?', short: 'Precio en cada uno' },
  open: { ask: '¿Quién atiende ahora?', short: 'Quién atiende ahora' },
  offers: { ask: '¿Alguno tiene oferta?', short: 'Si alguno tiene oferta' },
  duration: { ask: '¿Cuánto demora?', short: 'Cuánto demora' },
};

/** Las preguntas que vale la pena sugerir: solo las que al menos un negocio puede responder con lo publicado. */
export function manySuggestions(rows: ManyRow[]): ManyIntent[] {
  const out: ManyIntent[] = [];
  if (rows.some((r) => r.price)) out.push('price');
  if (rows.some((r) => r.open !== null)) out.push('open');
  out.push('offers');
  if (rows.some((r) => r.minutes)) out.push('duration');
  return out;
}

function lineFor(intent: ManyIntent, r: ManyRow): ManyLine {
  const tail = (xs: (string | null)[]) => xs.filter(Boolean).join(' · ');
  switch (intent) {
    case 'price':
      return { row: r, main: r.price, sub: tail([r.minutes ? `${r.minutes} min` : null, r.dist]), known: Boolean(r.price) };
    case 'duration':
      return { row: r, main: r.minutes ? `${r.minutes} min` : null, sub: tail([r.price, r.dist]), known: Boolean(r.minutes) };
    case 'open':
      return { row: r, main: r.open === null ? null : r.open ? 'Abierto' : 'Cerrado', sub: tail([r.price, r.dist]), known: r.open !== null };
    case 'offers':
      return { row: r, main: r.price, sub: tail([r.price ? 'precio normal' : null, r.dist]), known: true };
  }
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** La respuesta para todos: frase corta, la mejor opción ahora, los demás y a quiénes falta preguntarles. */
export function answerMany(intent: ManyIntent, input: ManyRow[], product: string): ManyAnswer {
  const rows = orderRows(input);
  const n = rows.length;
  let lines = rows.map((r) => lineFor(intent, r));
  if (intent === 'offers') lines = lines.filter((l) => l.row.offer);
  const known = lines.filter((l) => l.known);
  const missing = lines.filter((l) => !l.known).map((l) => l.row);

  let top: ManyLine | null = known.find((l) => l.row.open === true) ?? null;
  if (intent === 'duration') {
    const open = known.filter((l) => l.row.open === true);
    top = open.length ? open.reduce((a, b) => ((b.row.minutes ?? 0) < (a.row.minutes ?? 0) ? b : a)) : null;
  }
  if (intent === 'offers') top = known.find((l) => l.row.open === true) ?? known[0] ?? null;
  const topTag = intent === 'offers' ? 'CON OFERTA' : intent === 'duration' ? 'EL MÁS RÁPIDO ABIERTO' : top?.row.dist ? 'ABIERTO Y MÁS CERCA' : 'ABIERTO AHORA';
  const rest = lines.filter((l) => l !== top);

  const s = { lead: '', bold: '', tail: '' };
  const k = known.length;
  if (intent === 'price') {
    if (!k) s.lead = `Ninguno publicó el precio de ${product}. Se lo puedo preguntar a los dueños.`;
    else {
      const nums = known.map((l) => l.row.priceNum ?? 0);
      const lo = Math.min(...nums);
      const hi = Math.max(...nums);
      const range = lo === hi ? `todos a ${pesos(lo)}` : `de ${pesos(lo)} a ${pesos(hi)}`;
      s.lead = k === 1 ? `Solo 1 de ${n} publicó su precio. ` : `${k} de ${n} publicaron su precio: ${range}. `;
      if (top) {
        s.lead += k === 1 ? '' : 'Abierto y más cerca: ';
        s.bold = `${top.row.name}, ${top.row.price}`;
        s.tail = '.';
      } else if (k === 1) {
        s.bold = `${known[0].row.name}, ${known[0].row.price}`;
        s.tail = '.';
      }
    }
  } else if (intent === 'open') {
    const openN = rows.filter((r) => r.open === true).length;
    if (!openN) s.lead = k ? `Ninguno atiende ahora según su horario.` : `No sé si atienden ahora: no publicaron su horario.`;
    else {
      s.lead = `${openN} ${plural(openN, 'atiende', 'atienden')} ahora. ${openN === 1 ? 'Es ' : 'El más cerca es '}`;
      s.bold = top?.row.name ?? '';
      s.tail = top?.row.openUntil ? `, abierto hasta las ${top.row.openUntil}.` : '.';
    }
  } else if (intent === 'offers') {
    if (!lines.length) s.lead = `Ninguno tiene una oferta publicada para ${product} ahora.`;
    else if (lines.length === 1) {
      s.lead = 'Solo ';
      s.bold = lines[0].row.name;
      s.tail = ` tiene oferta: ${lines[0].row.offer}. Su precio normal va aparte.`;
    } else {
      s.lead = `${lines.length} tienen oferta. ${top?.row.open ? 'La más cerca abierta: ' : 'La más cerca: '}`;
      s.bold = top?.row.name ?? '';
      s.tail = top ? `, ${top.row.offer}.` : '.';
    }
  } else {
    if (!k) s.lead = `Ninguno publicó cuánto demora. Se lo puedo preguntar a los dueños.`;
    else {
      const mins = known.map((l) => l.row.minutes ?? 0);
      const lo = Math.min(...mins);
      const hi = Math.max(...mins);
      s.lead = k === 1 ? `Solo 1 lo publicó: ${lo} min. ` : lo === hi ? `Todos tardan ${lo} min según lo publicado. ` : `Entre ${lo} y ${hi} min según lo publicado. `;
      if (top && k > 1) {
        s.lead += 'El más rápido abierto ahora: ';
        s.bold = `${top.row.name}, ${top.row.minutes} min`;
        s.tail = '.';
      }
    }
  }
  return { intent, summary: s, top, topTag, rest, missing };
}

/** Lo que no está en lo publicado: nadie lo adivina; se ofrece preguntarles a todos. */
export function unknownMany(rows: ManyRow[]): ManyAnswer {
  return {
    intent: 'unknown',
    summary: { lead: 'Eso no está en lo que publicaron. ', bold: 'Se lo puedo preguntar a los dueños', tail: ' por chat.' },
    top: null,
    topTag: '',
    rest: [],
    missing: orderRows(rows),
  };
}

/** El mensaje que le llega al dueño, ya escrito. */
export function askDraft(intent: ManyIntent | 'unknown', product: string, text?: string): string {
  switch (intent) {
    case 'price':
      return `Hola, ¿cuánto cuesta ${product}?`;
    case 'duration':
      return `Hola, ¿cuánto demora ${product}?`;
    case 'open':
      return `Hola, ¿están atendiendo ahora? Me interesa ${product}.`;
    case 'offers':
      return `Hola, ¿tienen alguna oferta en ${product}?`;
    default: {
      const q = (text ?? '').trim();
      if (!q) return `Hola, tengo una pregunta sobre ${product}.`;
      const i = q.search(/[^¿¡\s]/);
      const body = i < 0 ? q : `${q.slice(0, i)}${q.charAt(i).toLocaleLowerCase('es')}${q.slice(i + 1)}`;
      return `Hola, ${body} (sobre ${product})`;
    }
  }
}
